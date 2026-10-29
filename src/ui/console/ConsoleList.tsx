import { SearchIcon } from '../icons';
import type { ConsoleListItem, ConsoleListPayload, FilterKey } from './types';
import { applyFilter, avatarColors, listTime } from './utils';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'todas', label: 'Todas' },
  { key: 'para_voce', label: 'Para você' },
  { key: 'com_agent', label: 'Com o agent' },
  { key: 'minhas', label: 'Minhas' },
];

function Item({ item, selected, onSelect }: { item: ConsoleListItem; selected: boolean; onSelect: () => void }) {
  const { bg, fg } = avatarColors(item.customer.email);
  return (
    <li>
      <button type="button" className={`cs-item${selected ? ' is-selected' : ''}`} onClick={onSelect} aria-current={selected ? 'true' : undefined}>
        <span className="cs-avatar" style={{ background: bg, color: fg }} aria-hidden="true">
          {item.customer.initials}
        </span>
        <span className="cs-item-text">
          <span className="cs-item-top">
            <span className={`cs-name${item.needsAttention ? ' strong' : ''}`}>{item.customer.name}</span>
            <span className={`cs-time${item.needsAttention ? ' hot' : ''}`}>{listTime(item.at)}</span>
          </span>
          <span className="cs-item-bottom">
            <span className="cs-preview">{item.preview.text}</span>
            {item.needsAttention ? <span className="cs-unread" aria-label="Precisa de atendimento" /> : null}
          </span>
          <span className={`cs-tag tone-${item.tag.tone}`}>
            <i />
            {item.tag.label}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ConsoleList({
  payload,
  filter,
  onFilter,
  query,
  onQuery,
  selectedId,
  onSelect,
}: {
  payload: ConsoleListPayload;
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const items = applyFilter(payload.items, filter, query);
  const counts: Record<FilterKey, number | null> = {
    todas: null,
    para_voce: payload.counts.paraVoce,
    com_agent: payload.counts.comAgent,
    minhas: payload.counts.minhas,
  };
  return (
    <section className="cs-list" aria-label="Conversas">
      <header className="cs-list-head">
        <div className="cs-title-row">
          <h1>Conversas</h1>
          <span className="pill pill-success">
            <i />
            Disponível
          </span>
        </div>
        <label className="cs-search">
          <SearchIcon size={15} />
          <input type="search" placeholder="Pesquisar conversa ou chamado" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Pesquisar conversa ou chamado" />
        </label>
        <div className="cs-filters" role="tablist" aria-label="Filtros">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`cs-filter${filter === f.key ? ' on' : ''}`} onClick={() => onFilter(f.key)}>
              {f.label}
              {counts[f.key] !== null ? <b>{counts[f.key]}</b> : null}
            </button>
          ))}
        </div>
      </header>
      {items.length === 0 ? (
        <p className="cs-empty">{query ? 'Nenhuma conversa encontrada para essa busca.' : 'Nenhuma conversa neste filtro.'}</p>
      ) : (
        <ul className="cs-items">
          {items.map((i) => (
            <Item key={i.id} item={i} selected={i.id === selectedId} onSelect={() => onSelect(i.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
