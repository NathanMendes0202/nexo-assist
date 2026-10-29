import type { QuickReply, TicketCardData, UiBlock } from '../domain/conversation';
import { daysAgo, shortDate } from './format';
import { AFFECTED_LABEL, REASON_LABEL, STATUS_LABEL, STATUS_TONE } from './labels';

type Draft = Extract<UiBlock, { type: 'draft' }>;

function PriorityValue({ priority, note }: { priority: string; note?: string }) {
  return (
    <>
      <span className={`dot dot-${priority.toLowerCase()}`} />
      <span>{priority}</span>
      {note ? <span className="note">· {note}</span> : null}
    </>
  );
}

export function TicketCard({ ticket, lastNote }: { ticket: TicketCardData; lastNote: string | null }) {
  return (
    <article className="card" aria-label={`Chamado ${ticket.id}`}>
      <div className="card-body">
        <div className="eyebrow">
          <span>Chamado</span>
          <span className="sep" />
          <span className="mono">{ticket.id}</span>
          <span className="grow" />
          <span className={`state tone-${STATUS_TONE[ticket.status]}`}>
            <i />
            {STATUS_LABEL[ticket.status]}
          </span>
        </div>
        <h3>{ticket.title}</h3>
        <p className="desc">{ticket.description}</p>
        {lastNote && lastNote !== ticket.description ? <p className="desc">Última nota: {lastNote}</p> : null}
      </div>
      <dl className="fields">
        <div className="field-item">
          <dt>Categoria</dt>
          <dd>{ticket.category}</dd>
        </div>
        <div className="field-item">
          <dt>Prioridade</dt>
          <dd>
            <PriorityValue priority={ticket.priority} />
          </dd>
        </div>
        <div className="field-item">
          <dt>Prazo</dt>
          <dd>{ticket.dueLabel ?? 'Sem prazo em andamento'}</dd>
        </div>
        <div className="field-item">
          <dt>Última atualização</dt>
          <dd>
            <span className={ticket.overdue ? 'late' : undefined}>{daysAgo(ticket.updatedAt)}</span>
            {ticket.overdue ? <span className="note">· prazo vencido</span> : null}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function TicketSelector({
  tickets,
  selectable,
  onPick,
}: {
  tickets: TicketCardData[];
  selectable: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="selector" role={selectable ? 'radiogroup' : 'list'} aria-label="Seus chamados">
      {tickets.map((t) => (
        <button
          key={t.id}
          type="button"
          className="selector-row"
          disabled={!selectable}
          onClick={() => onPick(`${t.id} · ${t.title}`)}
          role={selectable ? 'radio' : 'listitem'}
          aria-checked={selectable ? false : undefined}
        >
          <span className="radio" />
          <span className="sel-num">{t.id}</span>
          <span className="sel-title">{t.title}</span>
          {t.overdue ? <span className="late-tag">vencido</span> : null}
          <span className={`state sel-status tone-${STATUS_TONE[t.status]}`}>
            <i />
            {STATUS_LABEL[t.status]}
          </span>
          <span className="sel-date">{shortDate(t.updatedAt)}</span>
        </button>
      ))}
    </div>
  );
}

export function DraftCard({
  draft,
  actions,
  active,
  onPick,
}: {
  draft: Draft;
  actions: QuickReply[];
  active: boolean;
  onPick: (text: string) => void;
}) {
  const isUpdate = draft.kind === 'update';
  return (
    <article className="card" aria-label={isUpdate ? 'Atualização para confirmar' : 'Rascunho de chamado'}>
      <div className="card-body">
        <div className="eyebrow">
          <span>{isUpdate ? (draft.reopen ? 'Reabertura' : 'Atualização') : 'Novo chamado'}</span>
          <span className="sep" />
          <span className={isUpdate ? 'mono' : undefined}>{isUpdate ? draft.ticketId : 'Rascunho'}</span>
          <span className="grow" />
          <span className={`state ${active ? 'tone-warning' : 'tone-muted'}`}>
            <i />
            {active ? 'Aguardando confirmação' : 'Rascunho anterior'}
          </span>
        </div>
        {draft.title ? <h3>{draft.title}</h3> : null}
        <p className="desc">{draft.description}</p>
      </div>
      {!isUpdate ? (
        <dl className="fields">
          <div className="field-item">
            <dt>Categoria</dt>
            <dd>{draft.category}</dd>
          </div>
          <div className="field-item">
            <dt>Prioridade</dt>
            <dd>{draft.priority ? <PriorityValue priority={draft.priority} /> : '—'}</dd>
          </div>
          <div className="field-item">
            <dt>Afetados</dt>
            <dd>{draft.affected ? AFFECTED_LABEL[draft.affected] : '—'}</dd>
          </div>
          <div className="field-item">
            <dt>Resposta até</dt>
            <dd>
              {draft.dueLabel}
              {draft.slaLabel ? <span className="note">· {draft.slaLabel}</span> : null}
            </dd>
          </div>
        </dl>
      ) : null}
      {!isUpdate && draft.priorityReason ? <p className="callout">Prioridade {draft.priority?.toLowerCase()}: {draft.priorityReason.charAt(0).toLowerCase() + draft.priorityReason.slice(1)}</p> : null}
      {active && actions.length > 0 ? (
        <div className="card-actions">
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              className={`btn btn-sm ${i === 0 ? 'btn-primary' : i === 1 ? 'btn-outline' : 'btn-ghost'}`}
              onClick={() => onPick(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function QuickReplies({
  options,
  active,
  onPick,
}: {
  options: QuickReply[];
  active: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="options" role="group" aria-label="Respostas rápidas">
      {options.map((o, i) => (
        <button key={o.label} type="button" className="option" disabled={!active} onClick={() => onPick(o.value)}>
          <span className="key">{i + 1}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HandoffNotice({ block }: { block: Extract<UiBlock, { type: 'handoff' }> }) {
  return (
    <div className="handoff" role="status">
      <strong>Conversa transferida para um analista</strong>
      <p>
        {REASON_LABEL[block.reason]} O assistente fica em silêncio até um analista assumir.
      </p>
      <details>
        <summary>Resumo enviado ao analista</summary>
        <p>{block.summary}</p>
      </details>
    </div>
  );
}

