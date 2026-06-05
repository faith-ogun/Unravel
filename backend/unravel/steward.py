"""Steward: deceased-proband ethics routing and the ClinVar give-back.

Two governance jobs at the edge of the loop:

  - Ethics routing. A deceased carrier cannot be recontacted, and their relatives
    must not receive a letter addressed to the dead. The Steward routes these to
    an ethics / next-of-kin consent pathway instead of drafting a direct
    communication. This is the hard case the system must not get wrong.

  - Give-back. When the loop resolves a variant on cited evidence, the Steward
    drafts a ClinVar submission so the commons gains what the clinic learned.
    Draft-only: a human submits.
"""

from __future__ import annotations

from . import registry
from .evidence import VariantKey


def _name(patient: dict) -> str:
    n = (patient.get("name") or [{}])[0]
    return f"{' '.join(n.get('given', []))} {n.get('family', '')}".strip() or patient.get("id", "")


def steward_review(
    variant: VariantKey, *, gene: str, hgvs: str, current_class: str,
    review_stars: int | None, cited: list[str], data=None, client=None,
) -> dict:
    """Ethics routing for any deceased carriers + a draft ClinVar give-back."""
    match = registry.match_affected_patients(variant, data=data, client=client)

    ethics_routes = []
    for c in match["carriers"]:
        if c.get("deceased"):
            p = c["patient"]
            # find living relatives of this deceased carrier
            living = [_name(r["patient"]) for r in match["relatives"]
                      if r.get("carrier_id") == p["id"]]
            ethics_routes.append({
                "deceased": _name(p),
                "route": "ethics / next-of-kin consent pathway",
                "rationale": ("Proband is deceased; no direct recontact. Route to the "
                              "ethics pathway and offer counselling to living relatives "
                              "through the appropriate consent process."),
                "living_relatives": living,
            })

    give_back = {
        "resourceType": "ClinVarSubmission",
        "status": "draft",
        "gene": gene,
        "variant": variant.label(gene),
        "hgvs": hgvs,
        "submitted_classification": current_class,
        "review_status_seen": f"{review_stars}-star" if review_stars is not None else "unknown",
        "evidence": cited,
        "note": ("Draft give-back to ClinVar capturing the cited evidence behind this "
                 "resolution. Draft-only; a human submits."),
    }

    return {
        "variant": variant.label(gene),
        "ethics_routes": ethics_routes,
        "has_deceased_carrier": bool(ethics_routes),
        "give_back": give_back,
    }
