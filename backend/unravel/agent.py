"""Unravel root agent (Day 1 skeleton).

This is the minimal, runnable spine of the Watcher agent. It does not yet have
tools wired in (Fivetran MCP, BigQuery evidence lookups, FHIR draft write-back);
those land on Days 3 to 5. For now it proves Gemini answers end to end via ADK
on Vertex AI.
"""

from google.adk.agents import LlmAgent

# Gemini 3 is not yet available in this project (404), so we pin to the current
# GA model. Swap to "gemini-3-flash" once it is enabled, or use the auto-tracking
# alias "gemini-flash-latest" (global location only).
MODEL_FLASH = "gemini-2.5-flash"

root_agent = LlmAgent(
    name="unravel_watcher",
    model=MODEL_FLASH,
    description=(
        "Unravel's evidence watcher: reads variant classification changes and "
        "judges whether a reclassification looks clinically actionable."
    ),
    instruction=(
        "You are Unravel, a clinical-genomics agent that watches evolving variant "
        "evidence (ClinVar, ClinGen, OncoKB, CIViC). You never auto-send anything; "
        "you only draft. Given a described change in a variant's classification, "
        "state in one or two sentences whether it looks potentially actionable and "
        "why, weighting the review status (star rating) and the direction of the "
        "change. Be precise and clinical. If the evidence is weak (for example a "
        "single 1-star submission), say it should be withheld pending stronger review."
    ),
)
