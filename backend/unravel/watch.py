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
from .acmg import score_posterior
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
        row = rows.get(_gid(key))
        ctx = build_evidence_ledger(key, row=row)
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
            "cited": post.cited_lines(),
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
    ctx = build_evidence_ledger(key, client=client)
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


def plan_patient(pid: str, *, client=None) -> dict:
    """Resolution Planner: rank the next experiment for this patient's variant."""
    from .planner import plan_next_evidence
    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)
    r = _resolve(pid, client)
    if r is None:
        return {"error": f"no patient {pid}"}
    return plan_next_evidence(r["ctx"]).as_dict()


def cascade_patient(pid: str, *, client=None) -> dict:
    """Cascade Coordinator: draft recontact for this patient's variant."""
    from .cascade import draft_recontact
    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)
    r = _resolve(pid, client)
    if r is None:
        return {"error": f"no patient {pid}"}
    return draft_recontact(r["key"], gene=r["gene"], hgvs=r["hgvs_c"], data=r["data"])


def steward_patient(pid: str, *, client=None) -> dict:
    """Steward: deceased-proband ethics routing + draft ClinVar give-back."""
    from .steward import steward_review
    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)
    r = _resolve(pid, client)
    if r is None:
        return {"error": f"no patient {pid}"}
    return steward_review(r["key"], gene=r["gene"], hgvs=r["hgvs_c"],
                          current_class=r["current_class"], review_stars=r["review_stars"],
                          cited=r["cited"], data=r["data"])


def pedigree_patient(pid: str) -> dict:
    """The family pedigree around a patient, with contact + recontact state."""
    return registry.pedigree(pid)


def graph_patient(pid: str, *, client=None) -> dict:
    """Knowledge graph for a patient's variant: variant <-> evidence <-> family."""
    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)
    r = _resolve(pid, client)
    if r is None:
        return {"nodes": [], "edges": []}
    ctx = r["ctx"]
    match = registry.match_affected_patients(r["key"], data=r["data"])

    nodes: list[dict] = [{
        "id": "variant", "label": f"{r['gene']} {r['hgvs_c']}", "type": "variant",
        "meta": f"{r['current_class']} · {r['review_stars']}★",
    }]
    edges: list[dict] = []

    af = ctx.gnomad_af
    sources = [
        ("clinvar", "ClinVar", f"{r['current_class']} ({r['review_stars']}★)"),
        ("gnomad", "gnomAD", "absent" if af is None else f"AF {af:.2g}"),
        ("alphamissense", "AlphaMissense",
         "n/a" if ctx.am_pathogenicity is None else f"{ctx.am_pathogenicity:.2f} ({ctx.am_class})"),
        ("alphafold", "AlphaFold", "structure"),
    ]
    for sid, label, meta in sources:
        nodes.append({"id": sid, "label": label, "type": "source", "meta": meta})
        edges.append({"source": sid, "target": "variant"})

    for c in match["carriers"]:
        cid = c["patient"]["id"]
        n = (c["patient"].get("name") or [{}])[0]
        nodes.append({"id": cid, "type": "carrier",
                      "label": f"{' '.join(n.get('given', []))} {n.get('family', '')}".strip(),
                      "meta": "carrier" + (" †" if c.get("deceased") else "")})
        edges.append({"source": "variant", "target": cid})
    for rel in match["relatives"]:
        rid = rel["patient"]["id"]
        n = (rel["patient"].get("name") or [{}])[0]
        nodes.append({"id": rid, "type": "relative",
                      "label": f"{' '.join(n.get('given', []))} {n.get('family', '')}".strip(),
                      "meta": rel["relationship"]})
        edges.append({"source": rel["carrier_id"], "target": rid})

    return {"nodes": nodes, "edges": edges}


def adjudicate_patient(pid: str, *, freshness: str | None = None, client=None) -> dict:
    """Run the live Gemini Adjudicator for one patient. Returns a verdict dict."""
    from .adjudicator import adjudicate  # lazy: avoids importing ADK for cohort calls

    if client is None:
        from google.cloud import bigquery
        client = bigquery.Client(project=registry.PROJECT)

    data = registry.fetch_all()
    dets = {d.patient_id: d for d in detect_reclassifications(data=data, client=client)}
    reclass = dets.get(pid)
    if reclass is None:
        return {"patient_id": pid, "reclassified": False,
                "message": "No reclassification for this patient; nothing to adjudicate."}

    ctx = build_evidence_ledger(reclass.variant, client=client)
    adj = adjudicate(reclass, ctx, freshness=freshness)
    p, v = adj.posterior, adj.verdict
    return {
        "patient_id": pid,
        "reclassified": True,
        "gene": reclass.gene,
        "hgvs_c": reclass.hgvs_c,
        "hgvs_p": registry.observation_field(
            next(o for o in data["Observation"]
                 if o["subject"]["reference"].endswith(pid)), "48005-3"),
        "current_class": reclass.current_class,
        "review_stars": reclass.review_stars,
        "posterior": round(p.posterior, 4),
        "points": p.points,
        "band": p.band.value,
        "cited": p.cited_lines(),
        "verdict": {
            "triage": v.triage,
            "action": v.action,
            "withheld": v.withheld,
            "rationale": v.rationale,
            "key_evidence": v.key_evidence,
        },
    }
