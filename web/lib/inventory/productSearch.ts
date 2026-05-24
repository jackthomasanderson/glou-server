export interface ProductSuggestion {
  source: 'internal' | 'external';
  name: string;
  producer: string;
  category: string;
  vintage?: number | null;
  bottleSize?: string | null;
  format?: string | null;
  region?: string | null;
}
