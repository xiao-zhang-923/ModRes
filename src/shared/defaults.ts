import type { MockRule, ResponseHeader, WorkspaceState } from './types';
import { SCHEMA_VERSION } from './types';

export function createId(prefix: 'rule' | 'header' = 'rule'): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value}`;
}

export function createHeader(overrides: Partial<ResponseHeader> = {}): ResponseHeader {
  return {
    id: createId('header'),
    enabled: true,
    name: '',
    value: '',
    ...overrides,
  };
}

export function createRule(overrides: Partial<MockRule> = {}): MockRule {
  const now = Date.now();
  return {
    id: createId('rule'),
    name: '未命名规则',
    enabled: false,
    method: 'GET',
    matchType: 'contains',
    url: '/api/',
    statusCode: 200,
    delayMs: 0,
    headers: [
      createHeader({
        name: 'Content-Type',
        value: 'application/json; charset=utf-8',
      }),
    ],
    bodyType: 'json',
    body: '{\n  "ok": true\n}',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createDefaultWorkspace(): WorkspaceState {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    globalEnabled: true,
    rules: [
      createRule({
        name: '示例 · 用户资料',
        enabled: false,
        method: 'GET',
        matchType: 'contains',
        url: '/api/profile',
        statusCode: 200,
        delayMs: 280,
        body: '{\n  "id": 1024,\n  "name": "Ada",\n  "role": "Developer",\n  "mocked": true\n}',
      }),
    ],
  };
}
