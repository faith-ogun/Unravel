# Unravel, Project Definition (A to Z)

**Tagline:** *The variant commons is passive. Unravel makes it active.*

The global variant knowledge commons (ClinVar, ClinGen, OncoKB, CIViC) accumulates evidence and waits for a human to come check it. Unravel is the missing **active layer**: a genomics agent that pulls evidence to **resolve** a clinic's uncertain variants, **activates** the at-risk family the moment one becomes dangerous, and **pushes new evidence back** to the commons so the next patient resolves faster. It never sends; it drafts for a clinician.

- **Hackathon:** Google Cloud Rapid Agent Hackathon (deadline 11 June 2026)
- **Track:** **Fivetran**
- **Builder:** Faith Ogundimu, cancer geneticist / PhD cancer genomics
- **Models:** Gemini 3.1 (Flash-Lite + Pro) on Vertex AI, code-first ADK to Cloud Run

---

## A. The Problem

A germline or tumour panel often returns a **variant of uncertain significance (VUS)**, a change the lab cannot yet call benign or pathogenic. Clinically, "uncertain" means *do nothing*. But the evidence does not stand still: as data accrues in ClinVar, ClinGen, OncoKB, and CIViC, a meaningful fraction of VUS get **reclassified**, and the clinically catastrophic minority flip **VUS to likely pathogenic / pathogenic**, changing surveillance, prophylaxis, and family (cascade) testing.

Two failures compound:

1. **Nobody watches.** When a variant flips, no system re-contacts the patient or their at-risk relatives. The report sits in a PDF; the ordering clinician has moved on; the lab has no obligation to re-issue. The **duty to recontact** is described by ACMG as "desirable but not currently feasible." Median time to reclassification is around **7 years** (BMJ, Goh 2024).

2. **Nobody resolves.** Long before a flip, a clinician has no system telling them *which* of their hundreds of VUS are close to actionable, *what specific evidence* would resolve each one, or *who in the family* could provide it. A VUS spans roughly a **10% to 90%** probability of pathogenicity, and that range is invisible at the point of care.

**The cascade-first reframe.** Because reclassification takes years, the original patient may be in remission or deceased by the time a VUS flips. That is not a flaw in the idea; it is the reason it matters. A germline variant that flips is a **family** event: the life saved is often a **relative's**. In a 2024 survey, **24% of genetic counsellors had received a reclassified VUS for a patient who had already died, with no guideline for what to do next**. Unravel is cascade-first: the beneficiary is the living at-risk family.

**Disease-agnostic.** The same loop fails in rare and paediatric disease, where reclassification can end a diagnostic odyssey and change reproductive decisions. The hero demo is hereditary cancer (Lynch); the engine spans germline hereditary disease.

---

## B. The Named Victim (the opening story)

> In 2019, **Diane, 44**, had surgery for **colorectal cancer**. Her germline panel returned a **VUS in *MLH1***, a Lynch syndrome gene. "Uncertain" meant nothing was done. Her oncologist said, "if it ever changes, we'll let you know." It changed: in **2023 a ClinGen expert panel reclassified that exact variant to likely pathogenic.** The update went public. It never reached Diane. No system was watching. Her **22-year-old daughter**, who could have started colonoscopies at 20 and been offered predictive testing the day the variant flipped, later presented with a tumour that Lynch surveillance is built to catch early. The variant was reclassified. The loop never closed.

---

## C. The Core Idea

Unravel runs one loop, end to end, over the clinic's historical VUS registry:

**watch evidence -> build the evidence ledger and posterior -> triage which VUS are hot -> plan the evidence that would resolve them -> adjudicate confirmed flips -> activate the at-risk family -> give the new evidence back to the commons.**

Every clinical output is a **draft** for a qualified clinician. The agent draws the line at notification, not action.

---

## D. The Reframe (passive commons to active layer)

This is the whole idea in one move. Today's tools are passive:

- **VUSVista** monitors updates and notifies (watch).
- **iVar** identifies which patients carry a variant (lookup).
- **AlphaMissense / ClinGen** score individual variants (annotation).

Each owns one link and waits for a human. **What has never been built is the active integration:** one autonomous agent that triages hot VUS, *computes the evidence that would resolve them*, activates the at-risk family on a real flip, routes the deceased-proband case to ethics, and *contributes new evidence back* to ClinVar, all on a live evidence feed. Unravel claims the integration, not the parts.

---

## E. The Five Agents (genuinely multi-shape: distinct data, distinct clocks)

