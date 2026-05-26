import client from './client'

export interface CompareRequest {
  criterion_id: string
  criterion_name: string
  language: string
  evidence: Record<string, string>   // supplier_id → evidence text
}

export interface CompareResponse {
  criterion_id: string
  comparison_text: string
}

export const fetchComparison = (
  tenderId: string,
  body: CompareRequest,
): Promise<CompareResponse> =>
  client.post(`/tenders/${tenderId}/compare`, body).then(r => r.data)
