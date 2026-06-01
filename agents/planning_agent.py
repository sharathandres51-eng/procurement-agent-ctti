import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from langchain_mistralai import ChatMistralAI
from rag.retriever import retrieve_criteria

load_dotenv()

# Lazy singleton — only instantiated on first inference call, not at import time.
# This prevents a crash on startup when MISTRAL_API_KEY is read from env vars
# that may not be available until the container is fully initialised.
@lru_cache(maxsize=1)
def _llm() -> ChatMistralAI:
    return ChatMistralAI(model="mistral-large-latest", temperature=0)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def save_plan_to_db(plan: dict) -> None:
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tender_plans (contract_id, pcap_hash, plan)
                VALUES (%s, %s, %s::jsonb)
                ON CONFLICT (contract_id) DO UPDATE
                    SET pcap_hash  = EXCLUDED.pcap_hash,
                        plan       = EXCLUDED.plan,
                        updated_at = now()
                """,
                (
                    plan["contract_id"],
                    plan.get("pcap_hash", ""),
                    json.dumps(plan),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def load_plan_from_db(contract_id: str) -> dict | None:
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT plan FROM tender_plans WHERE contract_id = %s",
                (contract_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

def planning_agent(
    contract_id: str = "CTTI-2026-36",
    tender_id: str = "ctti_2026_36",
) -> dict:
    chunks = retrieve_criteria(
        query="criteris adjudicació judici de valor subcriteri punts màxim evaluation criteria points subcriteria breakdown",
        tender_id=tender_id,
        k=20,
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

    response = _llm().invoke([{"role": "user", "content": prompt}])
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
                print(
                    f"  WARNING: '{c['id']}' sub-criteria sum to {sc_total}, "
                    f"expected {c['max_points']} — normalising."
                )
                for sc in c["subcriteria"]:
                    sc["points"] = round(sc["points"] / sc_total * c["max_points"], 2)

    plan = {
        "contract_id":  contract_id,
        "tender_id":    tender_id,
        "generated_at": datetime.now().isoformat(),
        "pcap_hash":    "",
        "criteria":     plan_data["criteria"],
    }

    plan_dir = Path("tender_plans")
    plan_dir.mkdir(exist_ok=True)
    plan_path = plan_dir / f"{contract_id}_plan.json"
    with open(plan_path, "w") as f:
        json.dump(plan, f, indent=2)

    save_plan_to_db(plan)

    return plan


def load_or_generate_plan(
    contract_id: str = "CTTI-2026-36",
    tender_id: str = "ctti_2026_36",
) -> dict:
    plan = load_plan_from_db(contract_id)
    if plan is not None:
        print(f"Plan loaded from database: {contract_id}")
        return plan

    path = Path(f"tender_plans/{contract_id}_plan.json")
    if path.exists():
        with open(path) as f:
            plan = json.load(f)
        print(f"Plan loaded from disk: {path}")
        return plan

    print(f"No plan found for {contract_id}. Running Planning Agent...")
    plan = planning_agent(contract_id=contract_id, tender_id=tender_id)
    print(f"Plan generated and saved for {contract_id}")
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
