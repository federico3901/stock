export interface StoredRecord<T = unknown> {
  collection: string;
  id: string;
  companyId: string | null;
  data: T;
}

/** Archivio documentale minimale: collezioni di oggetti JSON, filtrabili per azienda. */
export interface Store {
  get<T>(collection: string, id: string): Promise<T | null>;
  list<T>(collection: string, companyId?: string): Promise<T[]>;
  put<T extends { id: string }>(collection: string, data: T, companyId?: string | null): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  deleteByCompany(companyId: string): Promise<void>;
  /** tutti i record, per il backup */
  dump(): Promise<StoredRecord[]>;
}
