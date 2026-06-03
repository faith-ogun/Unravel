"""Stub HTTP backend for the Unravel SPA (Day 1 frontend-backend contract).

Exposes /api/health and /api/run-watch. The run-watch payload mirrors the shape
the real Watcher -> Adjudicator -> Cascade loop will return, so the frontend
contract is stable while the agents are built (Days 3 to 5). No Gemini calls yet.

Run (from backend/):
    .venv/bin/uvicorn server:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Unravel API", version="0.1.0")

# The Vite dev server proxies /api to here, but allow direct cross-origin too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class WatchResult(BaseModel):
    year: int
    stage: str
    variant: str
    decision: str
    review_status: str
    narration: str
    source: str = "stub"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "unravel-api"}


def _stage(year: int) -> str:
    if year < 2020:
        return "baseline"
    if year < 2023:
        return "withhold"
    if year < 2025:
        return "fire"
    return "closed"


_DECISION = {
    "baseline": "monitoring",
    "withhold": "withheld",
    "fire": "actionable",
    "closed": "actionable",
}
_REVIEW = {
    "baseline": "1 star, single submitter",
    "withhold": "1 star + 1 conflicting submission",
    "fire": "3 star, ClinGen expert panel",
    "closed": "3 star, ClinGen expert panel",
}
_NARRATION = {
    "baseline": "MLH1 variant filed as uncertain. Standard surveillance, no change to management.",
    "withhold": "A single low-confidence submission appears. Unravel withholds; no alert fired.",
    "fire": "ClinGen expert panel reclassifies the variant. The agent confirms it and the family is flagged.",
    "closed": "Loop closed. Cascade testing drafted for at-risk first-degree relatives.",
}


@app.post("/api/run-watch")
def run_watch(year: int = 2019) -> WatchResult:
    """Stub of one watch run. Returns the adjudication result for a given year.

    Replaced on Days 3 to 5 by the real ADK Watcher -> Adjudicator -> Cascade loop.
    """
    stage = _stage(year)
    return WatchResult(
        year=year,
        stage=stage,
        variant="MLH1 c.1852_1854del",
        decision=_DECISION[stage],
        review_status=_REVIEW[stage],
        narration=_NARRATION[stage],
    )
