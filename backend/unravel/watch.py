"""Watch-run orchestration helpers that the API serves.

Two entry points the frontend uses:

  - cohort_overview(): the fast, deterministic pass. One batched BigQuery query
    pulls the current evidence for every seeded carrier, then the ledger and
    calibrated posterior are computed locally. No LLM, so it returns in one round
    trip and is safe to call on page load.

  - adjudicate_patient(pid): the slow, grounded pass for a single patient. Runs
    the Gemini Pro Adjudicator over the cited ledger and returns the verdict.
    Called on demand (per click), since it costs a model call.

Both read the live Firestore registry and the BigQuery evidence warehouse, so
what the browser shows is the real engine, not a fixture.
"""

from __future__ import annotations

from . import registry
from .acmg import posterior_breakdown, score_posterior
from .detection import _gid, detect_reclassifications
from .evidence import EVIDENCE_VIEW, build_evidence_ledger


def _patient_name(patient: dict) -> str:
    n = (patient.get("name") or [{}])[0]
    given = " ".join(n.get("given", []))
    return f"{given} {n.get('family', '')}".strip() or patient.get("id", "")


def _fetch_rows(keys, client) -> dict[str, dict]:
    """All warehouse rows for a set of VariantKeys, by gid, in one query."""
    from google.cloud import bigquery

    gids = sorted({_gid(k) for k in keys})
    if not gids:
        return {}
    sql = f"""
      SELECT *,
        CONCAT(CAST(chromosome AS STRING), '-', CAST(position AS STRING), '-',
               reference_allele, '-', alternate_allele) AS gid
      FROM `{EVIDENCE_VIEW}`
      WHERE CONCAT(CAST(chromosome AS STRING), '-', CAST(position AS STRING), '-',
                   reference_allele, '-', alternate_allele) IN UNNEST(@gids)
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
        bigquery.ArrayQueryParameter("gids", "STRING", gids),
    ]))
    out: dict[str, dict] = {}
    for row in job.result():
        d = dict(row)
        gid = d["gid"]
        # keep the best-reviewed record per variant
        if gid not in out or (d.get("review_stars") or 0) > (out[gid].get("review_stars") or 0):
            out[gid] = d
    return out


def cohort_overview(client=None) -> list[dict]:
    """Per-carrier evidence + calibrated posterior for the seeded cohort."""
    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)

    data = registry.fetch_all()
    patients = {p["id"]: p for p in data["Patient"]}
    observations = data["Observation"]

    keys = [registry.observation_variant(o) for o in observations]
    keys = [k for k in keys if k is not None]
    rows = _fetch_rows(keys, client)

    # current classification map for the deterministic reclassification diff
    current = {
        gid: {
            "clinical_significance": r.get("clinical_significance"),
            "clin_sig_simple": r.get("clin_sig_simple"),
            "review_stars": r.get("review_stars"),
            "last_evaluated": r.get("last_evaluated"),
        }
        for gid, r in rows.items()
    }
    dets = {d.patient_id: d for d in detect_reclassifications(data=data, current=current)}

    out: list[dict] = []
    for obs in observations:
        key = registry.observation_variant(obs)
        if key is None:
            continue
        pid = obs["subject"]["reference"].split("/")[-1]
        patient = patients.get(pid, {})
        ur = registry.ancestry_underrepresented(patient)
        row = rows.get(_gid(key))
        ctx = build_evidence_ledger(key, row=row, ancestry_underrepresented=ur)
        post = score_posterior(ctx.ledger)
        det = dets.get(pid)
        out.append({
            "patient_id": pid,
            "patient_name": _patient_name(patients.get(pid, {})),
            "deceased": patients.get(pid, {}).get("deceasedBoolean", False),
            "gene": registry.observation_field(obs, "48018-6"),
            "hgvs_c": registry.observation_field(obs, "48004-6"),
            "hgvs_p": registry.observation_field(obs, "48005-3"),
            "variant": key.label(),
            "recorded_class": registry.recorded_classification(obs),
            "recorded_date": obs.get("effectiveDateTime"),
            "current_class": (row or {}).get("clinical_significance"),
            "review_stars": (row or {}).get("review_stars"),
            "direction": det.direction if det else "unchanged",
            "reclassified": det is not None,
            "points": post.points,
            "posterior": round(post.posterior, 4),
            "band": post.band.value,
            "points_to_actionable": post.points_to_actionable,
            "gnomad_af": (row or {}).get("gnomad_af"),
            "am_pathogenicity": (row or {}).get("am_pathogenicity"),
            "am_class": (row or {}).get("am_class"),
            "ancestry": registry.patient_ancestry(patient),
            "ancestry_downweighted": ur,
            "cited": post.cited_lines(),
            "breakdown": posterior_breakdown(ctx.ledger),
        })
    # most clinically interesting first: reclassified, then by posterior
    out.sort(key=lambda x: (not x["reclassified"], -x["posterior"]))
    return out


def _resolve(pid: str, client):
    """Everything the per-patient tools need: variant, gene, names, ledger, row."""
    data = registry.fetch_all()
    obs = next((o for o in data["Observation"]
                if o["subject"]["reference"].endswith(pid)), None)
    if obs is None:
        return None
    key = registry.observation_variant(obs)
    patient = next((p for p in data["Patient"] if p["id"] == pid), {})
    ur = registry.ancestry_underrepresented(patient)
    ctx = build_evidence_ledger(key, client=client, ancestry_underrepresented=ur)
    post = score_posterior(ctx.ledger)
    return {
        "data": data, "obs": obs, "key": key, "ctx": ctx, "post": post,
        "gene": registry.observation_field(obs, "48018-6"),
        "hgvs_c": registry.observation_field(obs, "48004-6"),
        "hgvs_p": registry.observation_field(obs, "48005-3"),
        "current_class": ctx.clinical_significance,
        "review_stars": ctx.review_stars,
        "cited": post.cited_lines(),
    }


def pedigree_patient(pid: str) -> dict:
    """The family pedigree around a patient, with contact + recontact state."""
    return registry.pedigree(pid)


def graph_patient(pid: str, *, client=None) -> dict:
    """Rich knowledge graph: variant at centre, deep evidence branches, family."""
    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)
    r = _resolve(pid, client)
    if r is None:
        return {"nodes": [], "edges": []}
    ctx = r["ctx"]
    post = r["post"]
    match = registry.match_affected_patients(r["key"], data=r["data"])

    nodes: list[dict] = []
    edges: list[dict] = []

    def add(nid, label, ntype, meta="", size=1.0, detail=""):
        nodes.append({"id": nid, "label": label, "type": ntype,
                      "meta": meta, "size": size, "detail": detail})

    def link(src, tgt, weight=1.0, label=""):
        edges.append({"source": src, "target": tgt, "weight": weight, "label": label})

    gene = r["gene"]
    hgvs_c = r["hgvs_c"]
    hgvs_p = r.get("hgvs_p") or ""

    add("variant", f"{gene} {hgvs_c}", "variant",
        meta=f"{r['current_class']} ({r['review_stars']}★)",
        size=2.0,
        detail=f"Protein change: {hgvs_p}. Posterior: {post.posterior:.2f} ({post.band.value}). Points: {post.points}.")

    # -- gene node
    add("gene", gene, "gene", meta="gene symbol", size=1.4,
        detail=f"{gene} encodes a protein involved in DNA mismatch repair. Pathogenic variants in this gene are associated with Lynch syndrome (hereditary nonpolyposis colorectal cancer).")
    link("variant", "gene", label="in gene")

    # -- protein node
    protein_label = f"{gene} protein"
    if ctx.am_pathogenicity is not None:
        protein_detail = f"AlphaMissense pathogenicity for the variant residue: {ctx.am_pathogenicity:.3f} ({ctx.am_class}). The protein has domains critical for mismatch repair function."
    else:
        protein_detail = "Protein structure available from AlphaFold DB."
    add("protein", protein_label, "protein", meta="protein product", size=1.2, detail=protein_detail)
    link("gene", "protein", label="encodes")

    # -- ClinVar branch: top-level + sub-nodes for review status / submitters / history
    cv_class = r["current_class"] or "unknown"
    stars = r["review_stars"] or 0
    n_sub = ctx.number_submitters
    add("clinvar", "ClinVar", "source", meta=f"{cv_class}", size=1.3,
        detail=f"ClinVar aggregates submitted interpretations of genetic variants. This variant is currently classified as '{cv_class}' with {stars} review star(s).")
    link("variant", "clinvar", weight=1.5, label="classified by")

    add("cv-class", cv_class.title(), "evidence",
        meta=f"{stars}★ review",
        detail=f"The current aggregate classification is '{cv_class}'. A higher star rating indicates stronger expert consensus. {stars}★ means {'expert panel reviewed' if stars >= 3 else 'criteria provided, ' + ('multiple submitters' if (n_sub or 0) > 1 else 'single submitter')}.")
    link("clinvar", "cv-class", label="classification")

    add("cv-review", f"{stars}★ review", "evidence",
        meta=f"{n_sub or '?'} submitter(s)",
        detail=f"Review status: {stars} star(s) from {n_sub or '?'} submitter(s). ClinVar review stars range from 0 (no assertion) to 4 (practice guideline). The star rating reflects consensus strength, not variant pathogenicity.")
    link("clinvar", "cv-review", label="review status")

    if stars < 3:
        add("cv-caution", "Low confidence", "warning",
            meta=f"only {stars}★",
            detail=f"This variant has only {stars} review star(s). Single-submitter or no-criteria assertions are less reliable. The Adjudicator may withhold action on low-confidence assertions.")
        link("cv-review", "cv-caution", label="caution")

    # -- gnomAD branch: frequency + population detail
    af = ctx.gnomad_af
    if af is not None:
        af_str = f"{af:.2e}" if af < 0.001 else f"{af:.4f}"
        af_meta = f"AF {af_str}"
    else:
        af_str = "absent"
        af_meta = "absent"
    add("gnomad", "gnomAD v4", "source", meta=af_meta, size=1.3,
        detail=f"gnomAD (Genome Aggregation Database) catalogues allele frequencies across >800k individuals from diverse populations. This variant is {af_meta} in gnomAD.")
    link("variant", "gnomad", weight=1.3, label="population freq")

    add("gnomad-freq", f"AF: {af_str}", "evidence",
        meta="allele frequency",
        detail=f"The allele frequency is {af_str}. {'Absent or ultra-rare variants support pathogenicity (PM2).' if af is None or af < 1e-4 else 'Common variants support a benign interpretation (BS1/BA1).' if af > 0.01 else 'Intermediate frequency: no strong ACMG criterion.'}")
    link("gnomad", "gnomad-freq", label="frequency")

    if af is None or af < 1e-4:
        add("gnomad-rare", "Ultra-rare / absent", "criterion",
            meta="PM2 Supporting",
            detail="Absence or ultra-rarity in population databases supports pathogenicity under ACMG criterion PM2 at Supporting strength.")
        link("gnomad-freq", "gnomad-rare", label="ACMG criterion")
    elif af > 0.05:
        add("gnomad-common", "Common (>5%)", "criterion",
            meta="BA1 Stand-alone benign",
            detail="An allele frequency above 5% is a stand-alone benign criterion (BA1). This alone classifies the variant as benign.")
        link("gnomad-freq", "gnomad-common", label="ACMG criterion")
    elif af > 0.01:
        add("gnomad-bs1", "Frequent (>1%)", "criterion",
            meta="BS1 Strong benign",
            detail="An allele frequency above 1% provides strong benign evidence (BS1).")
        link("gnomad-freq", "gnomad-bs1", label="ACMG criterion")

    # -- AlphaMissense branch
    am = ctx.am_pathogenicity
    am_cls = ctx.am_class or "n/a"
    add("alphamissense", "AlphaMissense", "source",
        meta=f"{am:.3f}" if am else "n/a", size=1.3,
        detail="AlphaMissense is a deep learning model from DeepMind that predicts the pathogenicity of all possible single amino acid substitutions across the human proteome. It is calibrated against ClinVar and provides per-residue pathogenicity scores.")
    link("protein", "alphamissense", weight=1.2, label="predicted by")

    if am is not None:
        add("am-score", f"Score: {am:.3f}", "evidence",
            meta=am_cls,
            detail=f"AlphaMissense score: {am:.3f}, classified as '{am_cls}'. Thresholds: >0.564 = likely pathogenic, <0.34 = likely benign, between = ambiguous.")
        link("alphamissense", "am-score", label="pathogenicity")

        if am >= 0.564:
            strength = "Strong" if am >= 0.99 else "Moderate" if am >= 0.90 else "Supporting"
            add("am-pp3", f"PP3 ({strength})", "criterion",
                meta="in-silico pathogenic",
                detail=f"AlphaMissense score {am:.3f} meets the PP3 criterion at {strength} strength. This computational evidence supports pathogenicity.")
            link("am-score", "am-pp3", label="ACMG criterion")
        elif am <= 0.34:
            add("am-bp4", "BP4 (Supporting)", "criterion",
                meta="in-silico benign",
                detail=f"AlphaMissense score {am:.3f} meets the BP4 criterion at Supporting strength. This computational evidence supports a benign interpretation.")
            link("am-score", "am-bp4", label="ACMG criterion")

    # -- AlphaFold branch
    add("alphafold", "AlphaFold", "source", meta="3D structure", size=1.2,
        detail="AlphaFold (DeepMind) predicts protein 3D structures with near-experimental accuracy. The structure contextualises the variant's location: is it in a functional domain, a buried core, or a flexible loop?")
    link("protein", "alphafold", label="structure from")

    add("af-structure", "3D structure", "evidence", meta="protein fold",
        detail="The AlphaFold-predicted structure shows the spatial environment of the variant residue, including whether it sits in a pathogenic neighbourhood (clustered with other high-AM residues).")
    link("alphafold", "af-structure", label="model")

    add("af-neighbourhood", "3D neighbourhood", "evidence", meta="spatial context",
        detail="The variant residue's 3D neighbours (within 8 angstroms in the folded protein) are assessed for AlphaMissense enrichment. A cluster of pathogenic residues around the variant strengthens the structural argument.")
    link("af-structure", "af-neighbourhood", label="spatial analysis")

    # -- ACMG posterior node
    add("posterior", f"Posterior: {post.posterior:.2f}", "verdict",
        meta=post.band.value, size=1.5,
        detail=f"Calibrated Bayesian posterior probability of pathogenicity: {post.posterior:.4f}. ACMG band: {post.band.value}. Total evidence points: {post.points}. {'Actionable (crosses the 0.90 threshold).' if post.is_actionable else f'Gap to actionable: {post.points_to_actionable} points.'}")
    link("variant", "posterior", weight=1.8, label="scored as")

    for item in ctx.ledger.items:
        crit_id = f"crit-{item.code}-{item.source}".lower().replace(" ", "-")
        if not any(n["id"] == crit_id for n in nodes):
            add(crit_id, f"{item.code} ({item.effective_strength.value})", "criterion",
                meta=item.source,
                detail=item.detail or f"{item.code} from {item.source} at {item.effective_strength.value} strength.")
            link(crit_id, "posterior", label="contributes")

    # -- family / carriers / relatives
    for c in match["carriers"]:
        cid = c["patient"]["id"]
        name = _patient_name(c["patient"])
        deceased = c.get("deceased", False)
        add(cid, name, "carrier",
            meta="carrier" + (" (deceased)" if deceased else ""), size=1.1,
            detail=f"{name} is a confirmed carrier of this variant.{' This patient is deceased; recontact routes through ethics/next-of-kin.' if deceased else ' Eligible for updated genetic counselling if the variant is reclassified.'}")
        link("variant", cid, weight=1.4, label="carried by")

    for rel in match["relatives"]:
        rid = rel["patient"]["id"]
        name = _patient_name(rel["patient"])
        relationship = rel["relationship"]
        add(rid, name, "relative",
            meta=relationship, size=0.9,
            detail=f"{name} is {relationship} to a confirmed carrier. As a first-degree relative, they have a 50% prior probability of carrying the variant and may benefit from predictive testing if the variant is reclassified.")
        link(rel["carrier_id"], rid, weight=1.0, label=relationship)

    return {"nodes": nodes, "edges": edges}
