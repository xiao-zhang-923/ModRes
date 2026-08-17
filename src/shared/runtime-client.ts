import type { ApiResponse, RequestMessage } from './messages';
import { isStateUpdatedMessage } from './messages';
import type { BrowserTab, MockRule, RuntimeState, WorkspaceState } from './types';

export class RuntimeClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuntimeClientError';
    this.code = code;
  }
}

async function sendRequest(message: RequestMessage): Promise<RuntimeState> {
  const response = (await chrome.runtime.sendMessage(message)) as ApiResponse<RuntimeState> | undefined;
  if (!response) {
    throw new RuntimeClientError('NO_RESPONSE', '后台服务没有响应，请重新加载扩展后再试');
  }
  if (!response.ok) {
    throw new RuntimeClientError(response.error.code, response.error.message);
  }
  return response.data;
}

export const runtimeClient = {
  getState: () => sendRequest({ type: 'GET_STATE' }),
  saveRules: (rules: MockRule[], expectedRevision: number) =>
    sendRequest({ type: 'SAVE_RULES', rules, expectedRevision }),
  setGlobalEnabled: (enabled: boolean) =>
    sendRequest({ type: 'SET_GLOBAL_ENABLED', enabled }),
  enableTab: (tabId: number) => sendRequest({ type: 'ENABLE_TAB', tabId }),
  disableTab: (tabId: number) => sendRequest({ type: 'DISABLE_TAB', tabId }),
  importWorkspace: (workspace: WorkspaceState, expectedRevision: number) =>
    sendRequest({ type: 'IMPORT_WORKSPACE', workspace, expectedRevision }),
  resetWorkspace: () => sendRequest({ type: 'RESET_WORKSPACE' }),
};

export function subscribeToRuntimeState(listener: (state: RuntimeState) => void): () => void {
  const handleMessage = (message: unknown) => {
    if (isStateUpdatedMessage(message)) listener(message.state);
  };
  chrome.runtime.onMessage.addListener(handleMessage);
  return () => chrome.runtime.onMessage.removeListener(handleMessage);
}

export async function getCurrentTab(): Promise<BrowserTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number') return null;
  return {
    id: tab.id,
    title: tab.title || '未命名标签页',
    url: tab.url || '',
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
  };
}
