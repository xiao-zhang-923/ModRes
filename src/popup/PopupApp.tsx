import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  Clock3,
  Globe2,
  Power,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brand } from '../components/Brand';
import { Toggle } from '../components/Toggle';
import {
  getCurrentTab,
  RuntimeClientError,
  runtimeClient,
  subscribeToRuntimeState,
} from '../shared/runtime-client';
import type { BrowserTab, RuntimeState, TabSession } from '../shared/types';
import '../styles/popup.css';

function getErrorMessage(error: unknown): string {
  if (error instanceof RuntimeClientError) return error.message;
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

function displayHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url || '未知页面';
  }
}

function statusCopy(session: TabSession | undefined): { title: string; detail: string; tone: string } {
  switch (session?.status) {
    case 'active':
      return { title: 'Mock 正在运行', detail: '请求命中后将返回自定义响应', tone: 'active' };
    case 'attaching':
      return { title: '正在连接页面', detail: '正在启动安全调试会话…', tone: 'pending' };
    case 'detaching':
      return { title: '正在停止', detail: '正在释放页面调试会话…', tone: 'pending' };
    case 'error':
      return { title: '会话需要处理', detail: session.errorMessage || '请重新启用', tone: 'error' };
    default:
      return { title: 'Mock 尚未启动', detail: '点击下方按钮连接当前标签页', tone: 'idle' };
  }
}

export function PopupApp() {
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [tab, setTab] = useState<BrowserTab | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem('modres.theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      document.documentElement.dataset.theme = storedTheme;
    }

    let mounted = true;
    void Promise.all([runtimeClient.getState(), getCurrentTab()])
      .then(([state, currentTab]) => {
        if (!mounted) return;
        setRuntimeState(state);
        setTab(currentTab);
      })
      .catch((reason) => {
        if (mounted) setError(getErrorMessage(reason));
      });

    const unsubscribe = subscribeToRuntimeState((state) => {
      if (mounted) setRuntimeState(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!runtimeState) {
    return (
      <main className="popup-shell popup-loading">
        <Brand />
        <span className="loading-orbit"><i /><i /><i /></span>
        <p>正在连接当前标签页…</p>
      </main>
    );
  }

  const session = tab ? runtimeState.sessions.find((item) => item.tabId === tab.id) : undefined;
  const status = statusCopy(session);
  const running = session?.status === 'active' || session?.status === 'attaching';
  const transitioning = session?.status === 'attaching' || session?.status === 'detaching';
  const supported = Boolean(tab && /^https?:\/\//i.test(tab.url));
  const enabledRules = runtimeState.workspace.rules.filter((rule) => rule.enabled).length;

  const toggleSession = async () => {
    if (!tab || busy || transitioning) return;
    setBusy(true);
    setError(null);
    try {
      const next = running
        ? await runtimeClient.disableTab(tab.id)
        : await runtimeClient.enableTab(tab.id);
      setRuntimeState(next);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const toggleGlobal = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setRuntimeState(await runtimeClient.setGlobalEnabled(enabled));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <Brand />
        <span className="engine-pill" data-active={runtimeState.workspace.globalEnabled || undefined}>
          <i /> {runtimeState.workspace.globalEnabled ? 'ENGINE READY' : 'PAUSED'}
        </span>
      </header>

      <section className="site-card" data-tone={status.tone}>
        <div className="site-identity">
          <span className="site-favicon">
            {tab?.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <Globe2 size={20} />}
          </span>
          <div>
            <strong title={tab?.title}>{tab?.title || '没有可用标签页'}</strong>
            <span>{tab ? displayHost(tab.url) : '请打开一个网站'}</span>
          </div>
          <span className="connection-status"><i />{running ? 'CONNECTED' : 'DETACHED'}</span>
        </div>

        <div className="power-stage">
          <span className="power-orbit orbit-one" />
          <span className="power-orbit orbit-two" />
          <button
            type="button"
            className="power-button"
            data-running={running || undefined}
            data-busy={(busy || transitioning) || undefined}
            onClick={() => void toggleSession()}
            disabled={!supported || busy || transitioning}
            aria-label={running ? '停止当前标签页 Mock' : '启动当前标签页 Mock'}
          >
            {busy || transitioning ? <span className="button-spinner" /> : <Power size={29} strokeWidth={2.2} />}
          </button>
        </div>

        <div className="session-copy">
          <h1>{status.title}</h1>
          <p>{supported ? status.detail : '此页面不支持调试，请切换到 http:// 或 https:// 网站'}</p>
        </div>

        <div className="session-stats">
          <div><span><Zap size={14} /> 可用规则</span><strong>{enabledRules}</strong></div>
          <div><span><Activity size={14} /> 本次命中</span><strong>{session?.matchedCount ?? 0}</strong></div>
          <div><span><Clock3 size={14} /> 最近规则</span><strong title={session?.lastMatchedRule}>{session?.lastMatchedRule || '—'}</strong></div>
        </div>
      </section>

      {(error || session?.errorMessage) && (
        <div className="popup-alert">
          <CircleAlert size={17} />
          <span>{error || session?.errorMessage}</span>
        </div>
      )}

      <section className="popup-control-row">
        <span className="control-icon"><Radio size={17} /></span>
        <div><strong>Master engine</strong><span>暂停会断开全部运行会话</span></div>
        <Toggle
          checked={runtimeState.workspace.globalEnabled}
          onChange={(enabled) => void toggleGlobal(enabled)}
          disabled={busy}
          label="全局启用 ModRes"
        />
      </section>

      <section className="privacy-note">
        <ShieldCheck size={17} />
        <p><strong>仅作用于当前标签页</strong><span>规则与响应正文只保存在你的浏览器本地</span></p>
        <Sparkles size={15} />
      </section>

      <button className="open-studio-button" type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
        <span><Settings2 size={17} /> 打开 Response Studio</span>
        <ArrowUpRight size={17} />
      </button>
    </main>
  );
}
