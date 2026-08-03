import { client } from '../api';
import {
  CountSession,
  SessionReport,
  StartSessionInput,
  ScanEntry,
  Correction,
  CompleteSessionResult,
  RecordFoundItemInput,
  RecordFoundItemResult,
} from './types';

export const inventoryCountClient = {
  async getActiveSession(): Promise<CountSession | null> {
    const { data } = await client.get<CountSession | null>('/inventory-count/sessions/active');
    return data;
  },

  async startSession(input: StartSessionInput): Promise<CountSession> {
    const { data } = await client.post<CountSession>('/inventory-count/sessions', input);
    return data;
  },

  async pauseSession(id: string): Promise<CountSession> {
    const { data } = await client.patch<CountSession>(`/inventory-count/sessions/${id}/pause`);
    return data;
  },

  async resumeSession(id: string): Promise<CountSession> {
    const { data } = await client.patch<CountSession>(`/inventory-count/sessions/${id}/resume`);
    return data;
  },

  async scan(sessionId: string, itemId: string): Promise<ScanEntry> {
    const { data } = await client.post<ScanEntry>(`/inventory-count/sessions/${sessionId}/scan`, { itemId });
    return data;
  },

  async recordFoundItem(sessionId: string, input: RecordFoundItemInput): Promise<RecordFoundItemResult> {
    const { data } = await client.post<RecordFoundItemResult>(
      `/inventory-count/sessions/${sessionId}/found`,
      input,
    );
    return data;
  },

  async getReport(sessionId: string): Promise<SessionReport> {
    const { data } = await client.get<SessionReport>(`/inventory-count/sessions/${sessionId}/report`);
    return data;
  },

  async complete(sessionId: string, corrections: Correction[]): Promise<CompleteSessionResult> {
    const { data } = await client.post<CompleteSessionResult>(`/inventory-count/sessions/${sessionId}/complete`, {
      corrections,
    });
    return data;
  },
};
