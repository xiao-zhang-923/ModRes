import type { ApiResponse, RequestMessage } from '../shared/messages';
import { isRequestMessage } from '../shared/messages';
import type { RuntimeState } from '../shared/types';
import type { DebuggerController } from './debugger-controller';
import type { WorkspaceRepository } from './repository';

interface MessageRouterDependencies {
  repository: WorkspaceRepository;
  controller: DebuggerController;
  getState: () => Promise<RuntimeState>;
  broadcastState: (state?: RuntimeState) => Promise<void>;
}

function errorResponse(error: unknown): ApiResponse<RuntimeState> {
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    ok: false,
    error: {
      code: typeof candidate?.code === 'string' ? candidate.code : 'UNEXPECTED_ERROR',
      message:
        typeof candidate?.message === 'string' ? candidate.message : '发生未知错误，请稍后重试',
    },
  };
}

async function routeMessage(
  message: RequestMessage,
  dependencies: MessageRouterDependencies,
): Promise<RuntimeState> {
  const { repository, controller } = dependencies;

  switch (message.type) {
    case 'GET_STATE':
      return dependencies.getState();

    case 'SAVE_RULES':
      await repository.saveRules(message.rules, message.expectedRevision);
      break;

    case 'SET_GLOBAL_ENABLED':
      await repository.setGlobalEnabled(message.enabled);
      if (!message.enabled) await controller.disableAll();
      break;

    case 'ENABLE_TAB': {
      const workspace = await repository.get();
      if (!workspace.globalEnabled) await repository.setGlobalEnabled(true);
      await controller.enableTab(message.tabId);
      break;
    }

    case 'DISABLE_TAB':
      await controller.disableTab(message.tabId);
      break;

    case 'IMPORT_WORKSPACE': {
      const imported = await repository.importWorkspace(message.workspace, message.expectedRevision);
      if (!imported.globalEnabled) await controller.disableAll();
      break;
    }

    case 'RESET_WORKSPACE':
      await repository.reset();
      await controller.disableAll();
      break;
  }

  const state = await dependencies.getState();
  await dependencies.broadcastState(state);
  return state;
}

export function registerMessageRouter(dependencies: MessageRouterDependencies): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isRequestMessage(message)) return false;

    void routeMessage(message, dependencies)
      .then((state) => sendResponse({ ok: true, data: state } satisfies ApiResponse<RuntimeState>))
      .catch((error) => sendResponse(errorResponse(error)));
    return true;
  });
}
