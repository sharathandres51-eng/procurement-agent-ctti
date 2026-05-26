import client from './client'
import type { AuditEntry } from '../types'

export const fetchAuditEntries = (): Promise<AuditEntry[]> =>
  client.get('/audit').then(r => r.data)

export const submitAuditEntry = (entry: AuditEntry): Promise<AuditEntry> =>
  client.post('/audit', entry).then(r => r.data)

export const exportAuditUrl = '/api/audit/export'
