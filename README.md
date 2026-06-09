<p align="center">
  <img src="assets/unravel-logo.png" alt="Unravel — Genomics · Clinical Intelligence" width="560">
</p>

# Unravel

**Closing the one diagnostic loop in medicine that stays open for *years*, for the patient *and* their family.**

Unravel is a genomics-native agent that continuously re-reads the world's evolving variant evidence against a clinic's historical genetic reports, and the moment a **Variant of Uncertain Significance (VUS)** is reclassified as dangerous, it drafts the reclassification alert **and** the cascade-testing fan-out for the at-risk family, for a clinician to review and send.

Built for the **Google Cloud Rapid Agent Hackathon** | **Fivetran track**.

- **Live demo (no login):** https://unravel-ra.web.app  ·  **API:** https://unravel-api-306681961993.us-central1.run.app
- **3-minute video:** _coming soon_
- **Powered by** Gemini 3.1 | Google ADK (Agent Builder) on Cloud Run | Fivetran MCP | BigQuery | Firestore (FHIR R4) | AlphaFold + AlphaMissense

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

Five **real Gemini LlmAgents** in a genuine ADK multi-agent flow (`backend/unravel/agents.py`): a `SequentialAgent` root runs Watcher → Adjudicator → a `ParallelAgent` **fan-out / gather** of Planner ‖ Cascade ‖ Steward, all sharing **one Session**. Each agent reads the prior agents' outputs from shared state (the Adjudicator's verdict fans out to the three specialists) and calls deterministic **FunctionTools** for the auditable work, the brain/hands split the Google Agents whitepapers prescribe.

| Agent | Model | Tools it calls | Job |
|---|---|---|---|
| **1. Watcher** | Flash-Lite | `lookup_reclassification`, `check_feed_freshness` | Triage the detected change: is it worth adjudicating, and why? Fivetran freshness is a tool it can check. |
| **2. Adjudicator** | 3.1 Pro | `assemble_evidence` | Weigh the cited ACMG ledger + calibrated posterior against review quality, and **withhold** low-confidence flips. *The moat; the critic in the loop.* |
| **3. Resolution Planner** | 3.1 Pro | `rank_next_experiments` | Recommend the single highest-yield next experiment by information value, in ACMG currency. |
| **4. Cascade Coordinator** | 3.1 Pro | `find_family` | On an actionable verdict, draft clinician-facing recontact for carriers + at-risk relatives (wrapped in draft FHIR `Communication`, `intent: proposal`). |
| **5. Steward** | 3.1 Pro | `steward_assessment` | Route deceased-proband cases to an ethics/next-of-kin pathway (never a letter); draft a ClinVar give-back. |

### Why it's an agent system, not a cron job

Detecting a status flip is deterministic, so it is a **tool**, not an agent. The judgement is the agentic part: ClinVar carries conflicting submissions at different review/star levels, and deciding whether a VUS has *actually* crossed the actionability threshold, correctly **withholding** a 1-star flip while acting on a 3-star one at the *same* molecular posterior, is genuine LLM reasoning. The boundary is explicit and clean: deterministic FunctionTools do the diff, the posterior math, the FHIR envelope; the five Gemini agents do the messy, contradictory, language-heavy reasoning, with a draft-only human-in-the-loop gate.

---

## Architecture

```
== EVIDENCE PLANE =====================================================

   ClinVar       |
   gnomAD        |--->  FIVETRAN  --->  BigQuery  (unified evidence view)
   AlphaMissense |      GCS connectors          AlphaFold DB (structures)

== AGENT PLANE = five Gemini agents, ADK on Cloud Run ================
   SequentialAgent (one shared Session)

   WATCHER  -->  ADJUDICATOR  -->  [ ParallelAgent: fan-out / gather ]
   flash-lite    pro (moat)            |
   triage        posterior +           +--> RESOLUTION PLANNER (pro)
                 WITHHOLD               +--> CASCADE COORDINATOR (pro)
                 (the critic)           +--> STEWARD (pro)

   agents call FunctionTools (the hands):
     lookup_reclassification | assemble_evidence (score_posterior) |
     rank_next_experiments | find_family | Fivetran MCP freshness
                                                     |
                                                     v
   draft FHIR (Firestore: Patient | Observation | FamilyMemberHistory)
                                                     |
   React SPA (Firebase Hosting, /api -> Cloud Run)   v
                    <-- clinician REVIEWS and SENDS (draft-only, HITL)
```

