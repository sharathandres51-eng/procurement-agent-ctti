import client from './client'

export interface SourceChunk {
  text: string
  source: string
  doc_type: string
  tender_id: string
}

export interface SourceChunksResponse {
  tender_id: string
  supplier_id: string
  criterion_id: string
  query: string
  chunks: SourceChunk[]
}

export const fetchSourceChunks = (
  tenderId: string,
  supplierId: string,
  criterionId: string,
  k = 4,
): Promise<SourceChunksResponse> =>
  client
    .get(`/tenders/${tenderId}/source-chunks`, {
      params: { supplier_id: supplierId, criterion_id: criterionId, k },
    })
    .then(r => r.data)
