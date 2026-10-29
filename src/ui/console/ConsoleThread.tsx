import { useEffect, useRef, useState } from 'react';
import { HeadsetIcon, PauseIcon, ReturnIcon, SendIcon } from '../icons';
import { ANALYST_REASON_LABEL } from '../labels';
import type { ClientMessage } from '../types';
import type { ConsoleDetailPayload } from './types';
import { avatarColors, dayLabel, hhmm } from './utils';

function Bubble({ m, onTrace, active }: { m: ClientMessage; onTrace: () => void; active: boolean }) {
  if (m.role === 'system') {
    return (
      <div className="cm-system">
        <span />
        <em>
          {m.content} · {hhmm(m.createdAt)}
        </em>
        <span />
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="cm cm-client">
        <div className="cm-bubble">
          <p>{m.content}</p>
          <time>{hhmm(m.createdAt)}</time>
        </div>
      </div>
    );
  }
  const isAgent = m.role === 'agent';
  return (
    <div className={`cm ${isAgent ? 'cm-agent' : 'cm-analyst'}`}>
      <div className="cm-sender">
        <b>{isAgent ? 'Nexo Assist' : (m.author?.name ?? 'Analista')}</b>
        <span className="cm-tag">{isAgent ? 'IA' : m.author?.level ? `Suporte ${m.author.level}` : 'Analista'}</span>
        {isAgent && m.trace ? (
          <button type="button" className="cm-why" onClick={onTrace} aria-pressed={active}>
            Ver decisão
          </button>
        ) : null}
      </div>
      <div className="cm-bubble">
        <p>{m.content}</p>
        <time>{hhmm(m.createdAt)}</time>
      </div>
    </div>
  );
}

export function ConsoleThread({
  detail,
  busy,
  error,
  traceMessageId,
  onAssume,
  onReturn,
  onClose,
  onSend,
  onTrace,
}: {
  detail: ConsoleDetailPayload;
  busy: boolean;
  error: string | null;
  traceMessageId: string | null;
  onAssume: () => void;
  onReturn: () => void;
  onClose: () => void;
  onSend: (text: string) => Promise<boolean>;
  onTrace: (messageId: string) => void;
}) {
  const { conversation, customer, messages, permissions } = detail;
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { bg, fg } = avatarColors(customer.email);
  const first = customer.name.split(' ')[0] ?? customer.name;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation.id]);

  const lastAgentWithTrace = [...messages].reverse().find((m) => m.role === 'agent' && m.trace);

  const mode = {
    aguardando_atendente: { cls: 'pill-warning', label: 'Aguardando atendente' },
    com_analista: { cls: 'pill-violet', label: conversation.assignedTo?.isMe ? 'Você está atendendo' : `Com ${conversation.assignedTo?.name.split(' ')[0] ?? 'analista'}` },
    com_agent: { cls: 'pill-success', label: 'Agent atendendo' },
    encerrada: { cls: 'pill-muted', label: 'Encerrada' },
  }[conversation.status];

  async function submit() {
    const value = text.trim();
    if (!value || busy || !permissions.canReply) return;
    if (await onSend(value)) setText('');
  }

  // separadores de dia
  let lastDay = '';
  return (
    <section className="cs-conv" aria-label={`Conversa com ${customer.name}`}>
      <header className="cs-conv-head">
        <span className="cs-avatar lg" style={{ background: bg, color: fg }} aria-hidden="true">
          {customer.initials}
        </span>
        <div className="cs-who">
          <strong>{customer.name}</strong>
          <span>
            {customer.department}
            {conversation.ticketId ? ` · ${conversation.ticketId}` : ''}
          </span>
        </div>
        <span className={`pill ${mode.cls}`}>
          <i />
          {mode.label}
        </span>
      </header>

      <div className="cs-messages">
        {conversation.handoff && (conversation.status === 'aguardando_atendente' || conversation.status === 'com_analista') ? (
          <aside className="cs-summary" aria-label="Resumo do agent">
            <div className="cs-summary-top">
              <strong>Resumo do agent</strong>
              <span>{hhmm(conversation.handoff.at)}</span>
            </div>
            <p className="cs-reason">{ANALYST_REASON_LABEL[conversation.handoff.reason]}</p>
            <p>{conversation.handoff.summary}</p>
            {lastAgentWithTrace ? (
              <button type="button" className="link-btn" onClick={() => onTrace(lastAgentWithTrace.id)}>
                Ver como o agent decidiu
              </button>
            ) : null}
          </aside>
        ) : null}

        {messages.map((m) => {
          const label = dayLabel(m.createdAt);
          const showDay = label !== lastDay;
          lastDay = label;
          return (
            <div key={m.id}>
              {showDay ? (
                <div className="cm-day">
                  <span>{label}</span>
                </div>
              ) : null}
              <Bubble m={m} onTrace={() => onTrace(m.id)} active={traceMessageId === m.id} />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <footer className="cs-bottom">
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        {conversation.status === 'aguardando_atendente' ? (
          <div className="cs-takeover">
            <span className="cs-take-ico warn">
              <PauseIcon size={17} />
            </span>
            <div className="cs-take-text">
              <strong>{first} espera um atendente</strong>
              <span>Agent pausado desde {hhmm(conversation.handoff?.at ?? messages.at(-1)?.createdAt ?? new Date().toISOString())}</span>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={onReturn} disabled={busy}>
              <ReturnIcon size={15} /> Devolver ao agent
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onAssume} disabled={busy}>
              <HeadsetIcon size={15} /> Assumir atendimento
            </button>
          </div>
        ) : null}

        {conversation.status === 'com_analista' && permissions.canClose ? (
          <div className="cs-takeover">
            <span className="cs-take-ico violet">
              <HeadsetIcon size={17} />
            </span>
            <div className="cs-take-text">
              <strong>Você está atendendo {first}</strong>
              <span>Agent pausado enquanto você atende</span>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={onReturn} disabled={busy}>
              <ReturnIcon size={15} /> Devolver ao agent
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={busy}>
              Encerrar atendimento
            </button>
          </div>
        ) : null}

        {conversation.status === 'com_analista' && !permissions.canClose ? (
          <p className="cs-note">Esta conversa está com {conversation.assignedTo?.name ?? 'outro analista'}. Você acompanha, mas não pode responder.</p>
        ) : null}
        {conversation.status === 'com_agent' ? <p className="cs-note">O agent está atendendo. Você acompanha a conversa em tempo real.</p> : null}
        {conversation.status === 'encerrada' ? <p className="cs-note">Atendimento encerrado.</p> : null}

        <div className={`cs-composer${permissions.canReply ? '' : ' locked'}`}>
          <textarea
            rows={1}
            value={text}
            disabled={!permissions.canReply || busy}
            placeholder={permissions.canReply ? `Responder a ${first}…` : conversation.status === 'aguardando_atendente' ? 'Assuma o atendimento para responder' : 'Somente leitura'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            maxLength={2000}
            aria-label="Resposta ao funcionário"
          />
          {permissions.canReply ? (
            <button type="button" className="send" onClick={() => void submit()} disabled={busy || !text.trim()}>
              <SendIcon size={14} /> Enviar
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
