"""Tests for the FHIR registry builders and read helpers (no Firestore needed)."""

from unravel import registry
from unravel.evidence import VariantKey


def test_cohort_shape():
    res = registry.build_resources()
    # one Observation per carrier; at least the hero, silent Dianes, trap,
    # deceased carrier, and benign filler.
    assert len(res["Observation"]) == 10
    assert len(res["Patient"]) == 14
    assert len(res["FamilyMemberHistory"]) == 2


def test_proband_and_relatives():
    patients = {p["id"]: p for p in registry.build_resources()["Patient"]}
    diane = patients["diane-okafor"]
    assert any(e.get("valueString") == "proband" for e in diane.get("extension", []))
    relatives = [p["id"] for p in patients.values()
                 if any(e.get("url", "").endswith("relative-of") for e in p.get("extension", []))]
    assert {"grace-okafor", "ada-okafor", "emeka-okafor", "david-bello"} <= set(relatives)


def test_hero_observation_round_trips_to_variant_key():
    obs = next(o for o in registry.build_resources()["Observation"] if o["id"] == "obs-diane")
    assert registry.observation_variant(obs) == VariantKey("3", 36993661, "C", "G")
    assert registry.recorded_classification(obs) == "Uncertain significance"
    assert registry.observation_field(obs, "48018-6") == "MLH1"


def test_silent_dianes_share_the_hero_variant():
    obs = registry.build_resources()["Observation"]
    carriers = [o["subject"]["reference"] for o in obs
                if registry.observation_variant(o) == registry.HERO.key]
    # Diane plus three silent carriers.
    assert len(carriers) == 4


def test_deceased_carrier_present():
    patients = {p["id"]: p for p in registry.build_resources()["Patient"]}
    assert patients["samuel-bello"]["deceasedBoolean"] is True