| Agent | Model | Clock | Data | Job |
|---|---|---|---|---|
| **1. Watcher** (surveillance) | 3.1 Flash-Lite | the evidence's clock, wakes on a Fivetran-detected change | synced evidence feeds | Change detection vs the VUS registry; triage which changes matter. **Fivetran is its heartbeat.** |
| **2. Adjudicator** (Bayesian evidence synthesis) | 3.1 Pro | fires on a flagged change | multi-source ACMG evidence (ClinVar + stars, gnomAD, AlphaMissense, splicing, segregation, structure, literature) | Build the evidence ledger, compute a calibrated **posterior probability of pathogenicity**, classify cold/warm/hot/actionable, **withhold** weak flips. **The moat.** |
| **3. Resolution Planner** (next-best-evidence) | 3.1 Pro | proactive, for any hot or warm VUS | the ledger + what evidence is obtainable | Compute the **information value** of each candidate next experiment and recommend the single highest-yield move, in ACMG currency. **The never-done core.** |
| **4. Cascade Coordinator** (family activation) | 3.1 Pro | only on a confirmed actionable upgrade | pedigree (FHIR FamilyMemberHistory / RelatedPerson) + care team | Identify at-risk relatives; draft the clinician alert + cascade fan-out as draft FHIR resources. **The genomics-native wow.** |
| **5. Steward** (ethics + commons) | 3.1 Pro | on edge cases and on resolution | patient status, consent, resolved evidence | Route deceased-proband cases to **ethics/legal review** (no guidelines exist); draft the **ClinVar submission back** when Unravel-orchestrated evidence resolves a VUS. **The systemic novelty.** |

---

## F. Signature capabilities (the "wow")

1. **The Live Bayesian VUS Meter.** A calibrated posterior probability of pathogenicity, rendered as a gauge that moves as evidence flows in through Fivetran, with the full evidence ledger behind it and exactly what is missing to cross the actionable line.
2. **The 3D Structural Story.** A confusing one-line text VUS blooms into a 3D **AlphaFold** protein structure with the variant residue highlighted, an **AlphaMissense** pathogenicity heatmap across the domain, and the known-pathogenic neighbours clustered around it. The science made visible, and pure DeepMind/Google.
3. **The Next-Best-Evidence Plan.** "Posterior 0.62 (VUS). Segregation in the affected sister yields PP1; with the existing AlphaMissense PP3 that crosses the LP threshold (to 0.91). Recommended next step: sister segregation. Do not initiate cascade testing until LP/P."
4. **The Cohort Counterfactual.** Not one Diane: the whole silent cohort sitting in the gap right now, with median days of delay and at-risk relatives never offered testing, derived from real ClinVar reclassification dates.
5. **The Give-Back Flywheel.** When orchestrated evidence resolves a VUS, Unravel drafts the ClinVar submission back to the commons. It does not just consume the commons; it improves it.

---

## G. The Science Layer (how grounding works)

The Adjudicator does **grounded agentic reasoning**, not rule-firing. It assembles an **ACMG/AMP evidence ledger** and computes a posterior using the published **point-based Bayesian** framework (Tavtigian 2018; ClinGen calibration), so the output is a calibrated probability, not a vibe.

Evidence streams and their ACMG codes:

| Stream | Source | ACMG code(s) |
|---|---|---|
| Clinical assertions + review stars | ClinVar / ClinGen | the clinical anchor |
| Population frequency | gnomAD | PM2 / BS1 / BA1 |
| Computational (missense) | **AlphaMissense** (ClinGen-calibrated) | PP3 / BP4 |
| Splicing | SpliceAI | PP3 / BP4 (splice) |
| Structural context | **AlphaFold** neighbour analysis | supporting |
| Segregation | pedigree | PP1 |
| De novo | trio | PS2 / PM6 |
| Functional | literature | PS3 / BS3 |

Every verdict **cites the evidence behind it** ("defensible by design"). AlphaMissense and structural context are **supporting computational evidence, never the classifier**; ACMG classification stays with experts.

---

## H. The Agentic Moat (why this is not a cron job)

Detecting a status change is plumbing. The hard parts are AI:

- **Synthesising discordant, multi-source evidence** into a calibrated posterior, then **withholding** when a single 1-star submission is not enough (the credibility beat, a naive rules engine fires a false alarm here).
- **Computing the next experiment that resolves the uncertainty**, decision-theoretic reasoning in ACMG currency that encodes a geneticist's judgment.
- **Reading the structural and family context** to explain *why* a variant matters.

The withhold and the resolution plan are **AI judgments proven reliable by the backtest**, not hard-coded rules. Determinism is confined to plumbing (the data diff) and the draft-only safety gate.

---

## I. Clinical guardrails (intellectual honesty is a winning pattern)

- **Draft-only, clinician-facing, never patient-facing, never autonomous.**
- **Withholds on cold/warm VUS; never pushes family testing on an uncertain variant.** Acting on a VUS risks a cascade of unnecessary tests, anxiety, and overdiagnosis.
- **The deceased-proband path routes to ethics/legal review, not a letter.** There are no guidelines for disclosing a reclassified VUS of a dead patient to relatives.
- **Asymmetric:** actionable upgrades surfaced loudly; the more common benign downgrades handled as quiet de-escalation.
- **AlphaMissense / structure are supporting evidence, not the authority.**
- **Synthetic patients only. No real PHI.**

---

## J. Technical Architecture (Fivetran track)

