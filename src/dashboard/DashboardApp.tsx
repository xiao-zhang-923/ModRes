import {
  Activity,
  BookOpen,
  CircleAlert,
  Clock3,
  Download,
  Gauge,
  Layers3,
  Moon,
  Plus,
  Power,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sun,
  Upload,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Brand } from '../components/Brand';
import { Toggle } from '../components/Toggle';
import { createHeader, createId, createRule } from '../shared/defaults';
import { RuntimeClientError, runtimeClient, subscribeToRuntimeState } from '../shared/runtime-client';
import type { MockRule, RuntimeState, TabSession } from '../shared/types';
import { normalizeWorkspace } from '../shared/validation';
import { RuleEditor } from './RuleEditor';
import { RuleList } from './RuleList';
import '../styles/dashboard.css';

type DashboardView = 'rules' | 'sessions' | 'guide';
type ToastTone = 'success' | 'error' | 'info';
type Theme = 'light' | 'dark';

interface ToastState {
  message: string;
  tone: ToastTone;
}

function cloneRule(rule: MockRule): MockRule {
  return structuredClone(rule);
}

function initialTheme(): Theme {
  const stored = localStorage.getItem('modres.theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function errorMessage(error: unknown): string {
  if (error instanceof RuntimeClientError) return error.message;
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

function sessionStatus(session: TabSession): { label: string; tone: string } {
  switch (session.status) {
    case 'active':
      return { label: '正在拦截', tone: 'active' };
    case 'attaching':
      return { label: '连接中', tone: 'pending' };
    case 'detaching':
      return { label: '停止中', tone: 'pending' };
    case 'error':
      return { label: '会话异常', tone: 'error' };
    default:
      return { label: '已停止', tone: 'idle' };
  }
}

function SessionsView({
  sessions,
  busy,
  onDisable,
}: {
  sessions: TabSession[];
  busy: boolean;
  onDisable: (tabId: number) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="content-empty-state sessions-empty">
        <span className="empty-visual"><Radio size={30} /></span>
        <h2>还没有运行会话</h2>
        <p>打开需要调试的网站，然后从浏览器工具栏的 ModRes Popup 启用当前标签页。</p>
        <div className="empty-steps">
          <span><b>1</b> 打开目标网站</span>
          <span><b>2</b> 点击 ModRes 图标</span>
          <span><b>3</b> 启动 Mock</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sessions-grid">
      {sessions.map((session) => {
        const status = sessionStatus(session);
        let hostname = session.url;
        try {
          hostname = new URL(session.url).hostname;
        } catch {
          // 过期会话无法解析时保留原始地址。
        }
        return (
          <article className="session-card" key={session.tabId} data-status={status.tone}>
            <header>
              <span className="session-icon"><Activity size={18} /></span>
              <div>
                <h3>{session.title}</h3>
                <p>{hostname || `Tab ${session.tabId}`}</p>
              </div>
              <span className="session-status"><i />{status.label}</span>
            </header>
            <div className="session-metrics">
              <div><strong>{session.matchedCount}</strong><span>命中次数</span></div>
              <div><strong>{session.lastMatchedRule || '—'}</strong><span>最近命中</span></div>
            </div>
            {session.errorMessage && (
              <div className="session-error"><CircleAlert size={15} />{session.errorMessage}</div>
            )}
            <footer>
              <span>Tab #{session.tabId}</span>
              <button
                type="button"
                onClick={() => onDisable(session.tabId)}
                disabled={busy || session.status === 'idle'}
              >
                <Power size={14} /> 停止会话
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function GuideView() {
  return (
    <div className="guide-layout">
      <section className="guide-hero">
        <span className="eyebrow">QUICK START</span>
        <h2>三步完成第一个响应 Mock</h2>
        <p>规则保存在浏览器本地。只有你主动启用的标签页才会进入调试会话。</p>
      </section>
      <div className="guide-steps">
        <article><span>01</span><div><h3>创建匹配规则</h3><p>选择 Method 和 URL 匹配方式。队列中第一条命中的启用规则会生效。</p></div></article>
        <article><span>02</span><div><h3>设计响应</h3><p>设置状态码、响应头、正文与延迟。JSON、文本和 HTML 都可以直接返回。</p></div></article>
        <article><span>03</span><div><h3>连接目标页面</h3><p>在目标网站点击 ModRes 工具栏图标并启动 Mock，然后刷新页面触发请求。</p></div></article>
      </div>
      <section className="permission-note">
        <ShieldCheck size={22} />
        <div>
          <h3>为什么需要 debugger 权限？</h3>
          <p>Chrome 的常规扩展 API 不能改写任意响应正文。ModRes 仅在你明确启用的标签页上，通过 Chrome DevTools Protocol 完成响应替换；关闭会话后立即 detach。</p>
        </div>
      </section>
      <section className="guide-limits">
        <h3>使用提示</h3>
        <ul>
          <li>DevTools 与 ModRes 不能同时调试同一标签页。</li>
          <li>Chrome 设置页、扩展商店等受保护页面无法启用。</li>
          <li>跨域场景仍需在 Mock 响应中配置正确的 CORS Headers。</li>
          <li>导出的 JSON 可能包含业务响应数据，请妥善保存。</li>
        </ul>
      </section>
    </div>
  );
}

export function DashboardApp() {
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MockRule | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<DashboardView>('rules');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const importInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = (message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('modres.theme', theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    void runtimeClient
      .getState()
      .then((state) => {
        if (mounted) setRuntimeState(state);
      })
      .catch((error) => notify(errorMessage(error), 'error'));
    const unsubscribe = subscribeToRuntimeState((state) => {
      if (mounted) setRuntimeState(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="搜索规则"]')?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!runtimeState) return;
    const rules = runtimeState.workspace.rules;
    const selected = rules.find((rule) => rule.id === selectedId);
    if (!selected) {
      const first = rules[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? cloneRule(first) : null);
      setDirty(false);
      setSaveFailed(false);
    } else if (!dirty) {
      setDraft(cloneRule(selected));
      setSaveFailed(false);
    }
  }, [runtimeState?.workspace.revision, selectedId, dirty]);

  const commitRules = async (rules: MockRule[], successMessage?: string): Promise<RuntimeState | null> => {
    if (!runtimeState || busy) return null;
    setBusy(true);
    try {
      const next = await runtimeClient.saveRules(rules, runtimeState.workspace.revision);
      setRuntimeState(next);
      if (successMessage) notify(successMessage, 'success');
      return next;
    } catch (error) {
      notify(errorMessage(error), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const selectRule = (id: string) => {
    if (busy || id === selectedId) return;
    if (dirty && !window.confirm('当前规则有未保存更改，确定放弃并切换吗？')) return;
    const rule = runtimeState?.workspace.rules.find((item) => item.id === id);
    setSelectedId(id);
    setDraft(rule ? cloneRule(rule) : null);
    setDirty(false);
    setSaveFailed(false);
    setToast(null);
  };

  const createNewRule = async () => {
    if (!runtimeState) return;
    if (dirty && !window.confirm('当前规则有未保存更改，确定放弃并新建吗？')) return;
    const nextRule = createRule({
      name: `新规则 ${runtimeState.workspace.rules.length + 1}`,
      enabled: false,
    });
    const next = await commitRules([nextRule, ...runtimeState.workspace.rules], '规则已创建');
    if (next) {
      const saved = next.workspace.rules.find((rule) => rule.id === nextRule.id) ?? nextRule;
      setSelectedId(saved.id);
      setDraft(cloneRule(saved));
      setDirty(false);
      setSaveFailed(false);
      setView('rules');
    }
  };

  const saveDraft = async () => {
    if (!runtimeState || !draft || busy) return;
    setSaveFailed(false);
    const cleaned: MockRule = {
      ...draft,
      name: draft.name.trim(),
      url: draft.url.trim(),
      updatedAt: Date.now(),
      headers: draft.headers.filter((header) => header.name.trim() || header.value),
    };
    const rules = runtimeState.workspace.rules.map((rule) =>
      rule.id === cleaned.id ? cleaned : rule,
    );
    const next = await commitRules(rules, '更改已保存');
    const saved = next?.workspace.rules.find((rule) => rule.id === cleaned.id);
    if (saved) {
      setDraft(cloneRule(saved));
      setDirty(false);
      setSaveFailed(false);
    } else {
      setDirty(true);
      setSaveFailed(true);
    }
  };

  const duplicateRule = async () => {
    if (!runtimeState || !draft) return;
    const now = Date.now();
    const duplicated = createRule({
      ...draft,
      id: createId('rule'),
      name: `${draft.name} 副本`,
      enabled: false,
      headers: draft.headers.map((header) => createHeader({ ...header, id: createId('header') })),
      createdAt: now,
      updatedAt: now,
    });
    const sourceIndex = runtimeState.workspace.rules.findIndex((rule) => rule.id === draft.id);
    const rules = [...runtimeState.workspace.rules];
    rules.splice(Math.max(0, sourceIndex + 1), 0, duplicated);
    const next = await commitRules(rules, '规则副本已创建');
    if (next) {
      setSelectedId(duplicated.id);
      setDraft(cloneRule(duplicated));
      setDirty(false);
      setSaveFailed(false);
    }
  };

  const deleteRule = async () => {
    if (!runtimeState || !draft) return;
    if (!window.confirm(`确定删除“${draft.name}”吗？此操作无法撤销。`)) return;
    const currentIndex = runtimeState.workspace.rules.findIndex((rule) => rule.id === draft.id);
    const rules = runtimeState.workspace.rules.filter((rule) => rule.id !== draft.id);
    const next = await commitRules(rules, '规则已删除');
    if (next) {
      const nextSelection = next.workspace.rules[Math.min(currentIndex, next.workspace.rules.length - 1)] ?? null;
      setSelectedId(nextSelection?.id ?? null);
      setDraft(nextSelection ? cloneRule(nextSelection) : null);
      setDirty(false);
      setSaveFailed(false);
    }
  };

  const moveRule = async (direction: -1 | 1) => {
    if (!runtimeState || !draft || dirty) return;
    const rules = [...runtimeState.workspace.rules];
    const from = rules.findIndex((rule) => rule.id === draft.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= rules.length) return;
    [rules[from], rules[to]] = [rules[to], rules[from]];
    await commitRules(rules, '规则顺序已更新');
  };

  const toggleGlobal = async (enabled: boolean) => {
    if (!runtimeState || busy) return;
    setBusy(true);
    try {
      const next = await runtimeClient.setGlobalEnabled(enabled);
      setRuntimeState(next);
      notify(enabled ? 'ModRes 已全局启用' : 'ModRes 已暂停并断开所有会话', 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const disableSession = async (tabId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runtimeClient.disableTab(tabId);
      setRuntimeState(next);
      notify('调试会话已停止', 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportWorkspace = () => {
    if (!runtimeState) return;
    const blob = new Blob([JSON.stringify(runtimeState.workspace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `modres-rules-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('规则已导出；文件可能包含业务响应数据，请妥善保存', 'info');
  };

  const importWorkspace = async (file: File) => {
    if (!runtimeState) return;
    try {
      const candidate = normalizeWorkspace(JSON.parse(await file.text()));
      if (!window.confirm(`导入将替换当前的 ${runtimeState.workspace.rules.length} 条规则，是否继续？`)) return;
      setBusy(true);
      const next = await runtimeClient.importWorkspace(candidate, runtimeState.workspace.revision);
      setRuntimeState(next);
      const first = next.workspace.rules[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? cloneRule(first) : null);
      setDirty(false);
      setSaveFailed(false);
      notify(`已导入 ${next.workspace.rules.length} 条规则`, 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = '';
    }
  };

  const resetWorkspace = async () => {
    if (!window.confirm('确定恢复默认工作区吗？当前规则和运行会话都会被清除。')) return;
    setBusy(true);
    try {
      const next = await runtimeClient.resetWorkspace();
      setRuntimeState(next);
      const first = next.workspace.rules[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? cloneRule(first) : null);
      setDirty(false);
      setSaveFailed(false);
      notify('默认工作区已恢复', 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!runtimeState) {
    return (
      <main className="dashboard-loading">
        <Brand />
        <span className="loading-orbit"><i /><i /><i /></span>
        <p>正在连接 Response Studio…</p>
      </main>
    );
  }

  const rules = runtimeState.workspace.rules;
  const activeRules = rules.filter((rule) => rule.enabled).length;
  const activeSessions = runtimeState.sessions.filter((session) => session.status === 'active').length;
  const totalMatches = runtimeState.sessions.reduce((sum, session) => sum + session.matchedCount, 0);
  const selectedIndex = draft ? rules.findIndex((rule) => rule.id === draft.id) : -1;
  const pageCopy = {
    rules: { eyebrow: 'RESPONSE STUDIO', title: '规则工作台', description: '设计、排序并运行你的 HTTP Mock 响应' },
    sessions: { eyebrow: 'LIVE RUNTIME', title: '运行会话', description: '查看当前标签页的拦截状态与命中统计' },
    guide: { eyebrow: 'DOCUMENTATION', title: '快速上手', description: '了解 ModRes 的工作方式和使用边界' },
  }[view];

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand"><Brand inverse /></div>
        <nav className="sidebar-nav" aria-label="主导航">
          <button type="button" data-active={view === 'rules' || undefined} onClick={() => setView('rules')}>
            <Layers3 size={18} /><em>规则工作台</em><b>{rules.length}</b>
          </button>
          <button type="button" data-active={view === 'sessions' || undefined} onClick={() => setView('sessions')}>
            <Radio size={18} /><em>运行会话</em>{activeSessions > 0 && <i>{activeSessions}</i>}
          </button>
          <button type="button" data-active={view === 'guide' || undefined} onClick={() => setView('guide')}>
            <BookOpen size={18} /><em>快速上手</em>
          </button>
        </nav>

        <div className="sidebar-spacer" />
        <section className="master-control" data-enabled={runtimeState.workspace.globalEnabled || undefined}>
          <header><span><Zap size={15} /> MASTER ENGINE</span><Toggle checked={runtimeState.workspace.globalEnabled} onChange={toggleGlobal} disabled={busy} label="全局启用 ModRes" size="small" /></header>
          <strong>{runtimeState.workspace.globalEnabled ? '引擎已就绪' : '引擎已暂停'}</strong>
          <p>{runtimeState.workspace.globalEnabled ? `${activeRules} 条规则可参与匹配` : '所有标签页会话均已断开'}</p>
        </section>
        <footer className="sidebar-footer">
          <button type="button" onClick={resetWorkspace} disabled={busy}><RotateCcw size={15} /> 恢复默认</button>
          <span>v{chrome.runtime.getManifest().version}</span>
        </footer>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <span className="eyebrow">{pageCopy.eyebrow}</span>
            <h1>{pageCopy.title}</h1>
            <p>{pageCopy.description}</p>
          </div>
          <div className="topbar-metrics">
            <span><Gauge size={16} /><b>{activeRules}</b> active</span>
            <span><Radio size={16} /><b>{activeSessions}</b> live</span>
            <span><Activity size={16} /><b>{totalMatches}</b> hits</span>
          </div>
          <div className="topbar-actions">
            <button className="icon-button theme-button" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="切换主题">
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importWorkspace(file);
              }}
            />
            <button className="secondary-button" type="button" onClick={() => importInput.current?.click()} disabled={busy}>
              <Upload size={16} /> 导入
            </button>
            <button className="secondary-button" type="button" onClick={exportWorkspace} disabled={busy}>
              <Download size={16} /> 导出
            </button>
            {view === 'rules' && (
              <button className="primary-button" type="button" onClick={createNewRule} disabled={busy}>
                <Plus size={17} /> 新建规则
              </button>
            )}
          </div>
        </header>

        {view === 'rules' && (
          <div className="studio-workspace">
            <RuleList
              rules={rules}
              selectedId={selectedId}
              search={search}
              busy={busy}
              onSearchChange={setSearch}
              onSelect={selectRule}
              onCreate={() => void createNewRule()}
            />
            {draft ? (
              <RuleEditor
                rule={draft}
                dirty={dirty}
                saveFailed={saveFailed}
                busy={busy}
                canMoveUp={selectedIndex > 0}
                canMoveDown={selectedIndex >= 0 && selectedIndex < rules.length - 1}
                onChange={(rule) => {
                  setDraft(rule);
                  setDirty(true);
                  setSaveFailed(false);
                }}
                onSave={() => void saveDraft()}
                onDelete={() => void deleteRule()}
                onDuplicate={() => void duplicateRule()}
                onMove={(direction) => void moveRule(direction)}
                onNotify={notify}
              />
            ) : (
              <div className="content-empty-state editor-empty">
                <span className="empty-visual"><Layers3 size={30} /></span>
                <h2>创建你的第一条规则</h2>
                <p>定义请求匹配条件，并返回自定义状态码、Headers 和 Body。</p>
                <button className="primary-button" type="button" onClick={createNewRule}><Plus size={17} /> 新建规则</button>
              </div>
            )}
          </div>
        )}

        {view === 'sessions' && <div className="dashboard-content"><SessionsView sessions={runtimeState.sessions} busy={busy} onDisable={(tabId) => void disableSession(tabId)} /></div>}
        {view === 'guide' && <div className="dashboard-content"><GuideView /></div>}
      </main>

      {toast && (
        <div className="toast" data-tone={toast.tone} role="status">
          {toast.tone === 'error' ? <CircleAlert size={18} /> : toast.tone === 'success' ? <ShieldCheck size={18} /> : <Clock3 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
