"""Live Adjudicator verification on the demo cases.

Runs the full chain for chosen patients: detect_reclassifications -> the patient's
Reclassification -> build_evidence_ledger -> adjudicate (Gemini 3.1 Pro). Prints
the deterministic posterior and the grounded verdict side by side.

The decisive demo: Diane (HERO, 3-star expert panel) and John (TRAP, 1-star
conflicting) carry the SAME molecular posterior, yet the Adjudicator should fire
actionable on Diane and withhold on John, purely on review quality.

Run:  cd backend && PYTHONPATH=. .venv/bin/python scripts/run_adjudication.py
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from unravel.adjudicator import adjudicate  # noqa: E402
from unravel.detection import detect_reclassifications  # noqa: E402
from unravel.evidence import build_evidence_ledger  # noqa: E402

CASES = {
    "diane-okafor": "HERO  (MLH1 c.114C>G, 3-star expert panel)",
    "john-okeke": "TRAP  (MLH1 c.293G>A, 1-star conflicting)",
    "kemi-balogun": "DOWNGRADE (MLH1 c.655A>G, now benign)",
}


def main() -> None:
    print(f"[adjudicator] Vertex project={os.getenv('GOOGLE_CLOUD_PROJECT', '(unset)')}\n")
    dets = {d.patient_id: d for d in detect_reclassifications()}

    for pid, label in CASES.items():
        reclass = dets.get(pid)
        if reclass is None:
            print(f"== {label}: no reclassification detected, skipping ==\n")
            continue
        ctx = build_evidence_ledger(reclass.variant)
        adj = adjudicate(reclass, ctx, freshness="gnomAD + AlphaMissense synced today (fresh)")
        p, v = adj.posterior, adj.verdict
        print(f"== {label} :: {pid} ==")
        print(f"  posterior: {p.posterior:.2f} ({p.points} pts, {p.band.value}); "
              f"ClinVar {reclass.current_class} [{reclass.review_stars}*]")
        print(f"  VERDICT  : triage={v.triage}  action={v.action}  withheld={v.withheld}")
        print(f"  rationale: {v.rationale}")
        print(f"  evidence : {', '.join(v.key_evidence)}")
        print()


if __name__ == "__main__":
    main()
