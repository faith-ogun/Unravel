# Unravel

**Closing the one diagnostic loop in medicine that stays open for *years*, for the patient *and* their family.**

Unravel is a genomics-native agent that continuously re-reads the world's evolving variant evidence against a clinic's historical genetic reports, and the moment a **Variant of Uncertain Significance (VUS)** is reclassified as dangerous, it drafts the reclassification alert **and** the cascade-testing fan-out for the at-risk family, for a clinician to review and send.

Built for the **Google Cloud Rapid Agent Hackathon** | **Fivetran track**.

- **Live demo (no login):** _coming soon_
- **3-minute video:** _coming soon_
- **Powered by** Gemini 3.1 | Google ADK on Cloud Run | Fivetran MCP | BigQuery | Firestore (FHIR R4) | AlphaFold + AlphaMissense

---

## The problem

In 2019, **Diane, 44**, had surgery for **colorectal cancer**. Her germline panel returned a **VUS in *MLH1***, a Lynch syndrome gene. "Uncertain" means *do nothing*, so nothing was done. Her oncologist said, *"if it ever changes, we'll let you know."*

It changed. In **2023 a ClinGen expert panel reclassified that exact variant to likely pathogenic.** The update went public. **It never reached Diane.** No system was watching. Her 22-year-old daughter, who could have begun colonoscopies at 20 and been offered predictive testing the day the variant flipped, later presented with a tumour that Lynch surveillance is built to catch early.

**The variant was reclassified. The loop never closed. The family was never told.**

This is the *"diagnostic loop that never closes,"* rendered genomics-native and temporally extreme:

- A VUS takes **18 to 24 months, 5+ years for rare genes** to reclassify.
- By then the original patient may be in remission or deceased: **24% of genetic counsellors have received a reclassified VUS for a patient who had already died**, with no guideline for what happens next.
- A germline variant is **heritable**, so the life it threatens next is a **relative's**. Unravel is **cascade-first**: the beneficiary is the living at-risk family.
- The **duty to recontact** is described by ACMG itself as *"desirable but not currently feasible."* That sentence is the reason Unravel exists.

It is **disease-agnostic**: hereditary cancer **and** rare/paediatric disease (where reclassification can end a diagnostic odyssey and change reproductive decisions).

---

## What it does

Unravel runs one tight loop, end to end:

**evidence change -> calibrated adjudication -> next-best-evidence plan -> family cascade -> drafted FHIR recontact + ClinVar give-back.**

1. **Watch** evolving evidence (ClinVar + gnomAD + AlphaMissense), kept fresh by Fivetran in BigQuery.
2. **Detect** a material change against the clinic's historical VUS registry (deterministic, auditable).
3. **Adjudicate** with a calibrated Bayesian ACMG posterior, reasoning over cited, conflicting evidence and **withholding** low-confidence flips (a 1-star conflicting assertion is not a 3-star expert panel, even at the same molecular posterior).
4. **Plan** the single highest-yield experiment that would resolve a still-uncertain variant.
5. **Match** the affected patient *and* at-risk first-degree relatives, and **draft** the recontact + cascade fan-out as **draft-only FHIR resources**.
6. **Give back** a draft ClinVar submission on resolution; route deceased-proband cases to ethics, not a letter.

---

## The five agents

Genuinely multi-agent (an ADK coordinator pattern), each operating on different data, on a different clock.

| Agent | Model | Clock | Job |
|---|---|---|---|
| **1. Watcher** (Evidence Surveillance) | Flash-Lite | the *evidence's* clock, wakes on a change | Deterministic, auditable delta-detection vs the VUS registry. **Fivetran is its heartbeat.** |
| **2. Adjudicator** (Clinical Significance) | 3.1 Pro | fires when the Watcher flags a change | Build the cited ACMG ledger, compute a calibrated posterior, weight review status, **withhold** low-confidence flips. *The moat.* |
| **3. Resolution Planner** (Next-Best-Evidence) | 3.1 Pro | proactive on warm/hot variants | Rank the next experiment (segregation, tumour MMR-IHC/MSI, functional, splicing) by information value, in ACMG currency. *The never-done core.* |
| **4. Cascade Coordinator** (Recontact & Fan-out) | 3.1 Pro | only on a confirmed actionable upgrade | Match carriers + at-risk relatives; draft FHIR `Task` / `Communication` / `RiskAssessment` (`intent: proposal`). *The genomics-native wow.* |
| **5. Steward** (Ethics & Give-back) | 3.1 Pro | edge cases + on resolution | Route deceased-proband cases to an ethics/next-of-kin pathway (never a letter); draft a ClinVar give-back submission. |

### Why it's an agent, not a cron job

