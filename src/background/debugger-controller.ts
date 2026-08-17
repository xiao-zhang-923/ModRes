import { buildResponseHeaders, findMatchingRule, responseCanHaveBody, utf8ToBase64 } from '../shared/matcher';
import type { TabSession } from '../shared/types';
import type { WorkspaceRepository } from './repository';

interface PausedRequest {
  requestId: string;
  request: {
    url: string;
    method: string;
  };
}

interface ErrorDetails {
  code: string;
  message: string;
}

export class DebuggerControllerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DebuggerControllerError';
    this.code = code;
  }
}

function getLastErrorMessage(fallback: string): string | null {
  return chrome.runtime.lastError?.message || fallback || null;
}

function attachDebugger(target: chrome.debugger.Debuggee): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      const message = getLastErrorMessage('');
      if (message) reject(new Error(message));
      else resolve();
    });
  });
}

function detachDebugger(target: chrome.debugger.Debuggee): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const message = getLastErrorMessage('');
      if (message) reject(new Error(message));
      else resolve();
    });
  });
}

function sendCommand(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: Record<string, unknown>,
): Promise<object> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const message = getLastErrorMessage('');
      if (message) reject(new Error(message));
      else resolve(result ?? {});
    });
  });
}

function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const message = getLastErrorMessage('');
      if (message) reject(new Error(message));
      else resolve(tab);
    });
  });
}

