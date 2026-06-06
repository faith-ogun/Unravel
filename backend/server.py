"""HTTP backend for the Unravel SPA.

Real endpoints, backed by the live engine:
  GET  /api/health                      liveness
  GET  /api/cohort                      deterministic pass: detection + ledger +
                                        calibrated posterior for every seeded
                                        carrier (one batched BigQuery query)
  POST /api/adjudicate?patient=<id>     grounded pass: live Gemini Adjudicator
                                        verdict for one patient
  GET  /api/structural?gene=&hgvs_p=    AlphaFold + AlphaMissense 3D cluster
  POST /api/run-watch?year=<y>          legacy time-machine stub (frontend scrubber)

Run (from backend/, with PYTHONPATH so `unravel` imports):
    PYTHONPATH=. .venv/bin/uvicorn server:app --reload --port 8000
"""

import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(title="Unravel API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "https://unravel-ra.web.app", "https://unravel-ra.firebaseapp.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "unravel-api"}


@app.get("/api/cohort")
def cohort() -> dict:
    """Real cohort overview: detection + ledger + posterior for each carrier."""
    from unravel.watch import cohort_overview
    try:
        return {"cohort": cohort_overview()}
    except Exception as e:  # surface a readable error to the UI
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.post("/api/run-loop")
def run_loop(patient: str) -> dict:
    """Run the full five-agent ADK loop on one patient (the real multi-agent
    flow: Watcher -> Adjudicator -> parallel fan-out of Planner/Cascade/Steward,
    sharing one Session). Slow, on demand; returns every agent's output."""
    from unravel.agents import run_loop as _run
    try:
        return _run(patient)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.get("/api/run-loop-stream")
async def run_loop_stream(patient: str):
    """Stream the five-agent loop as Server-Sent Events, one per agent as it
    completes, so the UI lights up node by node in real time."""
    from unravel.agents import run_loop_events_async

    async def gen():
        try:
            async for item in run_loop_events_async(patient):
                yield f"data: {json.dumps(item)}\n\n"
        except Exception as e:  # surface the error to the client, then end
            yield f"data: {json.dumps({'error': f'{type(e).__name__}: {e}'})}\n\n"
        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive",
    })


@app.get("/api/pedigree")
def pedigree(patient: str) -> dict:
    """Family pedigree around a patient, with contact + recontact status."""
    from unravel.watch import pedigree_patient
    try:
        return pedigree_patient(patient)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.get("/api/graph")
def graph(patient: str) -> dict:
    """Knowledge graph: variant <-> evidence sources <-> carriers <-> relatives."""
    from unravel.watch import graph_patient
    try:
        return graph_patient(patient)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


class NewPatient(BaseModel):
    given: str
    family: str
    gender: str = "unknown"
    birth: str = ""
    email: str | None = None
    phone: str | None = None
    relative_of: str | None = None
    relationship: str | None = None
    gene: str | None = None
    hgvs_c: str | None = None
    gid: str | None = None
    recorded_class: str = "Uncertain significance"


@app.post("/api/patient")
def add_patient(p: NewPatient) -> dict:
    """Add a patient (and optional variant) to the Firestore registry."""
    from unravel.registry import add_patient as _add
    try:
        return _add(**p.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.get("/api/freshness")
def freshness() -> dict:
    """Live evidence-feed freshness via the Fivetran MCP server."""
    from unravel.fivetran_mcp import check_freshness
    try:
        feeds = check_freshness()
        return {"feeds": [{
            "schema": f.schema, "connection_id": f.connection_id, "service": f.service,
            "sync_state": f.sync_state, "succeeded_at": f.succeeded_at,
            "hours_old": round(f.hours_old, 1) if f.hours_old is not None else None,
            "is_stale": f.is_stale,
        } for f in feeds]}
    except Exception:
        # degrade gracefully rather than 500: the UI just shows no Fivetran feeds
        return {"feeds": []}


@app.post("/api/resync")
def resync(connection_id: str) -> dict:
    """Trigger a targeted Fivetran re-sync via the MCP write path."""
    from unravel.fivetran_mcp import trigger_resync
    try:
        return trigger_resync(connection_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.get("/api/structural")
def structural(gene: str, hgvs_p: str | None = None, residue: int | None = None) -> dict:
    """AlphaFold + AlphaMissense structural context for a variant residue."""
    from unravel.structure import structural_context
    try:
        sc = structural_context(gene, hgvs_p=hgvs_p, residue=residue, include_heatmap=True)
        return {
            "gene": sc.gene,
            "uniprot": sc.uniprot,
            "residue": sc.residue,
            "summary": sc.summary(),
            "structure_url": sc.structure_url,
            "structure_page": sc.structure_page,
            "structure_source": sc.structure_source,
            "variant_mean_am": sc.variant_mean_am,
            "variant_plddt": sc.variant_plddt,
            "global_mean_am": sc.global_mean_am,
            "neighbourhood_mean_am": sc.neighbourhood_mean_am,
            "enrichment": sc.enrichment,
            "n_neighbours": sc.n_neighbours,
            "radius_angstrom": sc.radius_angstrom,
            "pathogenic_neighbours": sorted(
                sc.pathogenic_neighbours, key=lambda n: -n["mean_am"])[:8],
            "heatmap": sc.heatmap,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


# --- legacy time-machine stub (the existing /app scrubber) ---------------------


class WatchResult(BaseModel):
    year: int
    stage: str
    variant: str
    decision: str
    review_status: str
    narration: str
    source: str = "stub"


def _stage(year: int) -> str:
    if year < 2020:
        return "baseline"
    if year < 2023:
        return "withhold"
    if year < 2025:
        return "fire"
    return "closed"


_DECISION = {"baseline": "monitoring", "withhold": "withheld",
             "fire": "actionable", "closed": "actionable"}
_REVIEW = {"baseline": "1 star, single submitter",
           "withhold": "1 star + 1 conflicting submission",
           "fire": "3 star, ClinGen expert panel",
           "closed": "3 star, ClinGen expert panel"}
_NARRATION = {
    "baseline": "MLH1 variant filed as uncertain. Standard surveillance, no change to management.",
    "withhold": "A single low-confidence submission appears. Unravel withholds; no alert fired.",
    "fire": "ClinGen expert panel reclassifies the variant. The agent confirms it and the family is flagged.",
    "closed": "Loop closed. Cascade testing drafted for at-risk first-degree relatives.",
}


@app.post("/api/run-watch")
def run_watch(year: int = 2019) -> WatchResult:
    stage = _stage(year)
    return WatchResult(
        year=year, stage=stage, variant="MLH1 c.114C>G (p.Asn38Lys)",
        decision=_DECISION[stage], review_status=_REVIEW[stage],
        narration=_NARRATION[stage],
    )
