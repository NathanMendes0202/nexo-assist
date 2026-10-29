import { describe, expect, it } from 'vitest';
import { buildDetail, buildList } from '../src/server/console';
import { openDatabase, migrate } from '../src/services/db';
import { ConversationBusyError, ConversationStateError } from '../src/services/conversations';
import { findEmployee } from '../src/services/seed';
import { TicketAccessDeniedError } from '../src/services/tickets/errors';
import { ANA, CARLA, NOW, decision, send, setup } from './helpers';

const RAFAEL = findEmployee('rafael.lima@nexo.com.br')!;
const JULIANA = findEmployee('juliana.costa@nexo.com.br')!;
const ana = findEmployee(ANA)!;

/** Conversa da Ana já transferida para um analista por causa do INC-20311 vencido. */
async function transferred() {
  const env = setup();
  const conv = env.conversations.create(ANA);
  env.llm.push(decision({ intent: 'falar_com_analista', ticketRef: 'INC-20311', caseSummary: 'Notebook lento; INC-20311 vencido.' }));
  await send(env.agent, conv.id, ANA, 'quero falar com um analista sobre o notebook');
  return { ...env, conv };
}

describe('console: lista', () => {
  it('conversa transferida aparece em "Para você", com tag, e vem primeiro', async () => {
    const { conversations, conv } = await transferred();
    const other = conversations.create(CARLA); // só com o agent
    const list = buildList(conversations, RAFAEL);
    expect(list.items[0]?.id).toBe(conv.id);
    expect(list.items[0]?.tag.label).toContain('Transferida');
    expect(list.items[0]?.tag.label).toContain('INC-20311');
    expect(list.items.find((i) => i.id === other.id)?.tag.label).toBe('Agent atendendo');
    expect(list.counts).toEqual({ paraVoce: 1, comAgent: 1, minhas: 0 });
  });

  it('baixa confiança mostra o percentual na tag ("Agent pediu ajuda · confiança 41%")', async () => {
    const env = setup();
    const conv = env.conversations.create(ANA);
    env.llm.push(decision({ intent: 'abrir_chamado', confidence: 0.41 }));
    await send(env.agent, conv.id, ANA, 'tá estranho aí');
    const item = buildList(env.conversations, RAFAEL).items[0]!;
    expect(item.tag.label).toBe('Agent pediu ajuda · confiança 41%');
  });
});

describe('console: assumir, devolver, encerrar', () => {
  it('assumir pausa o agent e responde como analista; o chamado passa a em andamento', async () => {
    const { conversations, tickets, agent, conv } = await transferred();
    const assumed = conversations.assume(conv.id, RAFAEL.email);
    expect(assumed.status).toBe('com_analista');
    expect(assumed.assignedAnalyst).toBe(RAFAEL.email);
    await tickets.analystTake(RAFAEL, 'INC-20311');
    expect((await tickets.getById(ANA, 'INC-20311')).status).toBe('em_andamento');

    conversations.addMessage(conv.id, 'analyst', 'Oi, Ana! Vou verificar o driver.', { authorEmail: RAFAEL.email });
    const r = await send(agent, conv.id, ANA, 'pode sim');
    expect(r.events[0]?.type).toBe('silenced'); // agent pausado enquanto o analista atende
    expect(conversations.messages(conv.id).at(-1)?.role).toBe('user');
  });

  it('dois analistas não assumem a mesma conversa', async () => {
    const { conversations, conv } = await transferred();
    conversations.assume(conv.id, RAFAEL.email);
    expect(() => conversations.assume(conv.id, JULIANA.email)).toThrow(ConversationStateError);
    expect(conversations.get(conv.id)?.assignedAnalyst).toBe(RAFAEL.email);
  });

  it('devolver ao agent: ele volta a responder com o histórico, inclusive as falas do analista', async () => {
    const { conversations, agent, llm, conv } = await transferred();
    conversations.assume(conv.id, RAFAEL.email);
    conversations.addMessage(conv.id, 'analyst', 'Atualizei o driver de vídeo.', { authorEmail: RAFAEL.email });
    conversations.returnToAgent(conv.id, RAFAEL.email);

    llm.push(decision({ intent: 'saudacao' }));
    const r = await send(agent, conv.id, ANA, 'obrigada, e agora?');
    expect(r.done?.conversationStatus).toBe('com_agent');
    expect(llm.prompts.at(-1)).toContain('Analista: Atualizei o driver de vídeo.');
  });

  it('só quem assumiu devolve (depois de assumir) ou encerra', async () => {
    const { conversations, conv } = await transferred();
    conversations.assume(conv.id, RAFAEL.email);
    expect(() => conversations.close(conv.id, JULIANA.email)).toThrow(ConversationStateError);
    expect(() => conversations.returnToAgent(conv.id, JULIANA.email)).toThrow(ConversationStateError);
    const closed = conversations.close(conv.id, RAFAEL.email);
    expect(closed.status).toBe('encerrada');
    expect(closed.closedBy).toBe(RAFAEL.email);
  });

  it('conversa encerrada fica silenciosa e não pode ser reassumida', async () => {
    const { conversations, agent, conv } = await transferred();
    conversations.assume(conv.id, RAFAEL.email);
    conversations.close(conv.id, RAFAEL.email);
    expect(() => conversations.assume(conv.id, JULIANA.email)).toThrow(ConversationStateError);
    const r = await send(agent, conv.id, ANA, 'oi?');
    expect(r.events[0]?.type).toBe('silenced');
  });

  it('o estado do atendimento sobrevive a reinício (novo store sobre o mesmo banco)', async () => {
    const { db, conversations, conv } = await transferred();
    conversations.assume(conv.id, RAFAEL.email);
    const { ConversationStore } = await import('../src/services/conversations');
    const again = new ConversationStore(db).get(conv.id)!;
    expect(again.status).toBe('com_analista');
    expect(again.assignedAnalyst).toBe(RAFAEL.email);
    expect(again.ticketId).toBe('INC-20311');
  });
});

