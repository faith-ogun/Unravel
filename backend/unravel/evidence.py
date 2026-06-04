"""build_evidence_ledger: assemble an ACMG ledger from the evidence warehouse.

This is where the BigQuery warehouse meets the Bayesian engine. Given a variant,
it reads the unified `evidence.variant_evidence` view (ClinVar anchor + gnomAD AF
+ AlphaMissense) and translates each evidence stream into cited ACMG
`EvidenceItem`s that `score_posterior()` can weigh:

  - gnomAD allele frequency -> PM2 (rare/absent) / BS1 (common) / BA1 (>5%).
  - AlphaMissense pathogenicity -> PP3 (pathogenic) / BP4 (benign), at a strength
    that scales with the score, reflecting ClinGen's recommendation that a
    well-calibrated in-silico predictor can reach beyond Supporting.

The ClinVar assertion itself is deliberately NOT minted into ACMG points here:
that would double-count, since an aggregate classification is downstream of the
same primary evidence (the discredited PP5/BP6 path). Instead the ClinVar review
status travels alongside as context (`review_stars`), so the Adjudicator can
judge how much to trust the assertion that triggered the look. This is the seam
where the 1-star trap lives: a lone low-star pathogenic claim with thin primary
evidence scores as Uncertain and is withheld.

Evidence that comes from the family rather than the commons (segregation PP1,
functional PS3, de novo PS2) is supplied by the caller via `extra`, since it is
sourced from the FHIR registry, not the warehouse.

Pure mapping (`acmg_items_from_row`) is separated from the BigQuery fetch so the
thresholds are testable without credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .acmg import EvidenceItem, Ledger, Strength

PROJECT = "unravel-ra"
EVIDENCE_VIEW = f"{PROJECT}.evidence.variant_evidence"

# --- gnomAD frequency thresholds (ACMG PM2 / BS1 / BA1) -------------------------
# General-purpose cutoffs. ClinGen gene-specific VCEPs (e.g. the InSiGHT/MMR panel
# for the Lynch genes) tune BS1/BA1 per gene; these defaults are conservative and
# are the single place to swap in gene-specific values later.
BA1_AF = 0.05      # stand-alone benign above 5 percent
BS1_AF = 0.01      # strong benign above 1 percent
PM2_AF = 1e-4      # absent or ultra-rare supports pathogenic (PM2_Supporting)

# --- AlphaMissense thresholds (ACMG PP3 / BP4) ---------------------------------
# AlphaMissense's own class boundaries are >0.564 likely_pathogenic and <0.34
# likely_benign. ClinGen/Pejaver-style calibration lets a strong score reach
# beyond Supporting; we tier the pathogenic side accordingly. Benign side is held
# at Supporting (BP4), the usual conservative choice for a single predictor.
AM_PP3_SUPPORTING = 0.564
AM_PP3_MODERATE = 0.90
AM_PP3_STRONG = 0.99
AM_BP4_SUPPORTING = 0.34


@dataclass(frozen=True)
class VariantKey:
    """GRCh38 VCF coordinate, the warehouse join key."""

    chromosome: str
    position: int
    reference_allele: str
    alternate_allele: str

    def label(self, gene: str | None = None) -> str:
        core = f"{self.chromosome}-{self.position}-{self.reference_allele}-{self.alternate_allele}"
        return f"{gene} {core}" if gene else core


def _gnomad_items(af) -> list[EvidenceItem]:
    """Frequency criteria. Absent (None) is the strongest PM2 case."""
    if af is None:
        return [EvidenceItem(
            "PM2", source="gnomAD v4", strength=Strength.SUPPORTING,
            detail="absent from gnomAD",
        )]
    if af > BA1_AF:
        return [EvidenceItem(
            "BA1", source="gnomAD v4", detail=f"allele frequency {af:.3g} > {BA1_AF:g}",
        )]
    if af > BS1_AF:
        return [EvidenceItem(
            "BS1", source="gnomAD v4", detail=f"allele frequency {af:.3g} > {BS1_AF:g}",
        )]
    if af < PM2_AF:
        return [EvidenceItem(
            "PM2", source="gnomAD v4", strength=Strength.SUPPORTING,
            detail=f"ultra-rare, allele frequency {af:.3g}",
        )]
    return []  # intermediate frequency: no PM2/BS1/BA1 criterion


def _alphamissense_items(am, am_class) -> list[EvidenceItem]:
    """In-silico missense criterion, strength scaled by the calibrated score."""
    if am is None:
        return []
    if am >= AM_PP3_SUPPORTING:
        if am >= AM_PP3_STRONG:
            strength = Strength.STRONG
        elif am >= AM_PP3_MODERATE:
            strength = Strength.MODERATE
        else:
            strength = Strength.SUPPORTING
        return [EvidenceItem(
            "PP3", source="AlphaMissense", strength=strength,
            detail=f"am_pathogenicity {am:.3f} ({am_class})",
        )]
    if am <= AM_BP4_SUPPORTING:
        return [EvidenceItem(
            "BP4", source="AlphaMissense", strength=Strength.SUPPORTING,
            detail=f"am_pathogenicity {am:.3f} ({am_class})",
        )]
    return []  # ambiguous middle band: not met


def acmg_items_from_row(row: dict) -> list[EvidenceItem]:
    """Map one warehouse row to its commons-derived ACMG criteria (pure)."""
    items: list[EvidenceItem] = []
    items += _gnomad_items(row.get("gnomad_af"))
    items += _alphamissense_items(row.get("am_pathogenicity"), row.get("am_class"))
    return items


@dataclass
class EvidenceContext:
    """A ledger plus the ClinVar anchor context the Adjudicator reasons over."""

    ledger: Ledger
    gene_symbol: str | None = None
    clinical_significance: str | None = None
    review_status: str | None = None
    review_stars: int | None = None
    number_submitters: int | None = None
    gnomad_af: float | None = None
    am_pathogenicity: float | None = None
    am_class: str | None = None
    found: bool = True


def _fetch_row(key: VariantKey, client) -> dict | None:
    from google.cloud import bigquery

    sql = f"""
      SELECT * FROM `{EVIDENCE_VIEW}`
      WHERE chromosome = @chrom AND position = @pos
        AND reference_allele = @ref AND alternate_allele = @alt
      LIMIT 1
    """
    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("chrom", "INT64", int(key.chromosome)),
            bigquery.ScalarQueryParameter("pos", "INT64", key.position),
            bigquery.ScalarQueryParameter("ref", "STRING", key.reference_allele),
            bigquery.ScalarQueryParameter("alt", "STRING", key.alternate_allele),
        ]),
    )
    rows = list(job.result())
    return dict(rows[0]) if rows else None


def build_evidence_ledger(
    key: VariantKey,
    *,
    client=None,
    row: dict | None = None,
    extra: list[EvidenceItem] | None = None,
) -> EvidenceContext:
    """Assemble the ACMG ledger for a variant.

    Reads the warehouse for `key` (or uses a supplied `row`, which keeps this
    unit-testable and lets the Watcher pass a row it already fetched). Adds any
    family-sourced `extra` evidence (segregation, functional). Returns the
    ledger plus the ClinVar anchor context.
    """
    if row is None:
        if client is None:
            from google.cloud import bigquery
            client = bigquery.Client(project=PROJECT)
        row = _fetch_row(key, client)

    if row is None:
        return EvidenceContext(ledger=Ledger(variant=key.label()), found=False)

    gene = row.get("gene_symbol")
    ledger = Ledger(variant=key.label(gene))
    ledger.items.extend(acmg_items_from_row(row))
    if extra:
        ledger.items.extend(extra)

    return EvidenceContext(
        ledger=ledger,
        gene_symbol=gene,
        clinical_significance=row.get("clinical_significance"),
        review_status=row.get("review_status"),
        review_stars=row.get("review_stars"),
        number_submitters=row.get("number_submitters"),
        gnomad_af=row.get("gnomad_af"),
        am_pathogenicity=row.get("am_pathogenicity"),
        am_class=row.get("am_class"),
    )
