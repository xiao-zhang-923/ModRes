import { BODY_TYPES, HTTP_METHODS, SCHEMA_VERSION, URL_MATCH_TYPES } from './types';
import type { MockRule, ResponseHeader, WorkspaceState } from './types';

const MAX_RULES = 250;
const MAX_HEADERS = 64;
const MAX_BODY_LENGTH = 512 * 1024;
const MAX_URL_PATTERN_LENGTH = 2048;
const MAX_REGEX_LENGTH = 512;
const MAX_DELAY_MS = 30_000;

const methodSet = new Set<string>(HTTP_METHODS);
const matchTypeSet = new Set<string>(URL_MATCH_TYPES);
const bodyTypeSet = new Set<string>(BODY_TYPES);
const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(`${path} 必须是对象`);
  }
  return value;
}

function expectString(
  value: unknown,
  path: string,
  options: { min?: number; max: number; trim?: boolean },
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${path} 必须是字符串`);
  }
  const normalized = options.trim === false ? value : value.trim();
  if (normalized.length < (options.min ?? 0)) {
    throw new ValidationError(`${path} 不能为空`);
  }
  if (normalized.length > options.max) {
    throw new ValidationError(`${path} 最多允许 ${options.max} 个字符`);
  }
  return normalized;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${path} 必须是布尔值`);
  }
  return value;
}

function expectInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new ValidationError(`${path} 必须是 ${min}–${max} 之间的整数`);
  }
  return value as number;
}

function normalizeHeader(value: unknown, ruleIndex: number, headerIndex: number): ResponseHeader {
  const path = `规则 ${ruleIndex + 1} 的响应头 ${headerIndex + 1}`;
  const record = expectRecord(value, path);
  const enabled = expectBoolean(record.enabled, `${path}.enabled`);
  const name = expectString(record.name, `${path}.name`, { max: 128 });
  const headerValue = expectString(record.value, `${path}.value`, { max: 4096, trim: false });

  if (enabled && !name) {
    throw new ValidationError(`${path} 已启用，但名称为空`);
  }
  if (name && !headerNamePattern.test(name)) {
    throw new ValidationError(`${path} 的名称不是有效的 HTTP Header 名称`);
  }
  if (/\r|\n/.test(headerValue)) {
    throw new ValidationError(`${path} 的值不能包含换行符`);
  }

  return {
    id: expectString(record.id, `${path}.id`, { min: 1, max: 160 }),
    enabled,
    name,
    value: headerValue,
  };
}

export function normalizeRule(value: unknown, index = 0): MockRule {
  const path = `规则 ${index + 1}`;
  const record = expectRecord(value, path);
  const method = expectString(record.method, `${path}.method`, { min: 1, max: 16 });
  const matchType = expectString(record.matchType, `${path}.matchType`, { min: 1, max: 16 });
  const bodyType = expectString(record.bodyType, `${path}.bodyType`, { min: 1, max: 16 });
  const url = expectString(record.url, `${path}.url`, { min: 1, max: MAX_URL_PATTERN_LENGTH });

  if (!methodSet.has(method)) {
    throw new ValidationError(`${path}.method 不受支持`);
  }
  if (!matchTypeSet.has(matchType)) {
    throw new ValidationError(`${path}.matchType 不受支持`);
  }
  if (!bodyTypeSet.has(bodyType)) {
    throw new ValidationError(`${path}.bodyType 不受支持`);
  }
  if (matchType === 'regex') {
    if (url.length > MAX_REGEX_LENGTH) {
      throw new ValidationError(`${path} 的正则表达式最多允许 ${MAX_REGEX_LENGTH} 个字符`);
    }
    try {
      new RegExp(url);
    } catch {
      throw new ValidationError(`${path} 包含无效的正则表达式`);
    }
  }

  const headersValue = record.headers;
  if (!Array.isArray(headersValue) || headersValue.length > MAX_HEADERS) {
    throw new ValidationError(`${path}.headers 最多允许 ${MAX_HEADERS} 项`);
  }

  const body = expectString(record.body, `${path}.body`, {
    max: MAX_BODY_LENGTH,
    trim: false,
  });

  return {
    id: expectString(record.id, `${path}.id`, { min: 1, max: 160 }),
    name: expectString(record.name, `${path}.name`, { min: 1, max: 80 }),
    enabled: expectBoolean(record.enabled, `${path}.enabled`),
    method: method as MockRule['method'],
    matchType: matchType as MockRule['matchType'],
    url,
    statusCode: expectInteger(record.statusCode, `${path}.statusCode`, 100, 599),
    delayMs: expectInteger(record.delayMs, `${path}.delayMs`, 0, MAX_DELAY_MS),
    headers: headersValue.map((header, headerIndex) => normalizeHeader(header, index, headerIndex)),
    bodyType: bodyType as MockRule['bodyType'],
    body,
    createdAt: expectInteger(record.createdAt, `${path}.createdAt`, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: expectInteger(record.updatedAt, `${path}.updatedAt`, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function normalizeRules(value: unknown): MockRule[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('rules 必须是数组');
  }
  if (value.length > MAX_RULES) {
    throw new ValidationError(`最多允许 ${MAX_RULES} 条规则`);
  }

  const rules = value.map((rule, index) => normalizeRule(rule, index));
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) {
      throw new ValidationError(`存在重复的规则 ID：${rule.id}`);
    }
    ids.add(rule.id);
  }
  return rules;
}

export function normalizeWorkspace(value: unknown): WorkspaceState {
  const record = expectRecord(value, '工作区');
  if (record.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidationError(`不支持的数据版本：${String(record.schemaVersion)}`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: expectInteger(record.revision, 'revision', 0, Number.MAX_SAFE_INTEGER),
    globalEnabled: expectBoolean(record.globalEnabled, 'globalEnabled'),
    rules: normalizeRules(record.rules),
  };
}