> Live: **https://unravel-ra.web.app** (SPA on Firebase Hosting) rewrites `/api` to the Cloud Run service (same-origin, no CORS); the service runs the ADK agents on Vertex/Gemini over BigQuery + Firestore.

- **Models:** `gemini-3.1-flash-lite` for high-frequency delta classification; `gemini-3.1-pro-preview` for adjudication, the resolution plan, and the recontact-draft synthesis.
- **Science:** a calibrated, point-based Bayesian ACMG posterior (Tavtigian 2018/2020); gnomAD feeds PM2/BS1/BA1, AlphaMissense feeds PP3/BP4, every verdict cites its evidence.
- **Partner superpower (deep MCP):** the loop weaves *multiple* Fivetran MCP operations into its reasoning: freshness checks and targeted re-syncs mid-loop, not a single token call.
- **Clinical seam, FHIR R4:** like Tracer, but inverted. Tracer fires when the EHR *pushes* a result; Unravel fires when external *evidence* changes, reads the FHIR patient registry, and **writes drafts back**. Aligned to the HL7 Genomics Reporting IG. Same webhook pattern, no EHR modification.

---

## The dashboard

A clinician-facing surveillance console (React + TypeScript + Vite), backed by the live engine and organised into tabbed views, led by a headline metric: the number of variants under surveillance and how many have crossed a reclassification boundary.

- **Watchlist**: the cohort ranked by urgency, each with its live calibrated posterior, reclassification direction, and "years silent." Selecting a case runs the full five-agent loop with the agent pipeline lighting up node by node and a streaming activity log.
- **3D structural viewer**: an interactive AlphaFold protein structure (via 3Dmol.js) coloured by AlphaMissense pathogenicity, pLDDT confidence, or pathogenic neighbourhood. The variant residue is highlighted with its 3D context. Rotate, zoom, click between colour modes.
- **Knowledge graph**: a deep, explorable evidence network. The variant branches into ClinVar (classification, review status, submitter count), gnomAD (allele frequency, ACMG criterion), AlphaMissense (score, PP3/BP4), AlphaFold (structure, 3D neighbourhood), the calibrated posterior, and every carrier and at-risk relative. Click any node to see a detail panel explaining what it is and why it matters.
- **Pedigree**: switchable family trees for each reclassified patient. Carriers, at-risk relatives, contact details on file, and the recontact gap (who has no email, who is deceased).
- **FHIR reveal**: click any draft recontact to see the raw FHIR Bundle (Communication + RiskAssessment) the Cascade Coordinator produced. Draft-only, intent: proposal.
- **Resolution plan**: the next-best-evidence card showing which experiment (segregation, tumour IHC/MSI, functional, splicing) would move the needle most, projected posterior, and whether it crosses the actionable threshold.
- **Evidence sources rail**: live Fivetran freshness for each feed via the MCP, with a one-click targeted re-sync.
- **Fivetran control plane (Explorer)**: a single pane over the live connectors, list, health-check, freshness, targeted re-sync, pause/resume, and on-demand connector **creation**, every action driven through the real MCP. A gene looked up often enough surfaces an **onboarding** card that promotes it into the warehouse behind a new connector.
- **Approvals**: a human-in-the-loop queue. Every Fivetran write (a re-sync, a gene onboarding) waits here for an explicit clinician approval before the agent executes it.
- **Audit trail**: a persistent, timestamped record of every clinical verdict and every Fivetran/MCP action with its actor, so the whole loop is accountable after the fact.
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
- **Predictor bias is disclosed and contained:** AlphaMissense is capped supporting evidence inside a multi-source ledger, never the classifier, and is down-weighted a tier for carriers of ancestries under-represented in its training data. We contain its influence and disclose its limits; we do not claim to have fixed the bias.
- **Actionability-grounded:** urgency tiered by gene (BRCA1/2, Lynch genes highest).
- **Privacy-safe by design.** Synthetic data only, so no PHI and nothing HIPAA or GDPR governs is processed. Privacy-by-design and human-in-the-loop are built in; the design is ready to slot into a clinical compliance program (the remaining work to a real deployment is organizational, not architectural). We do not claim to be "compliant", that is an audited status.
- Unravel does **not** diagnose, does **not** make clinical decisions, and does **not** contact patients. It surfaces a reviewed draft for a qualified clinician.

---

## Tech stack

