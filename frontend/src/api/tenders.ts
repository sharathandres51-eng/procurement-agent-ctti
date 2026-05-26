import client from './client'
import type { TenderSummary, EvaluationPlan } from '../types'

export const fetchTenders = (): Promise<TenderSummary[]> =>
  client.get('/tenders').then(r => r.data)

export const fetchTender = (tenderId: string): Promise<TenderSummary> =>
  client.get(`/tenders/${tenderId}`).then(r => r.data)

export const fetchPlan = (tenderId: string): Promise<EvaluationPlan> =>
  client.get(`/tenders/${tenderId}/plan`).then(r => r.data)
