# Unravel, Project Definition (A → Z)

**Tagline:** *Closing the one diagnostic loop in medicine that stays open for years.*

Unravel is a genomics-native guardian agent that continuously re-reads the world's evolving variant evidence against a clinic's historical genetic reports, and the moment a **variant of uncertain significance (VUS)** becomes clinically actionable, it drafts the reclassification alert **and** the cascade-testing fan-out for the at-risk family, for a clinician to review and send.

- **Hackathon:** Google Cloud Rapid Agent Hackathon (deadline 11 June 2026)
- **Track:** **Fivetran**
- **Builder:** Faith Ogundimu, cancer geneticist / PhD cancer genomics
- **Status:** scoped, pre-build (fresh repo to be created within the contest window)

---

## A. The Problem

A germline or tumor genetic panel often returns a **VUS**, a variant the lab cannot yet call benign or pathogenic. Clinically, "uncertain" means *do nothing.* But the evidence does not stand still: as data accrues in **ClinVar, ClinGen, OncoKB, and CIViC**, a meaningful fraction of these variants get **reclassified**, and the clinically catastrophic minority flip **VUS → likely pathogenic / pathogenic**, changing surveillance, prophylactic options, and family (cascade) testing.

In reality, **no system re-contacts the patient or their at-risk relatives** when this happens. The report sits in a PDF in an EHR; the ordering clinician has moved on; the lab has no obligation to re-issue. The **duty to recontact** is openly debated in the genetics literature and described by ACMG as "desirable but not currently feasible." That gap is the entire reason Unravel exists.

This is the **"diagnostic loop that never closes"**, the archetype that has repeatedly won healthcare-agent hackathons, but rendered **genomics-native and temporally extreme**: the loop stays open for *years*.

**Who benefits, given the years-long delay (the cascade-first reframe).** Reclassification typically takes **18–24 months, 5+ years for rare genes**, long enough that the original patient may be in remission or deceased. That is not a flaw in the idea; it is the reason it matters. A germline variant that flips is a **family** event: the life saved is often a **relative's**, not the proband's. In a 2024 survey, **24% of genetic counsellors had received a reclassified VUS for a patient who had already died, with no guideline for what to do next.** Unravel is therefore **cascade-first**: the beneficiary is the living at-risk family.

**Not only cancer (disease-agnostic).** The same loop fails in **rare and paediatric disease**, where patients are often children with decades ahead, reclassification can **end a diagnostic odyssey** and **change reproductive decisions**. Unravel's engine is disease-agnostic; the hero demo is hereditary cancer (Lynch), but the impact spans germline hereditary disease.

---

## B. The Named Victim (the opening story)

> In 2019, **Diane, 44**, had surgery for **colorectal cancer**. Her germline panel returned a **VUS in *MLH1***, a Lynch syndrome gene. "Uncertain" → nothing was done. Her oncologist said, "If it ever changes, we'll let you know." It changed: in **2023 a ClinGen expert panel reclassified that exact variant to likely pathogenic.** The update went public. It never reached Diane. No system was watching. Her **22-year-old daughter**, who could have started colonoscopies at 20 and been offered predictive testing the day the variant flipped, later presented with a tumor that Lynch surveillance is designed to catch early. The variant was reclassified. The loop never closed.

---

## C. The Core Idea (one sentence)

A guardian agent that watches evolving variant evidence against a clinic's historical VUS registry, and on a confirmed **actionable** reclassification, drafts the clinician alert and the at-risk-relative cascade fan-out, **draft-only, never autonomous.**

---

## D. The Agentic Moat (why this is not a cron job)

Detecting a status flip is deterministic. **Adjudicating it is not.** ClinVar carries *conflicting* submissions at different review/star levels; ClinGen expert panels disagree with single-submitter assertions; ontologies mismatch. Deciding whether a VUS has **actually** crossed the actionability threshold, and correctly **withholding** a flip when it is only a low-confidence single submission, is genuine LLM reasoning over contradictory, unstructured, citation-backed evidence. The demo centerpiece is a **hard case** where naive rules misfire and the agent holds.

---

## E. The Three Agents (distinct data, distinct clocks)