- **Agent:** Google ADK / Agent Builder (code-first, Python), deployed to **Cloud Run** / Agent Runtime
- **Models:** Gemini 3.1 Flash-Lite + Gemini 3.1 Pro (Vertex AI)
- **Partner MCP:** Fivetran + Fivetran MCP server
- **Data:** BigQuery (unified evidence view) | FHIR R4 patient/VUS registry in **Firestore** | AlphaFold DB (structures)
- **Frontend:** React + TypeScript + Vite on Firebase Hosting | 3Dmol.js (protein structure) | react-force-graph-2d (knowledge graph)
- **Secrets:** Secret Manager
- **Science:** point-based Bayesian ACMG posterior; AlphaMissense (PP3/BP4) + gnomAD (PM2/BS1/BA1)

---

## Hackathon requirements (Rapid Agent · Fivetran track)

Every requirement, mapped to where it lives.

| Requirement | How Unravel meets it |
|---|---|
| **Fivetran destination** (BigQuery / Cloud Storage / Cloud SQL) | Three Fivetran **GCS → BigQuery** connectors land ClinVar, gnomAD and AlphaMissense; a curated view (`backend/sql/variant_evidence.sql`) models them into the AI data plane the agents query. |
| **Fivetran MCP server** (hard requirement) | The official `fivetran-mcp` server is baked into the Cloud Run image and driven live by the app: freshness checks (`get_connection_details`) before each adjudication, targeted re-syncs (`sync_connection`), pause/resume (`modify_connection`), and on-demand connector **creation** (`create_connection`) for gene onboarding. `backend/unravel/fivetran_mcp.py`, `onboarding.py`. |
| **Google Cloud AI tooling** | Gemini 3.1 Pro + Flash-Lite (Vertex AI), orchestrated as a five-agent **Google ADK (Agent Builder)** system (Sequential root + Parallel fan-out). `backend/unravel/agents.py`. |
| **End-to-end** | Fivetran MCP → BigQuery data plane → five ADK agents (freshness-checked) → draft FHIR clinical action, all visible on the live dashboard. |
| **Freshness-aware reasoning** | The loop checks each feed's freshness via the MCP before the Adjudicator rules; stale feeds can be re-synced. Agents are only as good as the data they access. |
| **Human-in-the-loop** | Every clinical output is a **draft** FHIR resource a clinician approves; every Fivetran write (onboarding) is gated behind an explicit in-app approval. |
| **Agent CRUD on Fivetran** | The Data explorer is a live control plane: list, health-check, pause, resume, sync, and create connectors, every action logged. |
| **Reproducibility** | `backend/scripts/setup_fivetran.py` recreates the connectors via the MCP; `backend/sql/variant_evidence.sql` recreates the curated view. |
| **Working deployment** | Live at **unravel-ra.web.app** (SPA) + Cloud Run API. |

---

## Data sources

- **Evidence (real, public):** ClinVar (assertions + review stars), gnomAD v4 (allele frequency), AlphaMissense (in-silico missense), AlphaFold (structures). ClinGen expert-panel calls arrive via ClinVar review status; OncoKB / CIViC are future feeds. Onboarded genes are served from the Fivetran-synced warehouse; any other gene is resolved live from the public commons (Ensembl VEP + gnomAD + ClinVar), so the system is disease-agnostic.
- **Patients (synthetic):** a trimmed demo cohort of five carriers, each with a real pedigree (Diane Marchetti, MLH1 c.114C>G, whose variant genuinely crossed a reclassification boundary; Mei Tanaka, the same variant with the ancestry equity arm; the 1-star "trap"; a benign downgrade; a deceased-proband ethics case).
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

**How evidence maps to ACMG criteria.** gnomAD allele frequency → `PM2` (absent / ultra-rare), `BS1` (>1%), `BA1` (>5%). AlphaMissense → `PP3` at a strength that scales with the score (≥0.99 Strong, ≥0.90 Moderate, ≥0.564 Supporting) or `BP4` (≤0.34), the ClinGen-recommended calibration (Pejaver 2022; Bergquist 2025). **Ancestry-aware down-weighting:** because variant-effect predictors carry ancestry bias (Pathak 2024; Livesey & Marsh 2024), for a carrier of an under-represented ancestry the `PP3` is trusted one strength tier lower, so a possibly biased predictor cannot drive the verdict alone and the agent leans on ancestry-robust evidence. (In the demo, Mei Tanaka carries the same variant as Diane but, being East Asian, gets a lower molecular posterior, while the 3-star expert review still drives the action.) Family evidence (`PP1` segregation, `PS3` functional) is supplied from the FHIR registry. The **ClinVar assertion itself is deliberately not minted into points** (that would double-count the discredited PP5/BP6 path); its review status travels alongside as context, which is the seam where the 1-star withhold lives.

