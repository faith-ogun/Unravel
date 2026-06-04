"""The FHIR R4 patient registry (Firestore), and the seeded Lynch demo cohort.

Unravel watches the evidence commons on behalf of a clinic's real patients. That
clinic is modelled here as a registry of FHIR R4 resources in Firestore:

  - Patient                 the people (proband, at-risk relatives, cohort).
  - Observation             each carrier's variant, recorded with the
                            classification known AT TEST TIME (the registry's
                            memory, which is what goes stale).
  - FamilyMemberHistory     the proband's pedigree.

The gap Unravel closes is the distance between an Observation's *recorded*
classification and the *current* evidence. detect_reclassifications() diffs the
two; build_evidence_ledger() + the Adjudicator decide whether the change is real
and actionable.

The seeded cohort centres on Diane Okafor, who carries MLH1 c.114C>G
(p.Asn38Lys), recorded as a VUS at her 2019 colorectal-cancer work-up. ClinVar
has since reclassified that variant to Pathogenic (3-star, expert panel), but the
news never reached Diane's family. The cohort also contains three "silent Dianes"
carrying the same variant, a deceased carrier (for the Steward's ethics branch),
a 1-star "trap" carrier whose tempting variant must be withheld, and benign /
unrelated cohort filler. Every variant is a real ClinVar/Lynch variant present in
the evidence warehouse, so the registry and the science line up.

Genomic variants are stored on the Observation as a single component (LOINC
81252-9) carrying the canonical `chrom-pos-ref-alt` GRCh38 id, so the agent tools
can reconstruct a VariantKey without parsing HGVS.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .evidence import VariantKey

PROJECT = "unravel-ra"
COLLECTIONS = ("Patient", "Observation", "FamilyMemberHistory")

LOINC = "http://loinc.org"
V3_ROLE = "http://terminology.hl7.org/CodeSystem/v3-RoleCode"
RELATIVE_OF_URL = "https://unravel.health/fhir/relative-of"


# --- variant specs (all real, all in the warehouse) ----------------------------


@dataclass(frozen=True)
class VariantSpec:
    gid: str           # canonical GRCh38 id "chrom-pos-ref-alt"
    gene: str
    hgvs_c: str
    hgvs_p: str
    current: str       # current ClinVar classification (for narration)

    @property
    def key(self) -> VariantKey:
        chrom, pos, ref, alt = self.gid.split("-")
        return VariantKey(chrom, int(pos), ref, alt)


HERO = VariantSpec("3-36993661-C-G", "MLH1", "c.114C>G", "p.Asn38Lys", "Pathogenic")
TRAP = VariantSpec("3-37001040-G-A", "MLH1", "c.293G>A", "p.Gly98Asp",
                   "Conflicting classifications of pathogenicity")
MSH2_LP = VariantSpec("2-47478312-G-C", "MSH2", "c.2251G>C", "p.Gly751Arg", "Likely pathogenic")
MLH1_BENIGN = VariantSpec("3-37012077-A-G", "MLH1", "c.655A>G", "p.Ile219Val", "Benign")
MSH6_BENIGN = VariantSpec("2-47783349-G-A", "MSH6", "c.116G>A", "p.Gly39Glu", "Benign")
EPCAM_BENIGN = VariantSpec("2-47373967-T-C", "EPCAM", "c.344T>C", "p.Met115Thr", "Benign")


# --- FHIR builders -------------------------------------------------------------


def _patient(pid, family, given, gender, birth, *, deceased=False,
             role=None, relative_of=None, relationship=None, conditions=None):
    res = {
        "resourceType": "Patient",
        "id": pid,
        "name": [{"family": family, "given": [given]}],
        "gender": gender,
        "birthDate": birth,
        "deceasedBoolean": deceased,
    }
    extensions = []
    if role:
        extensions.append({"url": "https://unravel.health/fhir/role", "valueString": role})
    if relative_of:
        extensions.append({
            "url": RELATIVE_OF_URL,
            "extension": [
                {"url": "proband", "valueReference": {"reference": f"Patient/{relative_of}"}},
                {"url": "relationship", "valueString": relationship or "relative"},
            ],
        })
    if extensions:
        res["extension"] = extensions
    if conditions:
        res["_conditions"] = conditions  # convenience, not strict FHIR
    return res


def _observation(oid, patient_id, variant: VariantSpec, recorded_class, recorded_date):
    return {
        "resourceType": "Observation",
        "id": oid,
        "status": "final",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
            "code": "laboratory", "display": "Laboratory",
        }]}],
        "code": {"coding": [{"system": LOINC, "code": "69548-6",
                             "display": "Genetic variant assessment"}]},
        "subject": {"reference": f"Patient/{patient_id}"},
        "effectiveDateTime": recorded_date,
        "valueCodeableConcept": {"coding": [{"system": LOINC, "code": "LA9633-4",
                                             "display": "Present"}]},
        "component": [
            _comp("48018-6", "Gene studied", variant.gene),
            _comp("48004-6", "DNA change c.HGVS", variant.hgvs_c),
            _comp("48005-3", "Amino acid change p.HGVS", variant.hgvs_p),
            _comp("81252-9", "Genomic DNA change (gNomen)", variant.gid),
            _comp("53037-8", "Genetic variation clinical significance", recorded_class),
        ],
    }


def _comp(code, display, value):
    return {
        "code": {"coding": [{"system": LOINC, "code": code, "display": display}]},
        "valueString": value,
    }


def _family_history(fid, proband_id, relationship_code, relationship_display,
                    *, deceased=False, condition=None, onset_age=None):
    res = {
        "resourceType": "FamilyMemberHistory",
        "id": fid,
        "status": "completed",
        "patient": {"reference": f"Patient/{proband_id}"},
        "relationship": {"coding": [{"system": V3_ROLE, "code": relationship_code,
                                     "display": relationship_display}]},
        "deceasedBoolean": deceased,
    }
    if condition:
        c = {"code": {"text": condition}}
        if onset_age is not None:
            c["onsetAge"] = {"value": onset_age, "unit": "yr",
                             "system": "http://unitsofmeasure.org", "code": "a"}
        res["condition"] = [c]
    return res


# --- the seeded cohort ---------------------------------------------------------


def build_resources() -> dict[str, list[dict]]:
    """Construct every registry resource. Pure data; no Firestore needed."""
    patients: list[dict] = []
    observations: list[dict] = []
    histories: list[dict] = []

    # 1) The Okafor family (the hero case).
    patients.append(_patient(
        "diane-okafor", "Okafor", "Diane", "female", "1971-04-12",
        role="proband", conditions=["Colorectal cancer (dx 2019, age 48)"]))
    observations.append(_observation(
        "obs-diane", "diane-okafor", HERO, "Uncertain significance", "2019-03-15"))
    # at-risk relatives, untested
    patients.append(_patient("grace-okafor", "Okafor", "Grace", "female", "1968-09-02",
                             relative_of="diane-okafor", relationship="sister"))
    patients.append(_patient("ada-okafor", "Okafor", "Ada", "female", "1998-06-20",
                             relative_of="diane-okafor", relationship="daughter"))
    patients.append(_patient("emeka-okafor", "Okafor", "Emeka", "male", "2001-11-30",
                             relative_of="diane-okafor", relationship="son"))
    histories.append(_family_history("fmh-diane-mother", "diane-okafor", "MTH", "mother",
                                     deceased=True, condition="Colorectal cancer", onset_age=47))
    histories.append(_family_history("fmh-diane-aunt", "diane-okafor", "MAUNT",
                                     "maternal aunt", condition="Endometrial cancer", onset_age=52))

    # 2) Three "silent Dianes": same hero variant, recorded VUS, family never recontacted.
    silent = [
        ("mary-adeyinka", "Adeyinka", "Mary", "female", "1965-02-11", "2017-08-01"),
        ("peter-nwosu", "Nwosu", "Peter", "male", "1979-05-23", "2020-01-14"),
        ("ngozi-eze", "Eze", "Ngozi", "female", "1983-12-05", "2021-06-30"),
    ]
    for pid, fam, giv, sex, dob, rec in silent:
        patients.append(_patient(pid, fam, giv, sex, dob, role="carrier",
                                 conditions=["Colorectal cancer"]))
        observations.append(_observation(f"obs-{pid}", pid, HERO,
                                         "Uncertain significance", rec))

    # 3) Deceased carrier (Steward ethics branch) with a living at-risk child.
    patients.append(_patient("samuel-bello", "Bello", "Samuel", "male", "1952-07-19",
                             deceased=True, role="carrier",
                             conditions=["Colorectal cancer (deceased)"]))
    observations.append(_observation("obs-samuel", "samuel-bello", MSH2_LP,
                                     "Uncertain significance", "2015-04-10"))
    patients.append(_patient("david-bello", "Bello", "David", "male", "1986-03-08",
                             relative_of="samuel-bello", relationship="son"))

    # 4) The 1-star trap carrier: tempting variant, must be withheld.
    patients.append(_patient("john-okeke", "Okeke", "John", "male", "1975-10-02",
                             role="carrier"))
    observations.append(_observation("obs-john", "john-okeke", TRAP,
                                     "Uncertain significance", "2018-11-22"))

    # 5) Benign / unrelated cohort filler (no action expected).
    filler = [
        ("amaka-obi", "Obi", "Amaka", "female", "1990-01-15", MLH1_BENIGN, "Benign", "2019-02-01"),
        ("tunde-lawal", "Lawal", "Tunde", "male", "1972-08-09", MSH6_BENIGN, "Benign", "2020-09-12"),
        ("chioma-udo", "Udo", "Chioma", "female", "1988-04-27", EPCAM_BENIGN, "Benign", "2021-03-03"),
        # recorded VUS but now benign: a downgrade, not an alarm
        ("kemi-balogun", "Balogun", "Kemi", "female", "1969-06-18", MLH1_BENIGN,
         "Uncertain significance", "2016-05-20"),
    ]
    for pid, fam, giv, sex, dob, variant, rec_class, rec_date in filler:
        patients.append(_patient(pid, fam, giv, sex, dob))
        observations.append(_observation(f"obs-{pid}", pid, variant, rec_class, rec_date))

    return {"Patient": patients, "Observation": observations,
            "FamilyMemberHistory": histories}


# --- Firestore I/O -------------------------------------------------------------


def get_client(project: str = PROJECT):
    from google.cloud import firestore
    return firestore.Client(project=project)


def seed(client=None, *, wipe: bool = True) -> dict[str, list[dict]]:
    """Write the cohort to Firestore (idempotent). Returns the resources written."""
    client = client or get_client()
    resources = build_resources()
    for collection in COLLECTIONS:
        coll = client.collection(collection)
        if wipe:
            for doc in coll.list_documents():
                doc.delete()
        for res in resources.get(collection, []):
            coll.document(res["id"]).set(res)
    return resources


def fetch_all(client=None) -> dict[str, list[dict]]:
    """Read every registry resource back from Firestore."""
    client = client or get_client()
    return {c: [d.to_dict() for d in client.collection(c).stream()] for c in COLLECTIONS}


# --- read helpers (used by the agent tools) ------------------------------------


def observation_variant(obs: dict) -> VariantKey | None:
    """Reconstruct the VariantKey from an Observation's 81252-9 component."""
    for comp in obs.get("component", []):
        for coding in comp.get("code", {}).get("coding", []):
            if coding.get("code") == "81252-9":
                gid = comp.get("valueString", "")
                parts = gid.split("-")
                if len(parts) == 4:
                    return VariantKey(parts[0], int(parts[1]), parts[2], parts[3])
    return None


def observation_field(obs: dict, code: str) -> str | None:
    for comp in obs.get("component", []):
        for coding in comp.get("code", {}).get("coding", []):
            if coding.get("code") == code:
                return comp.get("valueString")
    return None


def recorded_classification(obs: dict) -> str | None:
    return observation_field(obs, "53037-8")
