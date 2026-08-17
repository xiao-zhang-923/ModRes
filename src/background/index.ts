import type { StateUpdatedMessage } from '../shared/messages';
import type { RuntimeState } from '../shared/types';
import { DebuggerController } from './debugger-controller';
import { registerMessageRouter } from './message-router';
import { WorkspaceRepository } from './repository';

const repository = new WorkspaceRepository();
const controller = new DebuggerController(repository, () => {
  void broadcastState();
});

async function getState(): Promise<RuntimeState> {
  return {
    workspace: await repository.get(),
    sessions: controller.getSessions(),
  };
}

async function broadcastState(state?: RuntimeState): Promise<void> {
  const message: StateUpdatedMessage = {
    type: 'STATE_UPDATED',
    state: state ?? (await getState()),
  };
  await chrome.runtime.sendMessage(message).catch(() => undefined);
}

controller.registerListeners();
registerMessageRouter({ repository, controller, getState, broadcastState });

chrome.runtime.onInstalled.addListener(() => {
  void repository.initialize().then(() => broadcastState());
});

chrome.runtime.onStartup.addListener(() => {
  void repository.initialize();
});