> References: Richards 2015 (ACMG/AMP standards); Tavtigian 2018, 2020 (Bayesian point framework); Pejaver 2022, Bergquist 2025 (computational-predictor calibration); Thompson 2014 (InSiGHT mismatch-repair classification). Full bibliography in the submission writeup.

---

## Evaluation

The genuine test is the AI's judgement, not the deterministic plumbing, so that is the headline.

- **The agentic moat, on the live model (`backend/eval/adjudicator_eval.py`):** with the molecular posterior held **identical (0.81)** across the act and withhold arms, the Gemini 3.1 Pro Adjudicator made the right call **12 / 12**, acting on every 3-star expert-panel escalation, **withholding on every 1-star conflicting escalation at the same posterior**, and reassuring on every benign downgrade, across 8 genes. The discrimination a threshold cannot make, demonstrated across 8 genes, not a single demo pair. (Precisely scoped: the agent is given the clinical principle, not the per-case answer, so this measures reliable, generalising judgement.)
- **Calibration:** the posterior reproduces the published ClinGen anchor probabilities to within **0.0001**. A separate check over **31,432 real Lynch variants** shows computational evidence alone (gnomAD + AlphaMissense) is insufficient to determine classification (Brier 0.20), which is exactly why AlphaMissense is capped as supporting evidence and corroboration is required.

Validated for scale against a **600-patient synthetic FHIR cohort carrying variants with real ClinVar reclassification history** (built from the public ClinVar `variant_summary` + `submission_summary` dumps; see `backend/eval/`), spanning 16 hereditary-cancer genes:

- **Detection specificity:** change-detection is deterministic, so the test that matters is whether it false-alarms. Across **48 hard negatives** where the ClinVar *text* changes but the *category* does not (e.g. "Likely pathogenic" → "Pathogenic"), the Watcher raises **zero** false reclassifications, ignoring cosmetic churn and firing only on real category crossings.
- **Safety floor:** withhold-recall **1.0** on the 1-star traps, and **zero dangerous escalations** (nothing that should be withheld or reassured is pushed toward recontact).
- **pytest suite: 74 test functions, 891 cases, all green** (the backtest parametrises detection and action over all 600 cohort patients), covering the calibration anchors, the 1-star withhold, the next-best-evidence tip-over, and the five agents.

> Every result here is one we can stand behind. The headline evidence, the live Adjudicator's judgement and the calibration on 31,432 real variants, is independent and non-trivial; the deterministic steps are validated as correctness checks. The cohort is synthetic patients carrying real variants: a research prototype, rigorously evaluated, not yet clinically validated.

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
PYTHONPATH=. python -m pytest tests/ -q        # 891 cases (83 test functions)
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
  unravel/    the engine: acmg (Bayesian posterior), evidence (ledger) + live_evidence
              (disease-agnostic public-API fallback), detection, registry (FHIR + Firestore),
              adjudicator (Gemini), planner, cascade, steward, structure (AlphaFold),
              fivetran_mcp, onboarding (gene promotion), audit (persistent log),
              assistant (read-only grounded explainer, Flash), watch (orchestration)
  connectors/ a custom Fivetran Connector SDK connector (gnomAD), deployed live
  scripts/    data extractors (gnomAD, AlphaMissense), registry seeder,
              Fivetran setup + MCP smoke test
  sql/        the unified BigQuery evidence view
  tests/      pytest suite (74 functions, 891 cases, all green)
  server.py   FastAPI: /api/cohort, /run-loop (+stream), /pedigree, /graph, /patient,
              /structural, /freshness, /resync, /fivetran/pause, /warehouse,
              /onboard (+status), /audit, /approve, /assist
frontend/
  src/pages/  landing, technology, mission, app dashboard (Watchlist, Explorer,
              Approvals, Audit views)
  src/dash/   graph view, pedigree view, structure viewer, add-patient form,
              assistant widget (ask the data), guided tour
  src/api.ts  typed API client
```

---

## Built with (compliance)

Per the hackathon's required-products rule, Unravel is built entirely on **Google Cloud AI** (Gemini models, Google ADK / Agent Builder ecosystem, Vertex AI, Cloud Run, BigQuery, Firestore, Secret Manager, Firebase Hosting) and the **Fivetran** track partner's MCP server. No competing cloud or AI services are used in the project.

---

## License

[Apache-2.0](./LICENSE). Open source and free for commercial use.