function isPausedRequest(value: unknown): value is PausedRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PausedRequest>;
  return (
    typeof candidate.requestId === 'string' &&
    typeof candidate.request?.url === 'string' &&
    typeof candidate.request.method === 'string'
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeError(error: unknown): ErrorDetails {
  if (error instanceof DebuggerControllerError) {
    return { code: error.code, message: error.message };
  }

  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.toLowerCase();
  if (message.includes('another debugger') || message.includes('already attached')) {
    return {
      code: 'DEVTOOLS_IN_USE',
      message: '此标签页正被 DevTools 或其他调试器占用，请关闭后重试',
    };
  }
  if (message.includes('cannot access') || message.includes('cannot attach')) {
    return {
      code: 'PROTECTED_PAGE',
      message: 'Chrome 不允许在这个页面上运行响应 Mock',
    };
  }
  if (message.includes('no tab') || message.includes('not found')) {
    return { code: 'TAB_NOT_FOUND', message: '目标标签页已关闭或不存在' };
  }
  return { code: 'DEBUGGER_ERROR', message: raw || '无法启动调试会话' };
}

function detachMessage(reason: string): ErrorDetails {
  if (reason === 'replaced_with_devtools') {
    return {
      code: 'REPLACED_BY_DEVTOOLS',
      message: '会话已被 DevTools 接管；关闭 DevTools 后可以重新启用',
    };
  }
  if (reason === 'canceled_by_user') {
    return {
      code: 'CANCELED_BY_USER',
      message: '你已从 Chrome 调试提示条中停止此会话',
    };
  }
  return { code: 'SESSION_DETACHED', message: '调试会话已断开，请重新启用' };
}

export class DebuggerController {
  private readonly sessions = new Map<number, TabSession>();
  private readonly activationTokens = new Map<number, symbol>();
  private readonly manualDetach = new Set<number>();

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly onStateChanged: () => void,
  ) {}

  registerListeners(): void {
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (method === 'Fetch.requestPaused' && typeof source.tabId === 'number') {
        void this.handlePausedRequest(source, params);
      }
    });

    chrome.debugger.onDetach.addListener((source, reason) => {
      if (typeof source.tabId === 'number') this.handleDetach(source.tabId, String(reason));
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.activationTokens.delete(tabId);
      if (this.sessions.delete(tabId)) this.onStateChanged();
    });
  }

  getSessions(): TabSession[] {
    return [...this.sessions.values()]
      .map((session) => structuredClone(session))
      .sort((left, right) => left.tabId - right.tabId);
  }

  async enableTab(tabId: number): Promise<void> {
    if (!Number.isInteger(tabId) || tabId < 0) {
      throw new DebuggerControllerError('INVALID_TAB', '无效的标签页');
    }

    const existing = this.sessions.get(tabId);
    if (existing?.status === 'active' || existing?.status === 'attaching') return;

    const token = Symbol(`tab-${tabId}`);
    this.activationTokens.set(tabId, token);
    this.updateSession({
      tabId,
      status: 'attaching',
      title: existing?.title ?? '正在读取标签页…',
      url: existing?.url ?? '',
      matchedCount: existing?.matchedCount ?? 0,
    });

    const target: chrome.debugger.Debuggee = { tabId };
    let attached = false;
    try {
      const tab = await getTab(tabId);
      const url = tab.url ?? '';
      if (!/^https?:\/\//i.test(url)) {
        throw new DebuggerControllerError(
          'UNSUPPORTED_PAGE',
          'ModRes 当前仅支持 http:// 和 https:// 页面',
        );
      }
      this.updateSession({
        tabId,
        status: 'attaching',
        title: tab.title || '未命名标签页',
        url,
        matchedCount: existing?.matchedCount ?? 0,
      });

      await attachDebugger(target);
      attached = true;
      if (this.activationTokens.get(tabId) !== token) {
        await detachDebugger(target).catch(() => undefined);
        return;
      }

      await sendCommand(target, 'Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      });
      if (this.activationTokens.get(tabId) !== token) {
        await sendCommand(target, 'Fetch.disable').catch(() => undefined);
        await detachDebugger(target).catch(() => undefined);
        return;
      }

      this.updateSession({
        tabId,
        status: 'active',
        title: tab.title || '未命名标签页',
        url,
        attachedAt: Date.now(),
        matchedCount: existing?.matchedCount ?? 0,
      });
    } catch (error) {
      this.activationTokens.delete(tabId);
      if (attached) await detachDebugger(target).catch(() => undefined);
      const details = normalizeError(error);
      const latest = this.sessions.get(tabId);
      this.updateSession({
        tabId,
        status: 'error',
        title: latest?.title ?? '未命名标签页',
        url: latest?.url ?? '',
        matchedCount: latest?.matchedCount ?? 0,
        errorCode: details.code,
        errorMessage: details.message,
      });
      throw new DebuggerControllerError(details.code, details.message);
    }
  }

  async disableTab(tabId: number): Promise<void> {
    this.activationTokens.delete(tabId);
    const existing = this.sessions.get(tabId);
    if (!existing) return;

    const target: chrome.debugger.Debuggee = { tabId };
    this.manualDetach.add(tabId);
    this.updateSession({ ...existing, status: 'detaching', errorCode: undefined, errorMessage: undefined });
    await sendCommand(target, 'Fetch.disable').catch(() => undefined);
    await detachDebugger(target).catch(() => undefined);
    this.manualDetach.delete(tabId);

    const latest = this.sessions.get(tabId) ?? existing;
    this.updateSession({
      ...latest,
      status: 'idle',
      attachedAt: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      detachReason: undefined,
    });
  }

  async disableAll(): Promise<void> {
    const tabIds = [...this.sessions.values()]
      .filter((session) => session.status !== 'idle')
      .map((session) => session.tabId);
    await Promise.allSettled(tabIds.map((tabId) => this.disableTab(tabId)));
  }

  private async handlePausedRequest(
    source: chrome.debugger.Debuggee,
    params: unknown,
  ): Promise<void> {
    if (!isPausedRequest(params) || typeof source.tabId !== 'number') return;
    const { requestId, request } = params;
    let completed = false;

    try {
      const session = this.sessions.get(source.tabId);
      const workspace = await this.repository.get();
      if (session?.status !== 'active' || !workspace.globalEnabled) {
        await sendCommand(source, 'Fetch.continueRequest', { requestId });
        completed = true;
        return;
      }

      const rule = findMatchingRule(workspace.rules, request.url, request.method);
      if (!rule) {
        await sendCommand(source, 'Fetch.continueRequest', { requestId });
        completed = true;
        return;
      }

      if (rule.delayMs > 0) await delay(rule.delayMs);
      const currentSession = this.sessions.get(source.tabId);
      const currentWorkspace = await this.repository.get();
      if (currentSession?.status !== 'active' || !currentWorkspace.globalEnabled) {
        await sendCommand(source, 'Fetch.continueRequest', { requestId });
        completed = true;
        return;
      }

      const canHaveBody = responseCanHaveBody(request.method, rule.statusCode);
      await sendCommand(source, 'Fetch.fulfillRequest', {
        requestId,
        responseCode: rule.statusCode,
        responseHeaders: buildResponseHeaders(rule),
        ...(canHaveBody ? { body: utf8ToBase64(rule.body) } : {}),
      });
      completed = true;

      const latest = this.sessions.get(source.tabId);
      if (latest?.status === 'active') {
        this.updateSession({
          ...latest,
          matchedCount: latest.matchedCount + 1,
          lastMatchedRule: rule.name,
          lastMatchedAt: Date.now(),
        });
      }
    } catch (error) {
      console.warn('ModRes request interception failed', error);
    } finally {
      if (!completed) {
        await sendCommand(source, 'Fetch.continueRequest', { requestId }).catch(() => undefined);
      }
    }
  }

  private handleDetach(tabId: number, reason: string): void {
    this.activationTokens.delete(tabId);
    const existing = this.sessions.get(tabId);
    if (!existing) return;

    if (this.manualDetach.has(tabId) || existing.status === 'detaching') {
      this.updateSession({
        ...existing,
        status: 'idle',
        attachedAt: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        detachReason: undefined,
      });
      return;
    }

    const details = detachMessage(reason);
    this.updateSession({
      ...existing,
      status: 'error',
      attachedAt: undefined,
      errorCode: details.code,
      errorMessage: details.message,
      detachReason: reason,
    });
  }

  private updateSession(session: TabSession): void {
    this.sessions.set(session.tabId, session);
    void this.updateBadge(session);
    this.onStateChanged();
  }

  private async updateBadge(session: TabSession): Promise<void> {
    const text =
      session.status === 'active'
        ? 'ON'
        : session.status === 'attaching' || session.status === 'detaching'
          ? '…'
          : session.status === 'error'
            ? '!'
            : '';
    const color = session.status === 'error' ? '#d94f4f' : '#1f8f62';
    await chrome.action.setBadgeBackgroundColor({ tabId: session.tabId, color }).catch(() => undefined);
    await chrome.action.setBadgeText({ tabId: session.tabId, text }).catch(() => undefined);
  }
}