Detecting a status flip is deterministic. **Adjudicating it is not.** ClinVar carries conflicting submissions at different review/star levels; expert panels disagree with single-submitter assertions; ontologies mismatch. Deciding whether a VUS has *actually* crossed the actionability threshold, and correctly **withholding** a flip that's only a low-confidence single-submitter assertion, is genuine LLM reasoning. The **rules / AI boundary** is explicit: deterministic code does the diff and gene-tier rules; the Gemini agents do the messy, contradictory, language-heavy adjudication.

---

## Architecture

```
== EVIDENCE PLANE =====================================================

   ClinVar       |
   gnomAD        |--->  FIVETRAN  --->  BigQuery  (unified evidence view)
   AlphaMissense |      GCS connectors          AlphaFold DB (structures)

== AGENT PLANE = ADK multi-agent on Cloud Run =========================

   WATCHER --> ADJUDICATOR --> RESOLUTION --> CASCADE --> STEWARD
   flash-lite   3.1 Pro       PLANNER       3.1 Pro    3.1 Pro
   detect       posterior +   next-best-    draft FHIR  ethics +
   (data diff)  WITHHOLD      evidence      recontact   ClinVar give-back
        |       (the moat)        |             |            |
        v            |            v             v            v
   BigQuery   FIVETRAN MCP   score_posterior  FHIR R4 registry (Firestore)
              freshness +                     Patient | Observation |
              targeted re-sync                FamilyMemberHistory
              (in the loop)                          |
                                                     v
   React dashboard  <-- clinician REVIEWS and SENDS (draft-only, HITL)
```

- **Models:** `gemini-3.1-flash-lite` for high-frequency delta classification; `gemini-3.1-pro-preview` for adjudication, the resolution plan, and the recontact-draft synthesis.
- **Science:** a calibrated, point-based Bayesian ACMG posterior (Tavtigian 2018/2020); gnomAD feeds PM2/BS1/BA1, AlphaMissense feeds PP3/BP4, every verdict cites its evidence.
- **Partner superpower (deep MCP):** the loop weaves *multiple* Fivetran MCP operations into its reasoning: freshness checks and targeted re-syncs mid-loop, not a single token call.
- **Clinical seam, FHIR R4:** like Tracer, but inverted. Tracer fires when the EHR *pushes* a result; Unravel fires when external *evidence* changes, reads the FHIR patient registry, and **writes drafts back**. Aligned to the HL7 Genomics Reporting IG. Same webhook pattern, no EHR modification.

---

## The dashboard

A clinician-facing surveillance console (React + TypeScript + Vite), backed by the live engine:

- **Watchlist**: the cohort ranked by urgency, each with its live calibrated posterior, reclassification direction, and "years silent." Selecting a case runs the full five-agent loop with the agent pipeline lighting up node by node and a streaming activity log.
- **3D structural viewer**: an interactive AlphaFold protein structure (via 3Dmol.js) coloured by AlphaMissense pathogenicity, pLDDT confidence, or pathogenic neighbourhood. The variant residue is highlighted with its 3D context. Rotate, zoom, click between colour modes.
- **Knowledge graph**: a deep, explorable evidence network. The variant branches into ClinVar (classification, review status, submitter count), gnomAD (allele frequency, ACMG criterion), AlphaMissense (score, PP3/BP4), AlphaFold (structure, 3D neighbourhood), the calibrated posterior, and every carrier and at-risk relative. Click any node to see a detail panel explaining what it is and why it matters.
- **Pedigree**: switchable family trees for each reclassified patient. Carriers, at-risk relatives, contact details on file, and the recontact gap (who has no email, who is deceased).
- **FHIR reveal**: click any draft recontact to see the raw FHIR Bundle (Communication + RiskAssessment) the Cascade Coordinator produced. Draft-only, intent: proposal.
- **Resolution plan**: the next-best-evidence card showing which experiment (segregation, tumour IHC/MSI, functional, splicing) would move the needle most, projected posterior, and whether it crosses the actionable threshold.
- **Evidence sources rail**: live Fivetran freshness for each feed via the MCP, with a one-click targeted re-sync.
- **Add patient**: write a new FHIR Patient to the registry from the UI with a professional clinical intake form.

Everything shown is computed live (posteriors from BigQuery, verdicts from Gemini, structure from AlphaFold); only the patient cohort is synthetic.

---

## Prior art and how Unravel differs

We acknowledge existing work openly. Each tool owns only **one** link of the chain:

| Capability | iVar *(lab DB)* | VUSVista *(curation aid)* | **Unravel** |
|---|:---:|:---:|:---:|
| Detect evidence changed | no | yes (curator) | yes (autonomous) |
| Find who carries the variant | yes (DB lookup) | no | yes (patient + pedigree) |
| Reason over discordant evidence | no | no | yes (agentic + withhold) |
| Fan out to the at-risk family | no | no | yes (cascade) |
| Draft recontact / FHIR write-back | no | no | yes (draft-only) |
| An autonomous agent (vs human tool) | no | no | yes (ADK multi-agent) |

> *iVar tells a lab **who** carries a variant. VUSVista tells a curator **when** the evidence moved. Unravel is the autonomous agent that does both, then closes the loop the others leave open: it reasons about whether the change is real, finds the patient **and the at-risk family**, and drafts the recontact no one else is built to send.*

---

## Safety and guardrails ("what this isn't")

- **Draft-only, clinician-facing, never patient-facing, never autonomous.** The agent draws the line at *notification, not action*.
- **Asymmetric by design:** actionable upgrades surfaced loudly; the (more common) VUS-to-benign downgrades handled as quiet de-escalation. False-positive management over raw sensitivity.
- **Provenance is first-class:** a single-submitter assertion is never treated as equal to a ClinGen expert-panel call.
- **Actionability-grounded:** urgency tiered by gene (BRCA1/2, Lynch genes highest).
- **Synthetic patients only.** No real PHI anywhere in this repo or demo.
- Unravel does **not** diagnose, does **not** make clinical decisions, and does **not** contact patients. It surfaces a reviewed draft for a qualified clinician.

---

## Tech stack

- **Agent:** Google ADK (code-first, Python), deployed to **Cloud Run** / Agent Runtime
- **Models:** Gemini 3.1 Flash-Lite + Gemini 3.1 Pro (Vertex AI)
- **Partner MCP:** Fivetran + Fivetran MCP server
- **Data:** BigQuery (unified evidence view) | FHIR R4 patient/VUS registry in **Firestore** | AlphaFold DB (structures)
- **Frontend:** React + TypeScript + Vite on Firebase Hosting | 3Dmol.js (protein structure) | react-force-graph-2d (knowledge graph)
- **Secrets:** Secret Manager
- **Science:** point-based Bayesian ACMG posterior; AlphaMissense (PP3/BP4) + gnomAD (PM2/BS1/BA1)

---

## Data sources

- **Evidence (real, public):** ClinVar (assertions + review stars), gnomAD v4 (allele frequency), AlphaMissense (in-silico missense), AlphaFold (structures). ClinGen expert-panel calls arrive via ClinVar review status; OncoKB / CIViC are future feeds.
- **Patients (synthetic):** a hand-crafted demo family (Diane Marchetti, MLH1 c.114C>G) whose variant genuinely crossed a reclassification boundary, plus silent-cohort carriers, a deceased-proband case, and the 1-star "trap." A mixed, fictional cohort of 20 patients across varied backgrounds.
- No real patient data is used.

---

## The calibrated Bayesian model (the science spine)

The posterior is not a confidence we invented; it is the published, point-based Bayesian formulation of the ACMG/AMP guidelines, implemented in `backend/unravel/acmg.py`.

**The equation.** Each line of evidence is worth signed ACMG points; the points combine into an odds of pathogenicity, and Bayes' rule converts prior + odds into a posterior:

```
OddsPath  = Odds_PVSt ^ (points / 8)                         # Odds_PVSt = 350
Posterior = (Prior x OddsPath) / (1 + Prior x (OddsPath - 1))  # Prior = 0.10
```

**Evidence strength is a power of the odds**, equivalently a number of points (Tavtigian 2020):

| Strength | Points | Odds factor |
|---|---|---|
| Supporting | 1 | `350^(1/8)` ≈ 2.02 |
| Moderate | 2 | `350^(2/8)` ≈ 4.08 |
| Strong | 4 | `350^(4/8)` ≈ 18.7 |
| Very Strong | 8 | 350 |

Benign evidence carries the same magnitudes with a negative sign. Summing the points and applying the formula reproduces the ClinGen anchor probabilities, and the engine hits them to within **0.0001** (verified by `backend/eval/calibration.py`):

| ACMG points | Band threshold | Posterior |
|---|---|---|
| 0 | (prior) | 0.10 |
| +6 | **Likely pathogenic** (the actionable line) | 0.90 |
| +8 | | 0.975 |
| +10 | **Pathogenic** | 0.994 |
| −7 | **Benign** | ~0.001 |

