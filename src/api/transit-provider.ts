import type {
  DeparturesQuery,
  DepartureRecord,
  StopSearchResult,
} from './types';

export interface TransitProvider {
  searchStops(query: string): Promise<StopSearchResult[]>;
  getDepartures(query: DeparturesQuery): Promise<DepartureRecord[]>;
}
