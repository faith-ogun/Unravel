<!--
  This README is written for the NEW, public `unravel` build repository.
  Drop it into that repo's root. Fill the placeholders marked _TODO_ as the build lands.
-->

# Unravel

**Closing the one diagnostic loop in medicine that stays open for *years*, for the patient *and* their family.**

Unravel is a genomics-native agent that continuously re-reads the world's evolving variant evidence against a clinic's historical genetic reports, and the moment a **Variant of Uncertain Significance (VUS)** is reclassified as dangerous, it drafts the reclassification alert **and** the cascade-testing fan-out for the at-risk family, for a clinician to review and send.

Built for the **Google Cloud Rapid Agent Hackathon** · **Fivetran track**.

- 🔗 **Live demo (no login):** _TODO_
- 🎥 **3-minute video:** _TODO_
- 🧬 **Powered by** Gemini 3.1 · Google ADK → Cloud Run · Fivetran MCP · FHIR R4

---

## The problem

In 2019, **Diane, 44**, had surgery for **colorectal cancer**. Her germline panel returned a **VUS in *MLH1***, a Lynch syndrome gene. "Uncertain" means *do nothing*, so nothing was done. Her oncologist said, *"if it ever changes, we'll let you know."*

It changed. In **2023 a ClinGen expert panel reclassified that exact variant to likely pathogenic.** The update went public. **It never reached Diane.** No system was watching. Her 22-year-old daughter, who could have begun colonoscopies at 20 and been offered predictive testing the day the variant flipped, later presented with a tumour that Lynch surveillance is built to catch early.

**The variant was reclassified. The loop never closed. The family was never told.**

This is the *"diagnostic loop that never closes,"* rendered genomics-native and temporally extreme:

- A VUS takes **18–24 months, 5+ years for rare genes** to reclassify.
- By then the original patient may be in remission or deceased: **24% of genetic counsellors have received a reclassified VUS for a patient who had already died**, with no guideline for what happens next.
- A germline variant is **heritable**, so the life it threatens next is a **relative's**. Unravel is **cascade-first**: the beneficiary is the living at-risk family.
- The **duty to recontact** is described by ACMG itself as *"desirable but not currently feasible."* That sentence is the reason Unravel exists.

It is **disease-agnostic**, hereditary cancer **and** rare/paediatric disease (where reclassification can end a diagnostic odyssey and change reproductive decisions).

---

## What it does

Unravel runs one tight loop, end to end:

**evidence change → adjudication → patient match → family cascade fan-out → drafted FHIR recontact.**

1. **Watch** evolving evidence (ClinVar / ClinGen / OncoKB / CIViC), kept fresh by Fivetran.
2. **Detect** a material change against the clinic's historical VUS registry (deterministic, auditable).
3. **Adjudicate** whether the change *actually* alters management, reasoning over conflicting, citation-backed evidence, and **withholding** low-confidence flips.
4. **Match** the affected patient *and* at-risk first-degree relatives.
5. **Draft** the clinician alert + cascade-testing fan-out as **draft-only FHIR resources**, never sent autonomously.

---

## The three agents

Genuinely multi-agent, each operates on different data, on a different clock.

| Agent | Data | Clock | Job |
|---|---|---|---|
| **1. Watcher** (Evidence Surveillance) | Synced evidence feeds | The *evidence's* clock, wakes on a change | Deterministic, auditable delta-detection vs the VUS registry. **Fivetran is its heartbeat.** |
| **2. Adjudicator** (Clinical Significance) | Conflicting submissions, free-text criteria, gene tier, penetrance | Fires when the Watcher flags a change | Decide whether the change alters management; weight review status; **withhold** noise. *The AI-factor moment.* |
| **3. Cascade Coordinator** (Recontact & Fan-out) | Pedigree (FHIR `FamilyMemberHistory` / `RelatedPerson`) + care team | Fires only on a confirmed actionable upgrade | Draft the alert + family cascade fan-out as FHIR `Task` / `Communication` (`intent: proposal`). *The genomics-native "wow."* |

### Why it's an agent, not a cron job
Detecting a status flip is deterministic. **Adjudicating it is not.** ClinVar carries conflicting submissions at different review/star levels; expert panels disagree with single-submitter assertions; ontologies mismatch. Deciding whether a VUS has *actually* crossed the actionability threshold, and correctly **withholding** a flip that's only a low-confidence 1★ submission, is genuine LLM reasoning. The **rules / AI boundary** is explicit: deterministic code does the diff and gene-tier rules; the Gemini agents do the messy, contradictory, language-heavy adjudication.

---

## Architecture

```
══ EVIDENCE PLANE ═════════════════════════════════════════════════════════

   ClinVar ┐
   ClinGen ├──▶  FIVETRAN  ──▶  BigQuery  (evidence warehouse)
   OncoKB  │     continuous sync
   CIViC   ┘

══ AGENT PLANE ═ ADK multi-agent on Cloud Run ═════════════════════════════

   ┌─────────┐      ┌───────────────┐      ┌────────────────┐
   │ WATCHER │ ───▶ │  ADJUDICATOR  │ ───▶ │    CASCADE     │
   │  3.1    │      │   3.1 Pro     │      │  COORDINATOR   │
   │ Flash-  │      │  (the moat)   │      │    3.1 Pro     │
   │ Lite    │      │               │      │                │
   └────┬────┘      └───────┬───────┘      └───────┬────────┘
        │                   │                      │
   detect_reclass      reasons over           draft FHIR
   (data diff)         discordant evidence,    Task / Communication
        │              GROUNDED in cited        (intent: proposal,
        ▼              stars + ACMG;             status: draft)
   BigQuery            WITHHOLDS weak 1★ flips         │
        ▲                    ⇅                         │
        │              FIVETRAN MCP                    │
        │              get_sync_status /               │
        │              trigger_sync  (mid-loop)        │
        │                                              │
   FHIR R4 registry ◀── match_affected_patients ───────┘
   (Patient · variant Observation · FamilyMemberHistory)
        │
        ▼
   React SPA  (Firebase Hosting, no-login sandbox)
   clinician REVIEWS and SENDS   ◀── HUMAN IN THE LOOP (draft-only)
```

