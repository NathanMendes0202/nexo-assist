'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationStatus, TraceStep, UiBlock } from '../domain/conversation';
import { AppShell } from './AppShell';
import { DecisionPanel } from './DecisionPanel';
import { PlusIcon, SendIcon } from './icons';
import { AgentMessage, SystemMessage, UserMessage } from './MessageView';
import type { ClientMessage, ConversationPayload, StreamEvent } from './types';

const POLL_MS = 4000;

async function* readEvents(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) yield JSON.parse(line.slice(6)) as StreamEvent;
    }
  }
}

/** Valores que o funcionário pode escolher na última resposta (usados pelos atalhos 1, 2, 3…). */
function activeChoices(last: ClientMessage | undefined): string[] {
  if (!last || (last.role !== 'agent' && last.role !== 'analyst')) return [];
  const quick = last.blocks.find((b): b is Extract<UiBlock, { type: 'quick_replies' }> => b.type === 'quick_replies');
  if (quick) return quick.options.map((o) => o.value);
  const cards = last.blocks.find((b): b is Extract<UiBlock, { type: 'ticket_cards' }> => b.type === 'ticket_cards');
  return cards?.selectable ? cards.tickets.map((t) => `${t.id} · ${t.title}`) : [];
}

const STATUS_PILL: Record<ConversationStatus, { cls: string; label: string }> = {
  com_agent: { cls: 'pill-success', label: 'Assistente online' },
  aguardando_atendente: { cls: 'pill-warning', label: 'Aguardando atendente' },
  com_analista: { cls: 'pill-violet', label: 'Com um analista' },
  encerrada: { cls: 'pill-muted', label: 'Atendimento encerrado' },
};

