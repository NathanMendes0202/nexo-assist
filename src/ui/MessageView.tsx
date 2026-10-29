import type { TraceStep, UiBlock } from '../domain/conversation';
import { DraftCard, HandoffNotice, QuickReplies, TicketCard, TicketSelector } from './Blocks';
import { AlertIcon, CheckIcon, ChevronRightIcon } from './icons';
import type { ClientMessage } from './types';

export function UserMessage({ message }: { message: ClientMessage }) {
  return (
    <div className="row-user">
      <div className="bubble-user">{message.content}</div>
    </div>
  );
}

function Chip({ step, onOpen }: { step: TraceStep; onOpen: (() => void) | null }) {
  const cls = `chip${step.status === 'aviso' ? ' chip-aviso' : step.status === 'erro' ? ' chip-erro' : ''}`;
  const icon = step.status === 'ok' ? <CheckIcon size={12} /> : <AlertIcon size={12} />;
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen} title={step.detail}>
      {icon}
      {step.label}
    </button>
  ) : (
    <span className={cls} title={step.detail}>
      {icon}
      {step.label}
    </span>
  );
}

export function AgentMessage({
  message,
  isLast,
  selected,
  onSend,
  onOpenTrace,
}: {
  message: ClientMessage;
  isLast: boolean;
  selected: boolean;
  onSend: (text: string) => void;
  onOpenTrace: () => void;
}) {
  const isAnalyst = message.role === 'analyst';
  const steps = (message.liveSteps ?? message.trace?.steps ?? []).filter((s) => s.visible);
  const canOpen = Boolean(message.trace);
  const blocks = message.blocks;

  const rich = blocks.some((b) => b.type === 'draft' || b.type === 'ticket_card' || b.type === 'ticket_cards');
  const quick = blocks.find((b): b is Extract<UiBlock, { type: 'quick_replies' }> => b.type === 'quick_replies');
  const hasDraft = blocks.some((b) => b.type === 'draft');

  return (
    <div className="row-agent">
      <div className="status-line">
        <span className={`who${isAnalyst ? ' who-analyst' : ''}`}>
          {isAnalyst ? (message.author ? `${message.author.name}${message.author.level ? ` · Suporte ${message.author.level}` : ''}` : 'Analista') : 'Nexo Assist'}
        </span>
        {steps.map((s, i) => (
          <Chip key={`${s.kind}-${i}`} step={s} onOpen={canOpen ? onOpenTrace : null} />
        ))}
        {message.streaming && steps.length === 0 ? <span className="chip">pensando…</span> : null}
        {canOpen ? (
          <button type="button" className="why" onClick={onOpenTrace} aria-pressed={selected}>
            Ver como decidi
            <ChevronRightIcon size={12} />
          </button>
        ) : null}
      </div>

      {message.content || message.streaming ? (
        <div className={`bubble-agent${isAnalyst ? ' bubble-analyst' : ''}`}>
          {message.content ? <p>{message.content}</p> : (
            <span className="typing" aria-label="Escrevendo">
              <i /><i /><i />
            </span>
          )}
          {!rich && quick ? <QuickReplies options={quick.options} active={isLast} onPick={onSend} /> : null}
        </div>
      ) : null}

      {blocks.map((b, i) => {
        switch (b.type) {
          case 'ticket_card':
            return <TicketCard key={i} ticket={b.ticket} lastNote={b.lastNote} />;
          case 'ticket_cards':
            return <TicketSelector key={i} tickets={b.tickets} selectable={b.selectable && isLast} onPick={onSend} />;
          case 'draft':
            return <DraftCard key={i} draft={b} actions={quick?.options ?? []} active={isLast} onPick={onSend} />;
          case 'handoff':
            return <HandoffNotice key={i} block={b} />;
          case 'quick_replies':
            return rich && !hasDraft ? <QuickReplies key={i} options={b.options} active={isLast} onPick={onSend} /> : null;
        }
      })}
    </div>
  );
}

export function SystemMessage({ message }: { message: ClientMessage }) {
  return <div className="system-note">{message.content}</div>;
}
