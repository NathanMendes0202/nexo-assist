'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DecisionPanel } from '../DecisionPanel';
import { ChatIcon, LogoutIcon, NexoMark } from '../icons';
import { ConsoleList } from './ConsoleList';
import { ConsoleThread } from './ConsoleThread';
import { TicketHistory } from './TicketHistory';
import type { ConsoleDetailPayload, ConsoleListPayload, FilterKey } from './types';

const LIST_POLL_MS = 5000;
const DETAIL_POLL_MS = 3000;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Sessão expirada.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? 'Não foi possível concluir a ação.');
  return body as T;
}

export default function ConsoleApp({ initial }: { initial: ConsoleListPayload }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [filter, setFilter] = useState<FilterKey>('todas');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsoleDetailPayload | null>(null);
  const [traceFor, setTraceFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setList(await api<ConsoleListPayload>('/api/console/conversations'));
    } catch {
      /* mantém a lista atual; tenta de novo no próximo ciclo */
    }
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<ConsoleDetailPayload>(`/api/console/conversations/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui atualizar a conversa.');
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => void refreshList(), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId || busy) return;
    const t = setInterval(() => void refreshDetail(selectedId), DETAIL_POLL_MS);
    return () => clearInterval(t);
  }, [selectedId, busy, refreshDetail]);

  function select(id: string) {
    setSelectedId(id);
    setDetail(null);
    setTraceFor(null);
    setError(null);
    void refreshDetail(id);
  }

  async function act(path: string, body?: unknown): Promise<boolean> {
    if (!selectedId) return false;
    setBusy(true);
    setError(null);
    try {
      const next = await api<ConsoleDetailPayload>(`/api/console/conversations/${selectedId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      setDetail(next);
      void refreshList();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
      void refreshDetail(selectedId); // o estado pode ter mudado (ex.: outro analista assumiu)
      void refreshList();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const traceMessage = detail?.messages.find((m) => m.id === traceFor) ?? null;

  return (
    <div className="cs">
      <nav className="cs-rail" aria-label="Principal">
        <NexoMark size={22} tone="blue" />
        <span className="cs-rail-btn on" aria-current="page" title="Conversas">
          <ChatIcon size={19} />
          {list.counts.paraVoce > 0 ? <b>{list.counts.paraVoce}</b> : null}
        </span>
        <span className="cs-rail-spacer" />
        <span className="cs-me" title={`${list.analyst.name} · Suporte ${list.analyst.level ?? ''}`}>
          {list.analyst.initials}
          <i />
        </span>
        <button type="button" className="icon-btn" onClick={logout} aria-label="Sair" title="Sair">
          <LogoutIcon size={17} />
        </button>
      </nav>

      <ConsoleList payload={list} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} selectedId={selectedId} onSelect={select} />

      {detail ? (
        <ConsoleThread
          detail={detail}
          busy={busy}
          error={error}
          traceMessageId={traceFor}
          onAssume={() => void act('assume')}
          onReturn={() => void act('return')}
          onClose={() => {
            if (window.confirm('Encerrar este atendimento? O funcionário não poderá mais responder nesta conversa.')) void act('close');
          }}
          onSend={(text) => act('messages', { text })}
          onTrace={(id) => setTraceFor((cur) => (cur === id ? null : id))}
        />
      ) : (
        <section className="cs-conv cs-blank" aria-live="polite">
          <p>{selectedId ? (error ?? 'Carregando conversa…') : 'Escolha uma conversa na lista para acompanhar ou atender.'}</p>
        </section>
      )}

      {detail ? (
        traceFor ? (
          <DecisionPanel message={traceMessage} threshold={detail.confidenceThreshold} onClose={() => setTraceFor(null)} />
        ) : (
          <TicketHistory detail={detail} onRetry={() => selectedId && void refreshDetail(selectedId)} />
        )
      ) : (
        <aside className="cs-tickets" aria-hidden="true" />
      )}
    </div>
  );
}