| Agent | Data | Clock | Job |
|---|---|---|---|
| **1. The Watcher** (Evidence Surveillance) | Continuously-synced evidence feeds (ClinVar / ClinGen / OncoKB / CIViC) | The *evidence's* clock, wakes on a change to any watched variant | Deterministic, auditable delta-detection against the clinic's historical VUS registry. **Fivetran is this agent's heartbeat.** |
| **2. The Adjudicator** (Clinical Significance) | Conflicting submissions, free-text criteria, original report, gene actionability tier, penetrance | Fires when the Watcher flags a change | Decide whether the reclassification *changes management*: weight by review status, resolve conflicts, apply ACMG / gene-tier logic, classify urgency. **The AI-factor moment.** |
| **3. The Cascade Coordinator** (Recontact & Fan-out) | Pedigree / family structure + responsible care team | Fires only on a confirmed actionable upgrade | Draft the clinician-facing alert (with full evidence provenance) **and** the cascade-testing fan-out to at-risk relatives. Draft-only. **The genomics-native "wow."** |

---

## F. Clinical Guardrails (intellectual honesty)

- **Asymmetric by design:** surface VUS→P/LP upgrades in actionable genes loudly; handle the (more common) downgrades as quiet de-escalation notes. False-positive management > raw sensitivity.
- **Provenance is first-class:** never treat a 1-star single submission as equal to a ClinGen expert-panel call. Review status / star ratings are visible in the reasoning.
- **Actionability-grounded urgency:** ACMG SF list, NCCN-managed genes; *BRCA1/2* and Lynch genes (*MLH1/MSH2/MSH6/PMS2*) are highest tier.
- **Safety posture:** **draft-only, clinician-facing, never patient-facing, never autonomous.** The agent draws the line at notification, not action.
- **No real patient data**, synthetic patients only.

---

## G. Technical Architecture (Fivetran track)

- **Path:** code-first **ADK (Agent Development Kit) → Cloud Run.**
- **Models:** `gemini-3.1-flash-lite` for high-frequency delta classification across many variants; `gemini-3.1-pro-preview` for adjudication and the recontact-draft synthesis (two-tier routing). *(Verified available in project `unravel-ra` at location `global`, 3 Jun 2026; GA `gemini-3.1-pro` and full `gemini-3.1-flash` not yet enabled there.)*
- **Fivetran seam (load-bearing):** Fivetran syncs the evidence feeds into a destination; the ADK agent calls the **Fivetran MCP server** to (1) check freshness before any evaluation, (2) trigger an on-demand sync, (3) read sync history to find which feeds changed. The agent manages **multiple** evolving feeds, connector sprawl + freshness + agentic tool-use, not a single `curl`.
- **Agent tools:**
  - `fivetran.get_sync_status` · `fivetran.trigger_sync` · `fivetran.get_schema` (via MCP)
  - `detect_reclassifications(since)`, deterministic diff (the auditable core)
  - `match_affected_patients(variant)`, find cases + flagged relatives
  - `draft_recontact(case)`, Gemini, draft-only
  - `score_variant_alphamissense(variant)`, **optional power-up:** pull AlphaMissense computational evidence (PP3/BP4) as an adjudication input. The only AI tool with peer-reviewed VUS→LP reclassification traction, and a DeepMind/Google tie-in no competitor has. Cut if Day-7 time is tight.
  - `assess_compound_risk`, optional
- **Stores:** Fivetran-managed destination (evidence, in BigQuery) + a **FHIR R4 patient/VUS registry** seeded with variants engineered to sit across a real reclassification boundary.
- **Clinical seam, FHIR R4 (like Tracer, but inverted).** Tracer fires when the EHR *pushes* a new result; Unravel fires when external *evidence* changes, then reads the FHIR registry and **writes drafts back**. Model the registry as `Patient`, the variant as an `Observation` (HL7 **Genomics Reporting IG** variant profile), and the pedigree as `FamilyMemberHistory` / `RelatedPerson`. On a confirmed upgrade, write **draft** resources: `Task` (recontact/cascade, `intent: proposal`, `status: draft`), `Communication`/`DocumentReference` (the letter), `RiskAssessment` (per relative). Same webhook pattern as Tracer, no EHR modification; works with Epic/Cerner/Athena. Make it *visible* in the UI via a "View as FHIR" reveal on each draft.
- **Frontend:** React / Vite on Firebase Hosting.
- **Secrets:** Secret Manager for partner API keys.

---

## H. Data Sources

