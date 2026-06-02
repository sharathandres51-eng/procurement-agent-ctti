"""
scoring/sobre_c.py
------------------
Deterministic scoring for PCAP Annex automatic criteria (51 points).

Formula (Directriu 1/2020 proportionality):
  "higher is better": score = max_pts * (this_value / best_value)
  "lower  is better": score = max_pts * (best_value / this_value)

Accepts declared values as parameters - no file I/O.
"""


def score_sobre_c(
    criteria_def: dict[str, dict],
    declared_values: dict[str, dict[str, float]],
    supplier_names: dict[str, str],
) -> dict:
    """
    Compute Sobre C scores for all suppliers.

    Args:
        criteria_def:     { field: { label, max_points, direction, unit } }
        declared_values:  { supplier_id: { field: numeric_value } }
        supplier_names:   { supplier_id: display_name }

    Returns:
        { supplier_id: { name, declared, criteria, total } }
    """
    fields = list(criteria_def.keys())
    supplier_ids = list(declared_values.keys())

    field_values: dict[str, dict[str, float]] = {
        field: {s: declared_values[s][field] for s in supplier_ids}
        for field in fields
    }

    results: dict[str, dict] = {}
    for s in supplier_ids:
        criteria_detail: dict[str, dict] = {}
        total = 0.0

        for field in fields:
            values    = field_values[field]
            max_pts   = criteria_def[field]["max_points"]
            direction = criteria_def[field]["direction"]
            this_val  = values[s]

            if direction == "lower":
                best_val  = min(values.values())
                raw_score = max_pts * (best_val / this_val) if this_val else 0.0
            else:
                best_val  = max(values.values())
                raw_score = max_pts * (this_val / best_val) if best_val else 0.0

            score = round(raw_score, 2)
            total += score
            criteria_detail[field] = {
                "label":      criteria_def[field]["label"],
                "max_points": max_pts,
                "score":      score,
                "direction":  direction,
            }

        results[s] = {
            "name":     supplier_names.get(s, s),
            "declared": {f: declared_values[s][f] for f in fields},
            "criteria": criteria_detail,
            "total":    round(total, 2),
        }

    return results
