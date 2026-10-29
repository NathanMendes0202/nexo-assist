import type { TicketCardData } from '../../domain/conversation';
import { shortDate } from '../format';
import { STATUS_LABEL, STATUS_TONE } from '../labels';
import type { ConsoleDetailPayload } from './types';
import { hhmm } from './utils';

function OtherTicket({ t }: { t: TicketCardData }) {
  const resolved = t.status === 'resolvido' || t.status === 'encerrado';
  return (
    <li className="th-other">
      <strong>{t.title}</strong>
      <span>
        {t.id} · {resolved && t.resolvedAt ? `${STATUS_LABEL[t.status]} em ${shortDate(t.resolvedAt)}` : STATUS_LABEL[t.status]}
        {t.overdue ? ' · vencido' : ''}
      </span>
    </li>
  );
}

export function TicketHistory({ detail, onRetry }: { detail: ConsoleDetailPayload; onRetry: () => void }) {
  const { customer, tickets, conversation } = detail;
  const first = customer.name.split(' ')[0] ?? customer.name;
  const linked = tickets?.linked ?? null;

  return (
    <aside className="cs-tickets" aria-label={`Chamados de ${customer.name}`}>
      <header>
        <h2>Chamados da {first}</h2>
        {tickets ? (
          <p>
            {tickets.openCount} abertos · {tickets.closedCount} encerrados
          </p>
        ) : null}
      </header>

      {tickets === null ? (
        <div className="th-warn" role="alert">
          <strong>Sistema de chamados instável</strong>
          <span>Não consegui carregar os chamados agora. A conversa continua funcionando.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <h3>Desta conversa</h3>
          {linked ? (
            <article className="th-linked">
              <div className="th-linked-top">
                <b>{linked.id}</b>
                <span className={`state tone-${STATUS_TONE[linked.status]}`}>
                  <i />
                  {STATUS_LABEL[linked.status]}
                </span>
              </div>
              <strong>{linked.title}</strong>
              <span className="th-meta">
                {linked.category} · prioridade {linked.priority.toLowerCase()}
              </span>
              <span className="th-event">
                {conversation.status === 'com_analista' && conversation.assignedTo
                  ? `Assumido por ${conversation.assignedTo.name}`
                  : conversation.handoff
                    ? `Transferido para um analista · ${hhmm(conversation.handoff.at)}`
                    : 'Sem transferência'}
              </span>
              {linked.overdue ? <span className="late-tag">prazo vencido</span> : null}
            </article>
          ) : (
            <p className="th-empty">Nenhum chamado ligado a esta conversa ainda.</p>
          )}

          <h3>Outros chamados</h3>
          {tickets.others.length ? (
            <ul className="th-others">
              {tickets.others.map((t) => (
                <OtherTicket key={t.id} t={t} />
              ))}
            </ul>
          ) : (
            <p className="th-empty">{first} não tem outros chamados.</p>
          )}
        </>
      )}
    </aside>
  );
}
