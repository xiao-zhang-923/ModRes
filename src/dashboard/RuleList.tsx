import { Braces, CircleOff, Plus, Search, Timer } from 'lucide-react';
import { Toggle } from '../components/Toggle';
import type { MockRule } from '../shared/types';

interface RuleListProps {
  rules: MockRule[];
  selectedId: string | null;
  search: string;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

function searchable(rule: MockRule): string {
  return `${rule.name} ${rule.url} ${rule.method} ${rule.statusCode}`.toLowerCase();
}

export function RuleList({
  rules,
  selectedId,
  search,
  busy,
  onSearchChange,
  onSelect,
  onCreate,
}: RuleListProps) {
  const query = search.trim().toLowerCase();
  const filteredRules = query ? rules.filter((rule) => searchable(rule).includes(query)) : rules;

  return (
    <aside className="rules-panel">
      <header className="rules-panel-header">
        <div>
          <span className="eyebrow">RULE QUEUE</span>
          <h2>响应规则</h2>
        </div>
        <span className="count-badge">{rules.length}</span>
      </header>

      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索名称、URL、Method"
          aria-label="搜索规则"
        />
        <kbd>⌘ K</kbd>
      </label>

      <button className="new-rule-button" type="button" onClick={onCreate} disabled={busy}>
        <Plus size={17} />
        新建 Mock 规则
      </button>

      <div className="rule-list" role="listbox" aria-label="Mock 规则列表">
        {filteredRules.map((rule, index) => (
          <article
            key={rule.id}
            className="rule-card"
            data-selected={rule.id === selectedId || undefined}
            data-disabled={!rule.enabled || undefined}
            role="option"
            aria-selected={rule.id === selectedId}
            aria-disabled={busy || undefined}
            tabIndex={busy ? -1 : 0}
            onClick={() => {
              if (!busy) onSelect(rule.id);
            }}
            onKeyDown={(event) => {
              if (!busy && (event.key === 'Enter' || event.key === ' ')) onSelect(rule.id);
            }}
          >
            <div className="rule-card-topline">
              <span className="rule-order">{String(index + 1).padStart(2, '0')}</span>
              <span className="method-badge" data-method={rule.method}>
                {rule.method}
              </span>
              <span className="status-code">
                <i data-status={Math.floor(rule.statusCode / 100)} />
                {rule.statusCode}
              </span>
              <span
                className="rule-toggle"
                title="请在右侧启用规则并保存"
                onClick={(event) => event.stopPropagation()}
              >
                <Toggle
                  checked={rule.enabled}
                  readOnly
                  label={`${rule.name} 的已保存状态：${rule.enabled ? '已启用' : '已停用'}`}
                  size="small"
                />
              </span>
            </div>
            <h3>{rule.name}</h3>
            <p title={rule.url}>{rule.url}</p>
            <footer>
              <span>
                <Braces size={13} /> {rule.matchType}
              </span>
              {rule.delayMs > 0 && (
                <span>
                  <Timer size={13} /> {rule.delayMs}ms
                </span>
              )}
            </footer>
          </article>
        ))}

        {filteredRules.length === 0 && (
          <div className="rule-list-empty">
            <CircleOff size={28} strokeWidth={1.5} />
            <strong>{rules.length ? '没有匹配的规则' : '还没有规则'}</strong>
            <span>{rules.length ? '换个关键词试试' : '创建第一条响应 Mock'}</span>
          </div>
        )}
      </div>

      <footer className="rules-panel-footnote">
        从上到下匹配，首条命中的规则生效
      </footer>
    </aside>
  );
}
