"""Cascade Coordinator: draft the family recontact (draft-only, clinician-gated).

When the Adjudicator returns an actionable verdict, this assembles the recontact
packet: it matches the carriers of the variant and their untested at-risk
relatives (via match_affected_patients), then drafts FHIR R4 resources for each,
as proposals a clinician reviews and sends. Nothing is sent here; intent is
"proposal", status is "draft". This is the safety posture made concrete.
"""

from __future__ import annotations

from . import registry
from .evidence import VariantKey


def _draft_communication(target_id: str, name: str, gene: str, hgvs: str, relationship: str) -> dict:
    return {
        "resourceType": "Communication",
        "status": "draft",
        "intent": "proposal",
        "category": [{"text": "genetic-result-recontact"}],
        "subject": {"reference": f"Patient/{target_id}", "display": name},
        "about": [{"display": f"{gene} {hgvs}"}],
        "payload": [{"contentString": (
            f"Draft for clinician review: a variant previously reported as uncertain "
            f"({gene} {hgvs}) has been reclassified as pathogenic. As a {relationship}, "
            f"{name} may benefit from genetic counselling and predictive testing. "
            f"This is a draft; a clinician must review and send.")}],
    }


def _draft_risk_assessment(target_id: str, name: str, relationship: str) -> dict:
    return {
        "resourceType": "RiskAssessment",
        "status": "draft",
        "subject": {"reference": f"Patient/{target_id}", "display": name},
        "prediction": [{"outcome": {"text": "Lynch syndrome (hereditary cancer risk)"},
                        "qualitativeRisk": {"text": "elevated, pending confirmatory testing"}}],
        "note": [{"text": f"At-risk {relationship}; offer counselling and cascade testing."}],
    }


def draft_recontact(variant: VariantKey, *, gene: str, hgvs: str, data=None, client=None) -> dict:
    """Build the draft recontact packet for an actionable variant."""
    match = registry.match_affected_patients(variant, data=data, client=client)
    drafts: list[dict] = []
    deceased_carriers = []

    for c in match["carriers"]:
        p = c["patient"]
        name = _name(p)
        if c.get("deceased"):
            deceased_carriers.append(name)
            continue  # deceased carriers route through the Steward, not a letter
        drafts.append({
            "for": name, "patient_id": p["id"], "relationship": "carrier",
            "communication": _draft_communication(p["id"], name, gene, hgvs, "carrier"),
        })

    for r in match["relatives"]:
        p = r["patient"]
        name = _name(p)
        drafts.append({
            "for": name, "patient_id": p["id"], "relationship": r["relationship"],
            "communication": _draft_communication(p["id"], name, gene, hgvs, r["relationship"]),
            "risk_assessment": _draft_risk_assessment(p["id"], name, r["relationship"]),
        })

    return {
        "variant": variant.label(gene),
        "carriers": len([c for c in match["carriers"] if not c.get("deceased")]),
        "relatives": len(match["relatives"]),
        "deceased_carriers": deceased_carriers,
        "drafts": drafts,
        "status": "draft",
        "note": "All resources are drafts (intent: proposal, status: draft). A clinician reviews and sends.",
    }


def _name(patient: dict) -> str:
    n = (patient.get("name") or [{}])[0]
    return f"{' '.join(n.get('given', []))} {n.get('family', '')}".strip() or patient.get("id", "")