export default function ChatApp({ initial, initialPanelFor = null }: { initial: ConversationPayload; initialPanelFor?: string | null }) {
  const [convId, setConvId] = useState(initial.conversation.id);
  const [status, setStatus] = useState<ConversationStatus>(initial.conversation.status);
  const [messages, setMessages] = useState<ClientMessage[]>(initial.messages);
  const [count, setCount] = useState(initial.userMessageCount);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelFor, setPanelFor] = useState<string | null>(initialPanelFor);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { limit, confidenceThreshold } = initial;
  const atLimit = count >= limit;
  const closed = status === 'encerrada';
  const waitingForPerson = status === 'aguardando_atendente' || status === 'com_analista';

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Enquanto a conversa está com uma pessoa, consulta novidades (respostas do analista, devolução ao agent).
  useEffect(() => {
    if (status === 'com_agent' || status === 'encerrada' || streaming) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${convId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ConversationPayload;
        setStatus(data.conversation.status);
        setMessages(data.messages);
        setCount(data.userMessageCount);
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, streaming, convId]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming || atLimit || closed) return;
      setError(null);
      setInput('');
      setStreaming(true);

      const stamp = Date.now();
      const userMsg: ClientMessage = { id: `u-${stamp}`, role: 'user', content: text, blocks: [], trace: null, createdAt: new Date().toISOString() };
      const draftId = `a-${stamp}`;
      const placeholder: ClientMessage = { id: draftId, role: 'agent', content: '', blocks: [], trace: null, liveSteps: [], streaming: true, createdAt: new Date().toISOString() };
      setMessages((m) => [...m, userMsg, placeholder]);

      const patch = (fn: (m: ClientMessage) => ClientMessage) =>
        setMessages((all) => all.map((m) => (m.id === draftId ? fn(m) : m)));
      const dropPlaceholder = () => setMessages((all) => all.filter((m) => m.id !== draftId));

      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Não consegui enviar a mensagem.');
        }

        for await (const ev of readEvents(res)) {
          switch (ev.type) {
            case 'step':
              patch((m) => ({ ...m, liveSteps: [...(m.liveSteps ?? []), ev.step as TraceStep] }));
              break;
            case 'text':
              patch((m) => ({ ...m, content: m.content + ev.delta }));
              break;
            case 'blocks':
              patch((m) => ({ ...m, blocks: ev.blocks }));
              break;
            case 'done':
              patch((m) => ({ ...m, id: ev.messageId, content: ev.text, blocks: ev.blocks, trace: ev.trace, liveSteps: undefined, streaming: false }));
              setStatus(ev.conversationStatus);
              setCount(ev.userMessageCount);
              break;
            case 'silenced':
              dropPlaceholder();
              setStatus(ev.conversationStatus);
              setCount((c) => c + 1);
              break;
            case 'limit_reached':
              dropPlaceholder();
              setMessages((all) => all.filter((m) => m.id !== userMsg.id));
              setCount(ev.limit);
              break;
            case 'error':
              patch((m) => ({ ...m, content: ev.message, streaming: false, liveSteps: undefined }));
              setError(ev.message);
              break;
          }
        }
      } catch (err) {
        dropPlaceholder();
        setMessages((all) => all.filter((m) => m.id !== userMsg.id));
        setInput(text);
        setError(err instanceof Error ? err.message : 'Não consegui enviar a mensagem.');
      } finally {
        setStreaming(false);
        inputRef.current?.focus();
      }
    },
    [convId, streaming, atLimit, closed],
  );

  async function newConversation() {
    if (streaming) return;
    const res = await fetch('/api/conversations', { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Não consegui começar uma nova conversa.');
      return;
    }
    const data = (await res.json()) as ConversationPayload;
    setConvId(data.conversation.id);
    setStatus(data.conversation.status);
    setMessages(data.messages);
    setCount(data.userMessageCount);
    setPanelFor(null);
    setError(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
      return;
    }
    // Atalho: com o campo vazio, 1–9 escolhem a opção correspondente da última resposta.
    if (input === '' && /^[1-9]$/.test(e.key)) {
      const choice = activeChoices(messages.at(-1))[Number(e.key) - 1];
      if (choice) {
        e.preventDefault();
        void send(choice);
      }
    }
  }

  const pill = STATUS_PILL[status];
  const panelMessage = messages.find((m) => m.id === panelFor) ?? null;
  const lastIndex = messages.length - 1;
  const placeholderText = closed
    ? 'Este atendimento foi encerrado.'
    : waitingForPerson
      ? 'Um analista vai assumir. Você ainda pode enviar mais detalhes.'
      : atLimit
        ? 'Limite de mensagens desta conversa atingido.'
        : 'Escreva para o Nexo…';

  return (
    <AppShell
      user={initial.user}
      crumb="Atendimento"
      topRight={
        <>
          <span className={`pill ${pill.cls}`}>
            <i />
            {pill.label}
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={newConversation} disabled={streaming || waitingForPerson} title={waitingForPerson ? 'Há um atendimento com um analista em andamento' : undefined}>
            <PlusIcon size={14} /> Nova conversa
          </button>
        </>
      }
    >
      <div className="columns">
        <section className="chat" aria-label="Conversa com o Nexo Assist">
          <div className="messages" aria-live="polite">
            <div className="thread">
              {messages.length === 0 ? (
                <div className="row-agent">
                  <div className="status-line"><span className="who">Nexo Assist</span></div>
                  <div className="bubble-agent">
                    <p>Oi, {initial.user.name.split(' ')[0]}! Conta o que está acontecendo com a TI. Eu consulto seus chamados, busco na central de ajuda e abro um chamado se precisar.</p>
                  </div>
                </div>
              ) : null}
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <UserMessage key={m.id} message={m} />
                ) : m.role === 'system' ? (
                  <SystemMessage key={m.id} message={m} />
                ) : (
                  <AgentMessage
                    key={m.id}
                    message={m}
                    isLast={i === lastIndex && !streaming && !waitingForPerson && !closed}
                    selected={panelFor === m.id}
                    onSend={(t) => void send(t)}
                    onOpenTrace={() => setPanelFor((cur) => (cur === m.id ? null : m.id))}
                  />
                ),
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="composer-area">
            <div className="composer-inner">
              <div className="composer">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  placeholder={placeholderText}
                  disabled={streaming || atLimit || closed}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={2000}
                  aria-label="Mensagem para o Nexo Assist"
                />
                <button type="button" className="send" onClick={() => void send(input)} disabled={streaming || atLimit || closed || !input.trim()}>
                  <SendIcon size={14} /> Enviar
                </button>
              </div>
              <div className="meta">
                <span>
                  {count}/{limit} mensagens nesta sessão
                </span>
                {error ? <span className="err" role="alert">{error}</span> : null}
                {atLimit && !error ? <span>Comece uma nova conversa para continuar.</span> : null}
              </div>
            </div>
          </div>
        </section>

        {panelFor ? <DecisionPanel message={panelMessage} threshold={confidenceThreshold} onClose={() => setPanelFor(null)} /> : null}
      </div>
    </AppShell>
  );
}