**How evidence maps to ACMG criteria.** gnomAD allele frequency → `PM2` (absent / ultra-rare), `BS1` (>1%), `BA1` (>5%). AlphaMissense → `PP3` at a strength that scales with the score (≥0.99 Strong, ≥0.90 Moderate, ≥0.564 Supporting) or `BP4` (≤0.34), the ClinGen-recommended calibration (Pejaver 2022; Bergquist 2025). Family evidence (`PP1` segregation, `PS3` functional) is supplied from the FHIR registry. The **ClinVar assertion itself is deliberately not minted into points** (that would double-count the discredited PP5/BP6 path); its review status travels alongside as context, which is the seam where the 1-star withhold lives.

> References: Richards 2015 (ACMG/AMP standards); Tavtigian 2018, 2020 (Bayesian point framework); Pejaver 2022, Bergquist 2025 (computational-predictor calibration); Thompson 2014 (InSiGHT mismatch-repair classification). Full bibliography in the submission writeup.

---

## Evaluation

Validated against a **600-patient synthetic FHIR cohort carrying variants with real ClinVar reclassification history** (built from the public ClinVar `variant_summary` + `submission_summary` dumps; see `backend/eval/`). The cohort spans 16 hereditary-cancer genes and a controlled mix of upgrades, downgrades, 1-star traps, deceased probands, and cascade families.

- **Detection specificity (the meaningful test):** across **48 hard negatives** where the ClinVar *text* changes but the *category* does not (e.g. "Likely pathogenic" → "Pathogenic", cosmetic benign churn), the Watcher raises **zero** false reclassifications. (Detecting the genuine reclassifications is a deterministic category diff and correct by construction, so we report that as a regression check, not as accuracy.)
- **Safety floor:** withhold-recall **1.0** on the 1-star traps, and **zero dangerous escalations** (nothing that should be withheld or reassured is ever pushed toward family recontact).
- **Calibration:** the posterior reproduces the published ClinGen anchor probabilities to within **0.0001**. A separate check over **31,432 real Lynch variants** shows that computational evidence alone (gnomAD + AlphaMissense) is insufficient to determine classification (Brier 0.20), which is exactly why AlphaMissense is capped as supporting evidence and corroboration is required.
- **pytest suite: 876 tests** (engine, tools, and the parametric backtest), including the calibration anchors, the 1-star withhold, the next-best-evidence tip-over, and one assertion per cohort patient for detection and action.
- The live Gemini Adjudicator is validated independently on the demo cases via `backend/scripts/run_adjudication.py`.

> Honest framing: the cohort is *synthetic patients carrying real variants*, not real patient data, and is not clinically validated. The deterministic action floor's scores are reported as a safety regression check; the moat (grounded reasoning over discordant evidence) is validated by the live Adjudicator.

---

## Quickstart

> Requires a Google Cloud project (Vertex AI, Cloud Run, BigQuery, Firestore, Secret Manager enabled) and a Fivetran account.

```bash
# Backend: ADK agents + API (Python 3.12)
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                       # set GOOGLE_CLOUD_PROJECT
PYTHONPATH=. python scripts/seed_registry.py   # seed the FHIR cohort into Firestore
PYTHONPATH=. python -m pytest tests/ -q        # 876 tests
PYTHONPATH=. uvicorn server:app --reload --port 8000   # serve the API

# Frontend: React + Vite SPA (proxies /api to :8000)
cd ../frontend
npm install && npm run dev
```

Then open **http://localhost:5173/app** (the dashboard), pick a flagged patient, and run the watch loop. `PYTHONPATH=.` is required so the `unravel` package imports.

Deploy: containerise `backend/` to Cloud Run; `npm run build` to Firebase Hosting.

---

## Repository layout

```
backend/
  unravel/    the engine: acmg (Bayesian posterior), evidence (ledger), detection,
              registry (FHIR + Firestore), adjudicator (Gemini), planner, cascade,
              steward, structure (AlphaFold), fivetran_mcp, watch (orchestration)
  scripts/    data extractors (gnomAD, AlphaMissense), registry seeder, MCP smoke test
  sql/        the unified BigQuery evidence view
  tests/      pytest suite (61)
  server.py   FastAPI: /api/cohort, /adjudicate, /plan, /cascade, /steward,
              /structural, /pedigree, /graph, /patient, /freshness, /resync
frontend/
  src/pages/  landing page, technology page, mission page, app dashboard
  src/dash/   graph view, pedigree view, structure viewer, add-patient form
  src/api.ts  typed API client
```

---

## Built with (compliance)

Per the hackathon's required-products rule, Unravel is built entirely on **Google Cloud AI** (Gemini models, Google ADK / Agent Builder ecosystem, Vertex AI, Cloud Run, BigQuery, Firestore, Secret Manager, Firebase Hosting) and the **Fivetran** track partner's MCP server. No competing cloud or AI services are used in the project.

---

## License

[Apache-2.0](./LICENSE). Open source and free for commercial use.