- **Path:** code-first ADK to Cloud Run. **Models:** `gemini-3.1-flash-lite` (Watcher / delta) + `gemini-3.1-pro-preview` (Adjudicator, Resolution Planner, Cascade, Steward). *(Verified in project `unravel-ra`, location `global`, 3 Jun 2026.)*
- **Fivetran seam (load-bearing):** Fivetran syncs the evidence feeds into BigQuery; the agent calls the **Fivetran MCP server** inside its loop to check freshness, trigger targeted re-syncs, and read sync history as the change signal. Multiple evolving feeds, agentic tool-use, not a single call.
- **Tools (task-shaped):**
  - `fivetran.get_sync_status` / `trigger_sync` / `get_schema` (MCP)
  - `detect_reclassifications(since)` (the data diff)
  - `build_evidence_ledger(variant)` (assemble ClinVar / gnomAD / AlphaMissense / literature into an ACMG ledger)
  - `score_posterior(ledger)` (Bayesian point computation)
  - `structural_context(variant)` (AlphaFold + AlphaMissense neighbour analysis)
  - `plan_next_evidence(variant, ledger, pedigree)` (information-value ranking)
  - `match_affected_patients(variant)`
  - `draft_recontact(case)` (draft-only)
  - `draft_clinvar_submission(variant, resolved_evidence)` (the give-back, draft-only)
- **Stores:** BigQuery (evidence warehouse) + a **FHIR R4** patient/VUS registry in Firestore (`Patient`, variant `Observation` per HL7 Genomics Reporting IG, `FamilyMemberHistory` / `RelatedPerson`). Write-back as draft `Task` / `Communication` / `RiskAssessment` (`intent: proposal`, `status: draft`). Visible via a "View as FHIR" reveal.
- **Structures:** AlphaFold DB (public) for the structural story.
- **Frontend:** React / Vite on Firebase Hosting. **Secrets:** Secret Manager.

---

## K. Data Sources

- **Evidence (real, public):** ClinVar (dated assertion history), ClinGen, OncoKB, CIViC, gnomAD, AlphaMissense (UCSC), AlphaFold DB.
- **Patients (synthetic):** Synthea-style cohort + a hand-crafted demo family whose MLH1 variant genuinely crossed a reclassification boundary on a known date, including the 1-star "trap" submission for the withhold beat.
- No real patient data.

---

## L. The Demo (no-login sandbox, the 30-second arc)

A text VUS blooms into a **3D structural story**; the **Bayesian needle climbs** past the actionable line as years of evidence stream in via a visible Fivetran sync; the **Resolution Planner** names the one test that would have resolved it sooner; at the actionable threshold the **family tree ignites**; the **deceased-proband branch routes to ethics review**, not a letter; a **ClinVar submission drafts back** to the world. Wrapped in a **time machine** (rewind to 2019, fast-forward to today) over a genuine historical reclassification, so the judge watches the evidence change and the agent catch it. Every clinical output stamped *DRAFT, clinician review required, not sent.*

---

## M. Evaluation (credibility)

- **ClinVar time-replay backtest:** replay dated assertion history; report precision/recall on variants that genuinely got reclassified, and verify the **trajectory** (weighted the 3-star panel, withheld the 1-star trap), not just the final call. ADK `adk eval` with `.test.json` golden trajectories.
- **LLM-as-a-Judge** (pairwise, Gemini Pro) on adjudication and resolution-plan quality.
- **pytest** across all tools including withhold/abstention paths.
- **Cohort metrics + one cited impact number:** per-patient cascade value and a delayed-surveillance mortality figure from published literature.

---

## N. Differentiation

- **Active vs passive:** the components exist (VUSVista watches, iVar identifies, AlphaMissense scores); the **autonomous active-layer integration** has not been built.
- **Cascade ignition + give-back** are done by no existing system or competing entry.
- **Domain authority:** authored by a cancer geneticist; the next-best-evidence reasoning encodes real clinical judgment a CS-only competitor cannot fake.
- **Partner integration is structural:** the evolving-evidence sync is the mechanism of the loop closing, not decoration.

> Full competitor breakdown: `metadata/differentiation-analysis.md`.

---

## O. Scope Discipline

Build **one loop**, deeply. The two true differentiators are the **Next-Best-Evidence engine** and the **3D structural story**; the Bayesian meter is the connective tissue; cohort and give-back are the "and it scales / and it gives back" beats. Demo one Lynch case to a polish; say disease-agnostic, do not demo every disease. Out of scope: intake, prior auth, NGS report PDF parsing, autonomous messaging, treatment recommendations.

---

## P. Compliance

Built entirely on **Google Cloud AI** (Gemini via Vertex AI, ADK / Agent Runtime, Cloud Run, BigQuery, Firestore, Secret Manager, Firebase Hosting) and the **Fivetran** track partner (connectors + MCP server). The shipped product's AI is Google's; no competing cloud or AI services run in the product. Public repo, OSI license visible.

---

## Z. One-line summary

**Unravel is the active layer of the variant commons: it resolves a clinic's uncertain variants, activates the at-risk family the moment one turns dangerous, and gives the new evidence back to the world, built on Gemini 3.1 + Google Cloud ADK with Fivetran as the living-evidence heartbeat.**

---

*Project definition v2. Last updated 3 June 2026.*
