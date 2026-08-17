import { createDefaultWorkspace } from '../shared/defaults';
import { STORAGE_KEY } from '../shared/types';
import type { MockRule, WorkspaceState } from '../shared/types';
import { normalizeRules, normalizeWorkspace } from '../shared/validation';

export class RevisionConflictError extends Error {
  readonly code = 'REVISION_CONFLICT';

  constructor() {
    super('规则已在其他窗口中更新，请刷新后重试');
    this.name = 'RevisionConflictError';
  }
}

function cloneWorkspace(workspace: WorkspaceState): WorkspaceState {
  return structuredClone(workspace);
}

export class WorkspaceRepository {
  private cached: WorkspaceState | null = null;
  private initializing: Promise<WorkspaceState> | null = null;

  async initialize(): Promise<WorkspaceState> {
    if (this.cached) return cloneWorkspace(this.cached);
    if (!this.initializing) this.initializing = this.load();
    const workspace = await this.initializing;
    return cloneWorkspace(workspace);
  }

  private async load(): Promise<WorkspaceState> {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const candidate = stored[STORAGE_KEY];

    if (candidate !== undefined) {
      try {
        this.cached = normalizeWorkspace(candidate);
        return this.cached;
      } catch (error) {
        console.warn('ModRes ignored invalid stored data', error);
      }
    }

    this.cached = createDefaultWorkspace();
    await this.persist(this.cached);
    return this.cached;
  }

  async get(): Promise<WorkspaceState> {
    await this.initialize();
    return cloneWorkspace(this.cached!);
  }

  async saveRules(rules: MockRule[], expectedRevision: number): Promise<WorkspaceState> {
    const current = await this.get();
    this.assertRevision(current, expectedRevision);
    const next: WorkspaceState = {
      ...current,
      revision: current.revision + 1,
      rules: normalizeRules(rules),
    };
    await this.persist(next);
    return cloneWorkspace(next);
  }

  async setGlobalEnabled(enabled: boolean): Promise<WorkspaceState> {
    const current = await this.get();
    if (current.globalEnabled === enabled) return current;
    const next: WorkspaceState = {
      ...current,
      revision: current.revision + 1,
      globalEnabled: enabled,
    };
    await this.persist(next);
    return cloneWorkspace(next);
  }

  async importWorkspace(candidate: WorkspaceState, expectedRevision: number): Promise<WorkspaceState> {
    const current = await this.get();
    this.assertRevision(current, expectedRevision);
    const imported = normalizeWorkspace(candidate);
    const next: WorkspaceState = {
      ...imported,
      revision: current.revision + 1,
    };
    await this.persist(next);
    return cloneWorkspace(next);
  }

  async reset(): Promise<WorkspaceState> {
    const current = await this.get();
    const next = createDefaultWorkspace();
    next.revision = current.revision + 1;
    await this.persist(next);
    return cloneWorkspace(next);
  }

  private assertRevision(current: WorkspaceState, expectedRevision: number): void {
    if (!Number.isInteger(expectedRevision) || current.revision !== expectedRevision) {
      throw new RevisionConflictError();
    }
  }

  private async persist(workspace: WorkspaceState): Promise<void> {
    this.cached = workspace;
    await chrome.storage.local.set({ [STORAGE_KEY]: workspace });
  }
}
