import client from './client'
import type { SobreCCriteriaResponse, SobreCResponse } from '../types'

export const fetchSobreCCriteria = (tenderId: string): Promise<SobreCCriteriaResponse> =>
  client.get(`/tenders/${tenderId}/sobre-c/criteria`).then(r => r.data)

export const calculateSobreC = (
  tenderId: string,
  declaredValues: Record<string, Record<string, number>>,
): Promise<SobreCResponse> =>
  client
    .post(`/tenders/${tenderId}/sobre-c/calculate`, { declared_values: declaredValues })
    .then(r => r.data)
