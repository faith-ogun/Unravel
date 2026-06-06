"""Unit tests for the Day-5 agents: Resolution Planner, Cascade, Steward, and the
watch helpers. All run offline by injecting the pure demo registry resources
(`registry.build_resources()`), no BigQuery / Firestore / LLM.
"""

from __future__ import annotations

from unravel import registry, watch
from unravel.acmg import Ledger, Strength
from unravel.cascade import draft_recontact
from unravel.evidence import EvidenceContext
from unravel.planner import plan_next_evidence
from unravel.registry import HERO, MSH2_LP, build_resources
from unravel.steward import steward_review


def _trap_ctx() -> EvidenceContext:
    """The withheld trap's molecular ledger: PM2 + AlphaMissense-strong PP3 = 5 pts (0.81)."""
    led = Ledger(variant="MLH1 demo")
    led.add("PM2", source="gnomAD v4", detail="absent", strength=Strength.SUPPORTING)
    led.add("PP3", source="AlphaMissense", detail="am 0.99", strength=Strength.STRONG)
    return EvidenceContext(ledger=led, gene_symbol="MLH1", review_stars=1)


# --- Resolution Planner --------------------------------------------------------


def test_planner_recommends_a_crossing_experiment():
    plan = plan_next_evidence(_trap_ctx())
    assert plan.current_points == 5
    assert plan.gap_to_actionable == 1
    assert plan.steps, "should propose candidate experiments"
    assert any(s.crosses_actionable for s in plan.steps)
    assert "crossing the actionable line" in plan.recommendation


def test_planner_skips_criteria_already_in_the_ledger():
    # PP3 is already met, so the RNA/splicing candidate (code PP3) must be skipped
    plan = plan_next_evidence(_trap_ctx())
    assert all(not (s.code == "PP3") for s in plan.steps)


def test_planner_projected_posteriors_are_real_math():
    plan = plan_next_evidence(_trap_ctx())
    # every projected posterior is a probability and >= the current one for pathogenic evidence
    for s in plan.steps:
        assert 0.0 <= s.projected_posterior <= 1.0
        assert s.projected_posterior >= plan.current_posterior - 1e-9


def test_planner_when_nothing_crosses_says_so():
    # empty ledger (0 pts, gap 6): no single supporting/strong experiment reaches 6
    plan = plan_next_evidence(EvidenceContext(ledger=Ledger(variant="far")))
    assert plan.gap_to_actionable == 6
    assert not any(s.crosses_actionable for s in plan.steps)
    assert "No single experiment crosses" in plan.recommendation


def test_planner_as_dict_shape():
    d = plan_next_evidence(_trap_ctx()).as_dict()
    assert {"variant", "current_points", "current_posterior", "gap_to_actionable",
            "recommendation", "steps"} <= set(d)
    assert isinstance(d["steps"], list) and d["steps"]


# --- Cascade Coordinator -------------------------------------------------------


def test_cascade_drafts_carriers_and_relatives():
    res = draft_recontact(HERO.key, gene="MLH1", hgvs="c.114C>G", data=build_resources())
    # HERO carriers: Diane + 3 silent Dianes (none deceased); Diane's 3 relatives
    assert res["carriers"] == 4
    assert res["relatives"] == 3
    assert len(res["drafts"]) == 7
    assert res["deceased_carriers"] == []


def test_cascade_is_draft_only():
    res = draft_recontact(HERO.key, gene="MLH1", hgvs="c.114C>G", data=build_resources())
    assert res["status"] == "draft"
    for d in res["drafts"]:
        comm = d["communication"]
        assert comm["status"] == "draft"
        assert comm["intent"] == "proposal"


def test_cascade_relatives_get_risk_assessment():
    res = draft_recontact(HERO.key, gene="MLH1", hgvs="c.114C>G", data=build_resources())
    relatives = [d for d in res["drafts"] if d["relationship"] != "carrier"]
    assert relatives and all("risk_assessment" in d for d in relatives)


def test_cascade_excludes_deceased_carrier():
    # MSH2_LP's only carrier (Thomas) is deceased -> no direct letter, routed out
    res = draft_recontact(MSH2_LP.key, gene="MSH2", hgvs="c.2251G>C", data=build_resources())
    assert res["carriers"] == 0
    assert res["deceased_carriers"]  # Thomas surfaced for the Steward instead


# --- Steward -------------------------------------------------------------------


def test_steward_routes_deceased_to_ethics_not_a_letter():
    res = steward_review(MSH2_LP.key, gene="MSH2", hgvs="c.2251G>C",
                         current_class="Likely pathogenic", review_stars=3,
                         cited=["PM2 +1", "PP3 +4"], data=build_resources())
    assert res["has_deceased_carrier"] is True
    assert res["ethics_routes"]
    route = res["ethics_routes"][0]
    assert "ethics" in route["route"].lower()
    assert route["living_relatives"]  # David Nguyen should be offered counselling


def test_steward_give_back_is_draft_only():
    res = steward_review(MSH2_LP.key, gene="MSH2", hgvs="c.2251G>C",
                         current_class="Likely pathogenic", review_stars=3,
                         cited=["PM2 +1"], data=build_resources())
    gb = res["give_back"]
    assert gb["status"] == "draft"
    assert gb["submitted_classification"] == "Likely pathogenic"
    assert gb["evidence"] == ["PM2 +1"]


def test_steward_no_deceased_carrier_no_ethics_route():
    # HERO carriers are all living -> no ethics routing
    res = steward_review(HERO.key, gene="MLH1", hgvs="c.114C>G",
                         current_class="Pathogenic", review_stars=3,
                         cited=[], data=build_resources())
    assert res["has_deceased_carrier"] is False
    assert res["ethics_routes"] == []


# --- watch helpers (no BigQuery) -----------------------------------------------


def test_watch_patient_name_helper():
    p = {"name": [{"given": ["Diane"], "family": "Marchetti"}], "id": "diane"}
    assert watch._patient_name(p) == "Diane Marchetti"


def test_watch_gid_helper_roundtrips_the_coordinate():
    assert watch._gid(HERO.key) == HERO.gid