describe('console: detalhe e permissões', () => {
  it('detalhe traz o chamado ligado, os outros e o que o analista pode fazer', async () => {
    const { conversations, tickets, conv } = await transferred();
    const d = await buildDetail({ conversations, tickets, confidenceThreshold: 0.6, now: NOW }, RAFAEL, conversations.get(conv.id)!);
    expect(d.tickets?.linked?.id).toBe('INC-20311');
    expect(d.tickets?.others.map((t) => t.id).sort()).toEqual(['INC-19410', 'INC-19877', 'INC-20298', 'REQ-10442']);
    expect(d.tickets?.openCount).toBe(3);
    expect(d.tickets?.closedCount).toBe(2);
    expect(d.permissions).toEqual({ canAssume: true, canReturn: true, canClose: false, canReply: false });

    conversations.assume(conv.id, RAFAEL.email);
    const mine = await buildDetail({ conversations, tickets, confidenceThreshold: 0.6, now: NOW }, RAFAEL, conversations.get(conv.id)!);
    expect(mine.permissions).toEqual({ canAssume: false, canReturn: true, canClose: true, canReply: true });
    const theirs = await buildDetail({ conversations, tickets, confidenceThreshold: 0.6, now: NOW }, JULIANA, conversations.get(conv.id)!);
    expect(theirs.permissions).toEqual({ canAssume: false, canReturn: false, canClose: false, canReply: false });
  });

  it('legado fora do ar: o detalhe sai sem o painel de chamados, mas sai', async () => {
    const env = setup({ ticketOpts: { unavailableRate: 1 } });
    const conv = env.conversations.create(ANA);
    const d = await buildDetail({ conversations: env.conversations, tickets: env.tickets, confidenceThreshold: 0.6 }, RAFAEL, conv);
    expect(d.tickets).toBeNull();
    expect(d.messages).toEqual([]);
  });

  it('funcionário não consegue usar a visão de analista nos chamados', async () => {
    const { tickets } = setup();
    await expect(tickets.listForAnalyst(ana, ANA)).rejects.toBeInstanceOf(TicketAccessDeniedError);
    await expect(tickets.analystTake(ana, 'INC-20311')).rejects.toBeInstanceOf(TicketAccessDeniedError);
  });
});

describe('nova conversa do funcionário', () => {
  it('encerra a anterior que estava só com o agent', () => {
    const { conversations } = setup();
    const first = conversations.create(ANA);
    const second = conversations.startNew(ANA);
    expect(conversations.get(first.id)?.status).toBe('encerrada');
    expect(second.status).toBe('com_agent');
  });

  it('recusa enquanto há atendimento humano em andamento', async () => {
    const { conversations } = await transferred();
    expect(() => conversations.startNew(ANA)).toThrow(ConversationBusyError);
  });
});

describe('migração do banco', () => {
  it('adiciona as colunas novas em um banco criado nas etapas anteriores', () => {
    const db = openDatabase(':memory:');
    db.exec('ALTER TABLE messages DROP COLUMN author_email');
    db.exec('ALTER TABLE conversations DROP COLUMN ticket_id');
    migrate(db);
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols('messages')).toContain('author_email');
    expect(cols('conversations')).toContain('ticket_id');
  });
});
