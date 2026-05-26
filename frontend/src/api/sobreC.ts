import client from './client'
import type { SobreCResponse } from '../types'

export const fetchSobreC = (tenderId: string): Promise<SobreCResponse> =>
  client.get(`/tenders/${tenderId}/sobre-c`).then(r => r.data)
