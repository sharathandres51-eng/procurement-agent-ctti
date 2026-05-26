// ── Tenders ───────────────────────────────────────────────────────────────────

export interface SupplierInfo {
  id: string
  name: string
}

export interface TenderSummary {
  tender_id: string
  label: string
  suppliers: SupplierInfo[]
}

// ── Evaluation plan ───────────────────────────────────────────────────────────

export interface SubCriterion {
  id: string
  name: string
  points: number
  query: string
}

export interface CriterionPlan {
  id: string
  name: string
  max_points: number
  has_subcriteria: boolean
  query: string
  subcriteria: SubCriterion[]
}

export interface EvaluationPlan {
  contract_id: string
  tender_id: string
  generated_at: string
  criteria: CriterionPlan[]
}

// ── Evaluation results ────────────────────────────────────────────────────────

export interface CriterionResult {
  tender_id: string
  supplier_id: string
  supplier_name: string
  criterion_id: string
  criterion_name: string
  max_points: number
  evidence: string
  agent_note: string
  subcriterion_id: string | null
}

// SSE event from POST /evaluate
export interface EvaluationProgressEvent {
  supplier_id: string
  criterion_id: string
  subcriterion_id: string | null
  result: CriterionResult
  done?: boolean
}

// Nested results store: supplier_id → criterion_id → result (or sub-results)
export type EvaluationResults = Record<string, Record<string, CriterionResult | SubCriteriaResults>>

export interface SubCriteriaResults {
  has_subcriteria: true
  criterion_name: string
  max_points: number
  subcriteria: Record<string, CriterionResult>
}

// ── Sobre C ───────────────────────────────────────────────────────────────────

export interface SobreCCriterionDetail {
  label: string
  max_points: number
  score: number
  direction: string
}

export interface SobreCSuplierResult {
  name: string
  declared: Record<string, number | string>
  criteria: Record<string, SobreCCriterionDetail>
  total: number
}

export interface SobreCResponse {
  tender_id: string
  results: Record<string, SobreCSuplierResult>
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  evaluator_id: string
  timestamp: string
  contract: string
  tender_label: string
  language: string
  regulatory_note: string
  scores: Record<string, Record<string, number | Record<string, number>>>
  evidence: Record<string, unknown>
}

// ── Scores (local state) ──────────────────────────────────────────────────────

// null  = not yet scored by the evaluator (distinct from a deliberate 0)
// number = explicitly set score
// Record = sub-criteria map (sub_id → score | null)
export type ScoreMap = Record<string, Record<string, number | null | Record<string, number | null>>>