- **Evidence (real):** ClinVar (with dated assertion history), ClinGen, OncoKB, CIViC.
- **Patients (synthetic):** Synthea-generated cohort (~20 patients) + a hand-crafted demo set with at least one variant that genuinely crossed a reclassification boundary on a known date.
- **Public, no real PHI.**

---

## I. The Demo (no-login sandbox, <2 min)

A judge lands on a dashboard of synthetic patients with VUS results and clicks **"Run evidence watch."** A visible **Fivetran freshness check** runs; a variant (e.g., the *MLH1* case) **flips VUS → Likely Pathogenic** in the latest sync; the affected patient **and a relative** light up on an "affected" board with a one-line rationale; a **draft recontact letter** renders, stamped *DRAFT, clinician review required, not sent.*

**The "wow" = a time machine:** a rewind-to-2019 / fast-forward-to-today toggle over a *genuine* historical ClinVar reclassification, so the judge watches the external evidence change and the agent catch it.

---

## J. Evaluation (credibility)

- **ClinVar time-replay backtest:** replay dated assertion history and measure precision/recall on variants that genuinely got reclassified, real-data validation, not hand-crafted examples.
- **pytest suite** across all agent tools (happy-path + edge + abstention/withhold cases) for an honest "N-patient eval / 100+ tests" claim.
- One **cited impact number**: per-patient cascade-testing value + a delayed-surveillance mortality figure from published literature.

---

## K. Differentiation

- Genomics-native version of the proven loop-closure winning archetype.
- The **cascade-ignition** (family fan-out) is something no existing system or competing entry does.
- **Domain authority:** authored by a cancer geneticist, a credibility moat in the Fivetran bucket.
- Partner integration is **structural**, not decorative: the evolving-evidence sync *is* the mechanism of the loop being closed.

**Prior art (acknowledge openly, intellectual honesty is a winning pattern):** two real tools each own *one* link of the chain. **iVar** (lab database) answers *"who carries this variant?"*; **VUSVista** (curation aid) answers *"did the evidence change?"* **Neither closes the loop to the patient and family, and neither is an autonomous agent.**

**Positioning line:** *iVar tells a lab **who** carries a variant. VUSVista tells a curator **when** the evidence moved. Unravel is the autonomous agent that does both, then closes the loop the others leave open: it reasons about whether the change is real, finds the patient **and the at-risk family**, and drafts the recontact no one else is built to send.*

> Full competitor breakdown + "what to hone in on" → `metadata/differentiation-analysis.md`.

---

## L. Scope Discipline

Build **one loop only.** Explicitly **out of scope:** intake, eligibility, pathology readiness, prior authorization, NGS report parsing, genetics referral logistics (the old 7-stage chain). One agent loop, one MCP partner, one killer demo scenario.

---

## M. Compliance Notes (build hygiene)

- **New code only.** This is a **ground-up reimplementation** of the concept on Google Cloud ADK. The earlier prototype (the May "ThreadBio" build, for a different hackathon) is **not reused, not reopened, not imported.** Fresh repo, fresh git history dated within the contest window.
- **Permitted build tooling:** **Google Antigravity + Gemini Code Assist** for all shipped source; Fivetran's built-in AI features. No non-Google AI assistants in the dev workflow. No non-Google co-author trailers in commits.
- **Permitted Google services:** Gemini models (Vertex AI / Gemini API), Agent Builder / Agent Platform Studio or ADK, Agent Runtime, Cloud Run, Vertex AI (vector search / grounding / data stores), BigQuery / BigQuery ML, Cloud Storage, Secret Manager, Firebase Hosting.
- **Repo:** public, OSI-approved license visible in the About section.
- **Track fallback:** if the Fivetran connector does not round-trip by end of Day 2, pivot to **Arize** (same ADK→Cloud Run skeleton; observability/eval of the Adjudicator instead of sync). Keep the agent core feed-agnostic so the pivot costs hours.

---

## N. The Build Gate (Day 1–2, before anything else)

Prove **one** evidence feed round-trips through Fivetran and that `get_sync_status` + `trigger_sync` are callable from its MCP server. The moment that round-trips, the architecture is real. If it does not by end of Day 2 → switch to the Arize fallback.

---

## Z. One-line summary

**Unravel watches the world's variant evidence so that when an "uncertain" result quietly becomes a life-or-death one, the patient and their family actually find out, built on Gemini + Google Cloud ADK with Fivetran as the living-evidence heartbeat.**

---

*Project definition. Last updated 3 June 2026.*
