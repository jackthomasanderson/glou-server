import { client } from '../api';
import { MaturityReference, MaturityReferenceInput, MaturitySuggestion } from './types';

export interface SuggestParams {
  category: 'wine' | 'sparkling' | 'spirit' | 'cigar';
  region?: string;
  color?: string;
  producer?: string;
  vintage?: number;
}

export const maturityReferenceClient = {
  async list(): Promise<MaturityReference[]> {
    const { data } = await client.get<MaturityReference[]>('/admin/maturity-references');
    return data;
  },

  async create(input: MaturityReferenceInput): Promise<MaturityReference> {
    const { data } = await client.post<MaturityReference>('/admin/maturity-references', input);
    return data;
  },

  async update(id: string, patch: Partial<MaturityReferenceInput>): Promise<MaturityReference> {
    const { data } = await client.patch<MaturityReference>(`/admin/maturity-references/${id}`, patch);
    return data;
  },

  async delete(id: string): Promise<void> {
    await client.delete<{ deleted: boolean }>(`/admin/maturity-references/${id}`);
  },

  async suggest(params: SuggestParams): Promise<MaturitySuggestion | null> {
    const qs = new URLSearchParams();
    qs.set('category', params.category);
    if (params.region) qs.set('region', params.region);
    if (params.color) qs.set('color', params.color);
    if (params.producer) qs.set('producer', params.producer);
    if (params.vintage != null) qs.set('vintage', String(params.vintage));
    const { data } = await client.get<MaturitySuggestion | null>(`/maturity-references/suggest?${qs}`);
    return data;
  },
};
