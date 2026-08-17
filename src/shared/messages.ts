import type { MockRule, RuntimeState, WorkspaceState } from './types';

export type RequestMessage =
  | { type: 'GET_STATE' }
  | { type: 'SAVE_RULES'; rules: MockRule[]; expectedRevision: number }
  | { type: 'SET_GLOBAL_ENABLED'; enabled: boolean }
  | { type: 'ENABLE_TAB'; tabId: number }
  | { type: 'DISABLE_TAB'; tabId: number }
  | { type: 'IMPORT_WORKSPACE'; workspace: WorkspaceState; expectedRevision: number }
  | { type: 'RESET_WORKSPACE' };

export interface StateUpdatedMessage {
  type: 'STATE_UPDATED';
  state: RuntimeState;
}

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const requestTypes = new Set<RequestMessage['type']>([
  'GET_STATE',
  'SAVE_RULES',
  'SET_GLOBAL_ENABLED',
  'ENABLE_TAB',
  'DISABLE_TAB',
  'IMPORT_WORKSPACE',
  'RESET_WORKSPACE',
]);

export function isRequestMessage(value: unknown): value is RequestMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  return requestTypes.has((value as { type: RequestMessage['type'] }).type);
}

export function isStateUpdatedMessage(value: unknown): value is StateUpdatedMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type: string }).type === 'STATE_UPDATED' &&
    'state' in value
  );
}