- **Models:** `gemini-3.1-flash-lite` for high-frequency delta classification; `gemini-3.1-pro-preview` for adjudication and the recontact-draft synthesis.
- **Partner superpower (deep MCP):** the agent weaves *multiple* Fivetran MCP operations into its reasoning loop, freshness checks, targeted re-syncs, schema + sync-history as the change signal, not a single token call.
- **Clinical seam, FHIR R4:** like Tracer, but inverted. Tracer fires when the EHR *pushes* a result; Unravel fires when external *evidence* changes, reads the FHIR patient registry, and **writes drafts back**. Aligned to the HL7 Genomics Reporting IG. Same webhook pattern, no EHR modification.

---

## Prior art & how Unravel differs

We acknowledge existing work openly, each tool owns only **one** link of the chain:

| Capability | iVar *(lab DB)* | VUSVista *(curation aid)* | **Unravel** |
|---|:---:|:---:|:---:|
| Detect evidence changed | ✗ | ✓ (curator) | ✓ (autonomous) |
| Find who carries the variant | ✓ (DB lookup) | ✗ | ✓ (patient + pedigree) |
| Reason over discordant evidence | ✗ | ✗ | ✓ (agentic + withhold) |
| Fan out to the at-risk family | ✗ | ✗ | ✓ (cascade) |
| Draft recontact / FHIR write-back | ✗ | ✗ | ✓ (draft-only) |
| An autonomous agent (vs human tool) | ✗ | ✗ | ✓ (ADK multi-agent) |

> *iVar tells a lab **who** carries a variant. VUSVista tells a curator **when** the evidence moved. Unravel is the autonomous agent that does both, then closes the loop the others leave open: it reasons about whether the change is real, finds the patient **and the at-risk family**, and drafts the recontact no one else is built to send.*

---

## Safety & guardrails ("what this isn't")

- **Draft-only · clinician-facing · never patient-facing · never autonomous.** The agent draws the line at *notification, not action*.
- **Asymmetric by design:** actionable upgrades surfaced loudly; the (more common) VUS→benign downgrades handled as quiet de-escalation. False-positive management over raw sensitivity.
- **Provenance is first-class:** a 1★ single submission is never treated as equal to a ClinGen expert-panel call.
- **Actionability-grounded:** urgency tiered by gene (BRCA1/2, Lynch genes highest).
- **Synthetic patients only.** No real PHI anywhere in this repo or demo.
- Unravel does **not** diagnose, does **not** make clinical decisions, and does **not** contact patients. It surfaces a reviewed draft for a qualified clinician.

---

## Tech stack

- **Agent:** Google ADK (code-first, Python), deployed to **Cloud Run** / Agent Runtime
- **Models:** Gemini 3.1 Flash-Lite + Gemini 3.1 Pro (Vertex AI)
- **Partner MCP:** Fivetran + Fivetran MCP server
- **Data:** BigQuery (evidence warehouse) · FHIR R4 patient/VUS registry (HAPI FHIR or FHIR-JSON)
- **Frontend:** React + TypeScript + Vite on Firebase Hosting
- **Secrets:** Secret Manager
- **Optional:** AlphaMissense (computational PP3/BP4 evidence)

---

## Data sources

- **Evidence (real, public):** ClinVar (with dated assertion history), ClinGen, OncoKB, CIViC.
- **Patients (synthetic):** Synthea-style cohort + a hand-crafted demo family whose variant genuinely crossed a reclassification boundary on a known date.
- No real patient data is used.

---

## Evaluation

- **ClinVar time-replay backtest:** replay dated assertion history and measure precision/recall on variants that genuinely got reclassified. _Results: TODO._
- **pytest suite** across all tools, including the withhold/abstention paths. _N tests: TODO._

---

## Quickstart

> Requires a Google Cloud project (Vertex AI, Cloud Run, BigQuery, Firestore, Secret Manager enabled) and a Fivetran account.

```bash
# Backend, ADK agents + API (Python 3.12)
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                      # set GOOGLE_CLOUD_PROJECT (Vertex via Secret Manager in prod)
python hello.py                           # smoke-test the agent on Vertex AI
uvicorn server:app --reload --port 8000   # serve the API the SPA calls

# Frontend, React + Vite SPA (proxies /api to :8000)
cd ../frontend
npm install
npm run dev
```

Deploy: containerise `backend/` → Cloud Run; `npm run build` → Firebase Hosting. See `docs/` for the full deploy + Fivetran connector setup.

---

## Repository layout

```
backend/    ADK agents, tools (Fivetran MCP, detect/match/draft), FHIR write-back
frontend/   React + TypeScript + Vite SPA (time-machine demo)
data/        synthetic patient/VUS registry (FHIR), seed evidence
eval/        ClinVar time-replay backtest + pytest suite
docs/        architecture, deploy, connector setup
```

---

## Built with (compliance)

Per the hackathon's required-products rule, Unravel is built entirely on **Google Cloud AI** (Gemini models, Google ADK / Agent Builder ecosystem, Vertex AI, Cloud Run, BigQuery, Firestore, Secret Manager, Firebase Hosting) and the **Fivetran** track partner's MCP server. No competing cloud or AI services are used in the project.

---

## License

[Apache-2.0](./LICENSE). Open source and free for commercial use.
