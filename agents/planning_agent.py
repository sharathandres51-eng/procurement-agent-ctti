import json
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from langchain_mistralai import ChatMistralAI
from rag.retriever import retrieve_criteria

load_dotenv()

llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


def planning_agent(contract_id: str = "CTTI-2026-36") -> dict:
    chunks = retrieve_criteria(
        query="evaluation criteria points subcriteria judici de valor maximum score breakdown",
        k=10,
    )
    criteria_context = "\n\n---\n\n".join([c["text"] for c in chunks])

    prompt = f"""You are analysing the evaluation criteria from a public procurement document (PCAP) for contract {contract_id} to generate a structured evaluation plan.

PCAP CRITERIA CONTENT:
{criteria_context}

Your task is to identify ALL judici de valor criteria (criteria evaluated by judgment, not formula) and for each criterion determine:

1. Whether it has explicit sub-criteria with individual point breakdowns
2. If yes — list each sub-criterion with its name, exact point value, and a short retrieval query (5-8 words) that would find relevant content in a supplier proposal
3. If no — provide a single retrieval query (5-8 words) for the criterion as a whole

IMPORTANT RULES:
- Only include judici de valor criteria — ignore automatic formula-based criteria (price, ANS, training sessions, energy efficiency etc.)
- Point values must be extracted exactly as stated in the PCAP — do not estimate or round
- Sub-criterion point values must sum to the criterion maximum points
- Retrieval queries must be in English and focused on what to look for in a supplier technical proposal

Respond ONLY with a valid JSON object in exactly this structure with no additional text, explanation, or markdown:

{{
  "criteria": [
    {{
      "id": "snake_case_id",
      "name": "Full criterion name",
      "max_points": 9.0,
      "has_subcriteria": false,
      "query": "retrieval query for this criterion",
      "subcriteria": []
    }},
    {{
      "id": "snake_case_id",
      "name": "Full criterion name",
      "max_points": 30.0,
      "has_subcriteria": true,
      "query": "",
      "subcriteria": [
        {{
          "id": "snake_case_sub_id",
          "name": "Sub-criterion name",
          "points": 4.5,
          "query": "retrieval query for this sub-criterion"
        }}
      ]
    }}
  ]
}}"""

    response = llm.invoke([{"role": "user", "content": prompt}])
    text = response.content.strip()

    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    plan_data = json.loads(text)

    if "criteria" not in plan_data:
        raise ValueError("Response missing 'criteria' key")

    for c in plan_data["criteria"]:
        required = {"id", "name", "max_points", "has_subcriteria", "query", "subcriteria"}
        missing = required - c.keys()
        if missing:
            raise ValueError(f"Criterion '{c.get('id', '?')}' missing fields: {missing}")
        if c["has_subcriteria"] and not c["subcriteria"]:
            raise ValueError(
                f"Criterion '{c['id']}' has has_subcriteria=true but no subcriteria"
            )
        if not c["has_subcriteria"] and not c["query"]:
            raise ValueError(
                f"Criterion '{c['id']}' has has_subcriteria=false but no query"
            )
        if c["has_subcriteria"]:
            sc_total = sum(sc["points"] for sc in c["subcriteria"])
            if abs(sc_total - c["max_points"]) > 0.1:
                raise ValueError(
                    f"Criterion '{c['id']}' sub-criterion points sum to {sc_total}, "
                    f"expected {c['max_points']}"
                )

    plan = {
        "contract_id": contract_id,
        "generated_at": datetime.now().isoformat(),
        "criteria": plan_data["criteria"],
    }

    plan_dir = Path("tender_plans")
    plan_dir.mkdir(exist_ok=True)
    plan_path = plan_dir / f"{contract_id}_plan.json"
    with open(plan_path, "w") as f:
        json.dump(plan, f, indent=2)

    return plan


def load_or_generate_plan(contract_id: str = "CTTI-2026-36") -> dict:
    path = Path(f"tender_plans/{contract_id}_plan.json")

    if path.exists():
        with open(path) as f:
            plan = json.load(f)
        print(f"Plan loaded from disk: {path}")
        return plan

    print("No plan found. Running Planning Agent...")
    plan = planning_agent(contract_id)
    print(f"Plan generated and saved to {path}")
    return plan


if __name__ == "__main__":
    plan = load_or_generate_plan()
    print(f"\nContract: {plan['contract_id']}")
    print(f"Generated: {plan['generated_at']}")
    for c in plan["criteria"]:
        print(f"\n{c['name']} ({c['max_points']} pts)")
        if c["has_subcriteria"]:
            for sc in c["subcriteria"]:
                print(f"  - {sc['name']}: {sc['points']} pts")
        else:
            print(f"  Single evaluation. Query: {c['query']}")
