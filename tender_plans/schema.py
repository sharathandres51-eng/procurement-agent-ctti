from typing import TypedDict


class SubCriterion(TypedDict):
    id: str
    name: str
    points: float
    query: str


class CriterionPlan(TypedDict):
    id: str
    name: str
    max_points: float
    has_subcriteria: bool
    query: str
    subcriteria: list


class EvaluationPlan(TypedDict):
    contract_id: str
    generated_at: str
    criteria: list
