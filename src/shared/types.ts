export const SCHEMA_VERSION = 1 as const;
export const STORAGE_KEY = 'modres.workspace';

export const HTTP_METHODS = [
  'ANY',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const;

export const URL_MATCH_TYPES = ['contains', 'exact', 'glob', 'regex'] as const;
export const BODY_TYPES = ['json', 'text', 'html'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type UrlMatchType = (typeof URL_MATCH_TYPES)[number];
export type BodyType = (typeof BODY_TYPES)[number];

export interface ResponseHeader {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
}

export interface MockRule {
  id: string;
  name: string;
  enabled: boolean;
  method: HttpMethod;
  matchType: UrlMatchType;
  url: string;
  statusCode: number;
  delayMs: number;
  headers: ResponseHeader[];
  bodyType: BodyType;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceState {
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  globalEnabled: boolean;
  rules: MockRule[];
}

export type TabSessionStatus = 'idle' | 'attaching' | 'active' | 'detaching' | 'error';

export interface TabSession {
  tabId: number;
  status: TabSessionStatus;
  title: string;
  url: string;
  attachedAt?: number;
  matchedCount: number;
  lastMatchedRule?: string;
  lastMatchedAt?: number;
  errorCode?: string;
  errorMessage?: string;
  detachReason?: string;
}

export interface RuntimeState {
  workspace: WorkspaceState;
  sessions: TabSession[];
}

export interface BrowserTab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}
