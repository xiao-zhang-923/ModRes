import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  CircleAlert,
  Copy,
  FileText,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Toggle } from '../components/Toggle';
import { createHeader } from '../shared/defaults';
import { BODY_TYPES, HTTP_METHODS, URL_MATCH_TYPES } from '../shared/types';
import type { BodyType, MockRule, ResponseHeader, UrlMatchType } from '../shared/types';

interface RuleEditorProps {
  rule: MockRule;
  dirty: boolean;
  saveFailed: boolean;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (rule: MockRule) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onNotify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const matchLabels: Record<UrlMatchType, string> = {
  contains: '包含',
  exact: '完全等于',
  glob: '通配符',
  regex: '正则表达式',
};

const bodyLabels: Record<BodyType, string> = {
  json: 'JSON',
  text: 'Text',
  html: 'HTML',
};

export function RuleEditor({
  rule,
  dirty,
  saveFailed,
  busy,
  canMoveUp,
  canMoveDown,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onMove,
  onNotify,
}: RuleEditorProps) {
  const patch = (changes: Partial<MockRule>) => {
    if (busy) return;
    onChange({ ...rule, ...changes, updatedAt: Date.now() });
  };

  const updateHeader = (id: string, changes: Partial<ResponseHeader>) => {
    patch({
      headers: rule.headers.map((header) =>
        header.id === id ? { ...header, ...changes } : header,
      ),
    });
  };

  const removeHeader = (id: string) => {
    patch({ headers: rule.headers.filter((header) => header.id !== id) });
  };

  const formatJson = () => {
    try {
      patch({ body: JSON.stringify(JSON.parse(rule.body), null, 2) });
      onNotify('JSON 已格式化', 'success');
    } catch {
      onNotify('响应正文不是有效的 JSON', 'error');
    }
  };

  return (
    <section className="rule-editor">
      <header className="editor-toolbar">
        <div className="editor-title-group">
          <div
            className="editor-presence"
            data-failed={saveFailed || undefined}
          >
            <span className="live-dot" data-live={rule.enabled || undefined} />
            {saveFailed
              ? '保存失败，修改仍未保存'
              : dirty
                ? '有未保存更改'
                : rule.enabled
                  ? '规则已启用'
                  : '规则已停用'}
          </div>
          <input
            className="rule-name-input"
            value={rule.name}
            onChange={(event) => patch({ name: event.target.value })}
            aria-label="规则名称"
          />
        </div>
        <div className="editor-actions">
          <div className="icon-action-group">
            <button
              className="icon-button"
              type="button"
              onClick={() => onMove(-1)}
              disabled={busy || dirty || !canMoveUp}
              title="上移规则"
            >
              <ArrowUp size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => onMove(1)}
              disabled={busy || dirty || !canMoveDown}
              title="下移规则"
            >
              <ArrowDown size={17} />
            </button>
            <button className="icon-button" type="button" onClick={onDuplicate} disabled={busy} title="复制规则">
              <Copy size={17} />
            </button>
            <button className="icon-button danger" type="button" onClick={onDelete} disabled={busy} title="删除规则">
              <Trash2 size={17} />
            </button>
          </div>
          <button
            className="save-button"
            data-failed={saveFailed || undefined}
            type="button"
            onClick={onSave}
            disabled={busy || (!dirty && !saveFailed)}
          >
            {busy
              ? <span className="button-spinner" />
              : saveFailed
                ? <CircleAlert size={17} />
                : dirty
                  ? <Save size={17} />
                  : <Check size={17} />}
            {busy
              ? '保存中'
              : saveFailed
                ? '保存失败，点击重试'
                : dirty
                  ? '保存更改'
                  : '已保存'}
          </button>
        </div>
      </header>

      <div className="editor-scroll">
        <section className="editor-section match-section">
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <h2>匹配请求</h2>
              <p>定义这条 Mock 规则何时接管网络请求</p>
            </div>
            <div className="section-toggle">
              <span>
                {dirty ? '保存后生效' : rule.enabled ? '已激活' : '未激活'}
              </span>
              <Toggle
                checked={rule.enabled}
                onChange={(enabled) => patch({ enabled })}
                disabled={busy}
                label="启用规则"
                size="small"
              />
            </div>
          </div>

          <div className="matcher-builder">
            <label className="field method-field">
              <span>Method</span>
              <select value={rule.method} onChange={(event) => patch({ method: event.target.value as MockRule['method'] })}>
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </label>
            <label className="field match-field">
              <span>匹配方式</span>
              <select value={rule.matchType} onChange={(event) => patch({ matchType: event.target.value as UrlMatchType })}>
                {URL_MATCH_TYPES.map((type) => (
                  <option key={type} value={type}>{matchLabels[type]}</option>
                ))}
              </select>
            </label>
            <label className="field url-field">
              <span>URL Pattern</span>
              <input
                value={rule.url}
                onChange={(event) => patch({ url: event.target.value })}
                placeholder="https://api.example.com/v1/users/*"
                spellCheck={false}
              />
            </label>
          </div>
          <div className="pattern-hint">
            <Braces size={14} />
            {rule.matchType === 'glob'
              ? '使用 * 匹配任意字符，例如 https://api.example.com/*'
              : rule.matchType === 'regex'
                ? '使用 JavaScript RegExp 语法，表达式最长 512 个字符'
                : rule.matchType === 'exact'
                  ? '请求 URL 必须与输入内容完全一致'
                  : 'URL 中出现该片段即视为命中'}
          </div>
        </section>

        <section className="editor-section response-section">
          <div className="section-heading">
            <span className="step-number">02</span>
            <div>
              <h2>构造响应</h2>
              <p>返回状态码、延迟、Headers 和 Body</p>
            </div>
          </div>

          <div className="response-meta-grid">
            <label className="field">
              <span>Status code</span>
              <input
                type="number"
                min={100}
                max={599}
                list="status-code-options"
                value={rule.statusCode}
                onChange={(event) => patch({ statusCode: Number(event.target.value) })}
              />
              <datalist id="status-code-options">
                <option value="200">OK</option>
                <option value="201">Created</option>
                <option value="204">No Content</option>
                <option value="400">Bad Request</option>
                <option value="401">Unauthorized</option>
                <option value="404">Not Found</option>
                <option value="429">Too Many Requests</option>
                <option value="500">Server Error</option>
                <option value="503">Unavailable</option>
              </datalist>
            </label>
            <label className="field input-with-unit">
              <span>Delay</span>
              <input
                type="number"
                min={0}
                max={30000}
                step={50}
                value={rule.delayMs}
                onChange={(event) => patch({ delayMs: Number(event.target.value) })}
              />
              <em>ms</em>
            </label>
            <div className="field body-type-field">
              <span>Body type</span>
              <div className="segmented-control">
                {BODY_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    data-active={rule.bodyType === type || undefined}
                    onClick={() => patch({ bodyType: type })}
                  >
                    {bodyLabels[type]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="subsection-heading">
            <div>
              <h3>Response Headers</h3>
              <span>{rule.headers.filter((header) => header.enabled && header.name).length} active</span>
            </div>
            <button type="button" className="text-button" onClick={() => patch({ headers: [...rule.headers, createHeader()] })}>
              <Plus size={15} /> 添加 Header
            </button>
          </div>

          <div className="headers-editor">
            <div className="headers-table-head">
              <span />
              <span>名称</span>
              <span>值</span>
              <span />
            </div>
            {rule.headers.map((header) => (
              <div className="header-row" key={header.id} data-disabled={!header.enabled || undefined}>
                <Toggle
                  checked={header.enabled}
                  onChange={(enabled) => updateHeader(header.id, { enabled })}
                  disabled={busy}
                  label={`${header.enabled ? '停用' : '启用'}响应头`}
                  size="small"
                />
                <input
                  value={header.name}
                  onChange={(event) => updateHeader(header.id, { name: event.target.value })}
                  placeholder="Header-Name"
                  spellCheck={false}
                />
                <input
                  value={header.value}
                  onChange={(event) => updateHeader(header.id, { value: event.target.value })}
                  placeholder="Header value"
                  spellCheck={false}
                />
                <button type="button" onClick={() => removeHeader(header.id)} aria-label="删除 Header">
                  <X size={15} />
                </button>
              </div>
            ))}
            {rule.headers.length === 0 && (
              <div className="headers-empty">没有自定义响应头，ModRes 会根据 Body type 补充 Content-Type</div>
            )}
          </div>

          <div className="body-editor-heading">
            <div>
              {rule.bodyType === 'json' ? <Braces size={16} /> : <FileText size={16} />}
              <strong>Response Body</strong>
              <span>{rule.body.length.toLocaleString()} chars</span>
            </div>
            {rule.bodyType === 'json' && (
              <button type="button" className="text-button" onClick={formatJson}>
                <Sparkles size={15} /> 格式化 JSON
              </button>
            )}
          </div>
          <div className="code-editor" data-language={rule.bodyType.toUpperCase()}>
            <div className="code-editor-chrome">
              <span className="window-dot red" />
              <span className="window-dot amber" />
              <span className="window-dot green" />
              <em>{bodyLabels[rule.bodyType]} response</em>
            </div>
            <textarea
              value={rule.body}
              onChange={(event) => patch({ body: event.target.value })}
              spellCheck={false}
              aria-label="响应正文"
            />
          </div>
        </section>
      </div>
    </section>
  );
}
