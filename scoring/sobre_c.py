"""
scoring/sobre_c.py
------------------
Deterministic scoring for PCAP Annex 2.b automatic criteria (51 points).

Fully data-driven: the sobre_c_submissions.json file for each tender defines
the criteria fields, their max points, and their scoring direction (higher/lower
is better). No hardcoded field names — add a new tender by dropping in a new
JSON file with the same metadata structure.

Formula (Directriu 1/2020 proportionality):
  "higher is better": score = max_pts * (this_value / best_value)
  "lower  is better": score = max_pts * (best_value / this_value)

No LLM or RAG involved.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def _submissions_path(tender_id: str) -> Path:
    return DATA_DIR / tender_id / "sobre_c_submissions.json"


def load_submissions(tender_id: str = "ctti_2026_36") -> dict:
    """Return the full JSON payload (including meta keys) for a tender."""
    path = _submissions_path(tender_id)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def score_sobre_c(submissions: dict | None = None,
                  tender_id: str = "ctti_2026_36") -> dict:
    """
    Compute Sobre C scores for all suppliers in a tender.

    Returns a dict keyed by supplier_id:
    {
      "supplier_a": {
        "name": "...",
        "declared": { field: value, ... },
        "criteria": {
          field: { "label": "...", "max_points": int, "score": float },
          ...
        },
        "total": float
      },
      ...
    }
    """
    if submissions is None:
        submissions = load_submissions(tender_id)

    # Read schema metadata from the JSON
    criteria_labels = submissions.get("_criteria", {})
    max_points_map  = submissions.get("_max_points", {})
    direction_map   = submissions.get("_direction", {})

    # Supplier data only
    supplier_data = {k: v for k, v in submissions.items()
                     if k.startswith("supplier_")}
    supplier_ids  = list(supplier_data.keys())

    # Ordered list of scored fields (all numeric fields except "name")
    fields = [f for f in criteria_labels.keys()]

    # Collect values per field across all suppliers
    field_values: dict[str, dict[str, float]] = {
        field: {s: supplier_data[s][field] for s in supplier_ids}
        for field in fields
    }

    # Compute scores
    results: dict[str, dict] = {}
    for s in supplier_ids:
        criteria_detail: dict[str, dict] = {}
        total = 0.0

        for field in fields:
            values    = field_values[field]
            max_pts   = max_points_map.get(field, 0)
            direction = direction_map.get(field, "higher")
            this_val  = values[s]

            if direction == "lower":
                best_val = min(values.values())
                raw_score = max_pts * (best_val / this_val) if this_val else 0.0
            else:
                best_val = max(values.values())
                raw_score = max_pts * (this_val / best_val) if best_val else 0.0

            score = round(raw_score, 2)
            total += score
            criteria_detail[field] = {
                "label":      criteria_labels.get(field, field),
                "max_points": max_pts,
                "score":      score,
                "direction":  direction,
            }

        declared = {f: supplier_data[s][f] for f in fields}
        results[s] = {
            "name":     supplier_data[s]["name"],
            "declared": declared,
            "criteria": criteria_detail,
            "total":    round(total, 2),
        }

    return results


if __name__ == "__main__":
    for tid in ["ctti_2026_36", "ctti_2026_44", "ctti_2026_51"]:
        print(f"\n{'='*60}")
        print(f"Tender: {tid}")
        results = score_sobre_c(tender_id=tid)
        for supplier_id, data in results.items():
            print(f"\n  {data['name']} ({supplier_id})")
            for field, detail in data["criteria"].items():
                print(f"    {detail['label'][:50]}: "
                      f"{detail['score']} / {detail['max_points']}")
            print(f"  TOTAL Sobre C: {data['total']} / 51")
