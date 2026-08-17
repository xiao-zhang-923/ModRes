import type { BodyType, MockRule } from './types';

export interface CdpHeader {
  name: string;
  value: string;
}

const managedHeaderNames = new Set(['content-length', 'content-encoding', 'transfer-encoding']);

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchesRule(rule: MockRule, requestUrl: string, requestMethod: string): boolean {
  if (!rule.enabled) return false;
  if (rule.method !== 'ANY' && rule.method !== requestMethod.toUpperCase()) return false;

  switch (rule.matchType) {
    case 'exact':
      return requestUrl === rule.url;
    case 'glob':
      return globToRegExp(rule.url).test(requestUrl);
    case 'regex':
      return new RegExp(rule.url).test(requestUrl);
    case 'contains':
    default:
      return requestUrl.includes(rule.url);
  }
}

export function findMatchingRule(
  rules: MockRule[],
  requestUrl: string,
  requestMethod: string,
): MockRule | undefined {
  return rules.find((rule) => matchesRule(rule, requestUrl, requestMethod));
}

function defaultContentType(bodyType: BodyType): string {
  switch (bodyType) {
    case 'html':
      return 'text/html; charset=utf-8';
    case 'text':
      return 'text/plain; charset=utf-8';
    case 'json':
    default:
      return 'application/json; charset=utf-8';
  }
}

export function buildResponseHeaders(rule: MockRule): CdpHeader[] {
  const headers = rule.headers
    .filter((header) => header.enabled && header.name.trim())
    .filter((header) => !managedHeaderNames.has(header.name.trim().toLowerCase()))
    .map((header) => ({ name: header.name.trim(), value: header.value }));

  const hasContentType = headers.some((header) => header.name.toLowerCase() === 'content-type');
  if (!hasContentType) {
    headers.push({ name: 'Content-Type', value: defaultContentType(rule.bodyType) });
  }
  return headers;
}

export function responseCanHaveBody(method: string, statusCode: number): boolean {
  return method.toUpperCase() !== 'HEAD' && statusCode !== 204 && statusCode !== 304;
}

export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
