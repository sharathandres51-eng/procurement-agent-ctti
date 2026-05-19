"""
scoring/sobre_c.py
------------------
Deterministic scoring for CTTI-2026-36 Sobre C criteria (PCAP Annex 2.b).
Total: 51 points across 6 sub-criteria.

No LLM or RAG involved. All scores derive from declared values in
data/sobre_c_submissions.json using the formulas defined in the PCAP.

Formula pattern used throughout:
  - "Higher is better" criteria:  score = max_pts * (this_value / best_value)
  - "Lower is better" criteria:   score = max_pts * (best_value / this_value)

This matches the standard Generalitat de Catalunya proportionality formula
for automatic criteria (Directriu 1/2020).
"""

import json
from pathlib import Path

SUBMISSIONS_PATH = Path(__file__).parent.parent / "data" / "sobre_c_submissions.json"

# Maximum points per sub-criterion (PCAP Annex 2.b)
MAX_POINTS = {
    "valoracio_economica":        20,
    "increment_ans":               5,
    "serveis_fabricant":          10,
    "formacio":                    5,
    "eficiencia_energetica":       3,
    "temps_resolucio_garantia":    8,
}

CRITERION_LABELS = {
    "valoracio_economica":       "2.1 Valoració econòmica",
    "increment_ans":             "2.2 Increment de nivell d'ANS",
    "serveis_fabricant":         "2.3 Serveis professionals de fabricant",
    "formacio":                  "2.4 Formació de la solució implantada",
    "eficiencia_energetica":     "2.5 Eficiència energètica",
    "temps_resolucio_garantia":  "2.6 Temps de resolució garantia fabricant",
}


def load_submissions() -> dict:
    with open(SUBMISSIONS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    # Strip meta keys — return only supplier entries
    return {k: v for k, v in data.items() if k.startswith("supplier_")}


def score_sobre_c(submissions: dict | None = None) -> dict:
    """
    Compute Sobre C scores for all suppliers.

    Returns a dict keyed by supplier_id:
    {
      "supplier_a": {
        "name": "QuantumNet Solutions SL",
        "criteria": {
          "valoracio_economica": {"label": "...", "max_points": 20, "score": 19.4},
          ...
        },
        "total": 42.8
      },
      ...
    }
    """
    if submissions is None:
        submissions = load_submissions()

    supplier_ids = list(submissions.keys())

    # Extract raw values
    prices      = {s: submissions[s]["price_eur"]                  for s in supplier_ids}
    ans         = {s: submissions[s]["ans_improvement_hours"]       for s in supplier_ids}
    services    = {s: submissions[s]["manufacturer_services_days"]  for s in supplier_ids}
    training    = {s: submissions[s]["training_days"]               for s in supplier_ids}
    energy      = {s: submissions[s]["energy_kwh_per_node"]         for s in supplier_ids}
    warranty    = {s: submissions[s]["warranty_resolution_hours"]   for s in supplier_ids}

    # Best (reference) values
    best_price    = min(prices.values())
    best_ans      = max(ans.values())
    best_services = max(services.values())
    best_training = max(training.values())
    best_energy   = min(energy.values())   # lower is better
    best_warranty = min(warranty.values()) # lower is better

    results = {}
    for s in supplier_ids:
        scores = {
            "valoracio_economica":      MAX_POINTS["valoracio_economica"]       * (best_price    / prices[s]),
            "increment_ans":            MAX_POINTS["increment_ans"]             * (ans[s]        / best_ans),
            "serveis_fabricant":        MAX_POINTS["serveis_fabricant"]         * (services[s]   / best_services),
            "formacio":                 MAX_POINTS["formacio"]                  * (training[s]   / best_training),
            "eficiencia_energetica":    MAX_POINTS["eficiencia_energetica"]     * (best_energy   / energy[s]),
            "temps_resolucio_garantia": MAX_POINTS["temps_resolucio_garantia"]  * (best_warranty / warranty[s]),
        }

        criteria_detail = {
            cid: {
                "label":      CRITERION_LABELS[cid],
                "max_points": MAX_POINTS[cid],
                "score":      round(score, 2),
            }
            for cid, score in scores.items()
        }

        results[s] = {
            "name":     submissions[s]["name"],
            "declared": {
                "price_eur":                  prices[s],
                "ans_improvement_hours":      ans[s],
                "manufacturer_services_days": services[s],
                "training_days":              training[s],
                "energy_kwh_per_node":        energy[s],
                "warranty_resolution_hours":  warranty[s],
            },
            "criteria": criteria_detail,
            "total":    round(sum(scores.values()), 2),
        }

    return results


if __name__ == "__main__":
    results = score_sobre_c()
    for supplier_id, data in results.items():
        print(f"\n{data['name']} ({supplier_id})")
        for cid, detail in data["criteria"].items():
            print(f"  {detail['label']}: {detail['score']} / {detail['max_points']}")
        print(f"  TOTAL Sobre C: {data['total']} / 51")
