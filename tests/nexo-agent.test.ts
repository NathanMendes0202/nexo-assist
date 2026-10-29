import { describe, expect, it } from 'vitest';
import { ANA, CARLA, decision, fullDraft, send, setup } from './helpers';

describe('dúvida: resolve sem abrir chamado', () => {
  it('busca na central e não cria nada', async () => {
    const { agent, llm, conversations, tickets } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'duvida', searchQuery: 'vpn erro 809' }));
    const { done, stepKinds } = await send(agent, conv.id, ANA, 'minha VPN dá erro 809');
    expect(stepKinds).toContain('buscou_central');
    expect(done?.trace.outcome).toBe('duvida_respondida');
    expect(done?.text).toBe('resposta de teste');
    expect(await tickets.listByRequester(ANA)).toHaveLength(5);
  });
});

describe('abrir chamado: pergunta, rascunho, confirmação', () => {
  it('pergunta o que falta, propõe rascunho e só cria depois do "sim"', async () => {
    const { agent, llm, conversations, tickets } = setup();
    const conv = conversations.create(ANA);

    llm.push(decision({ intent: 'abrir_chamado', draft: { ...fullDraft, affected: null, blocksWork: null } }));
    const t1 = await send(agent, conv.id, ANA, 'a VPN não conecta no notebook');
    expect(t1.done?.trace.outcome).toBe('pedindo_informacao');
    expect(await tickets.listByRequester(ANA)).toHaveLength(5);

    llm.push(decision({ intent: 'abrir_chamado', draft: { ...fullDraft, blocksWork: null } }));
    const t2 = await send(agent, conv.id, ANA, 'só eu');
    expect(t2.done?.trace.outcome).toBe('pedindo_informacao'); // ainda falta o impacto

    llm.push(decision({ intent: 'abrir_chamado', draft: fullDraft }));
    const t3 = await send(agent, conv.id, ANA, 'não consigo trabalhar');
    expect(t3.done?.trace.outcome).toBe('rascunho_proposto');
    expect(t3.stepKinds).toContain('classificou_prioridade');
    expect(await tickets.listByRequester(ANA)).toHaveLength(5); // nada criado sem confirmação

    llm.push(decision({ intent: 'confirmar', confirmation: 'sim' }));
    const t4 = await send(agent, conv.id, ANA, 'sim, pode abrir');
    expect(t4.done?.trace.outcome).toBe('chamado_criado');
    expect(t4.stepKinds).toContain('criou_chamado');
    const all = await tickets.listByRequester(ANA);
    expect(all).toHaveLength(6);
    const created = all.find((t) => t.id === 'INC-20517')!;
    expect(created.priority).toBe('Alta'); // prioridade calculada pelo código, não pelo modelo
    expect(conversations.get(conv.id)?.pending).toBeNull();
  });

  it('"sim" sem rascunho pendente não cria nada', async () => {
    const { agent, llm, conversations, tickets } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'confirmar', confirmation: 'sim' }));
    const r = await send(agent, conv.id, ANA, 'sim');
    expect(r.done?.trace.outcome).toBe('nada_a_confirmar');
    expect(r.done?.trace.overrides).toHaveLength(1);
    expect(await tickets.listByRequester(ANA)).toHaveLength(5);
  });

  it('caso crítico: cria e transfere para um analista', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(ANA);
    const critical = { ...fullDraft, affected: 'equipe' as const, workStopped: true };
    llm.push(decision({ intent: 'abrir_chamado', draft: critical }));
    await send(agent, conv.id, ANA, 'o sistema da equipe toda caiu');
    llm.push(decision({ intent: 'confirmar', confirmation: 'sim' }));
    const r = await send(agent, conv.id, ANA, 'sim');
    expect(r.done?.conversationStatus).toBe('aguardando_atendente');
    expect(r.stepKinds).toContain('transferiu');
  });
});

describe('sem duplicidade', () => {
  it('atualiza o chamado existente em vez de abrir outro', async () => {
    const { agent, llm, conversations, tickets } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'abrir_chamado', duplicateOf: 'INC-20311', draft: { ...fullDraft, category: 'Hardware' }, updateNote: 'Continua lento hoje.' }));
    const t1 = await send(agent, conv.id, ANA, 'meu notebook continua lento');
    expect(t1.done?.trace.outcome).toBe('atualizacao_proposta');

    llm.push(decision({ intent: 'confirmar', confirmation: 'sim' }));
    const t2 = await send(agent, conv.id, ANA, 'sim');
    expect(t2.done?.trace.outcome).toBe('chamado_atualizado');
    expect(await tickets.listByRequester(ANA)).toHaveLength(5); // não duplicou
  });

  it('resolvido há até 7 dias é reaberto', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(CARLA);
    llm.push(decision({ intent: 'atualizar_chamado', ticketRef: 'INC-20150', updateNote: 'Bloqueou de novo.' }));
    await send(agent, conv.id, CARLA, 'a senha do SAP bloqueou de novo');
    llm.push(decision({ intent: 'confirmar', confirmation: 'sim' }));
    const r = await send(agent, conv.id, CARLA, 'sim');
    expect(r.done?.trace.outcome).toBe('chamado_reaberto');
  });
});

describe('consulta e privacidade', () => {
  it('chamado vencido oferece analista', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'consultar_chamado', ticketRef: 'INC-20311' }));
    const r = await send(agent, conv.id, ANA, 'como está meu chamado do notebook?');
    expect(r.done?.trace.outcome).toBe('chamado_detalhado');
    expect(r.stepKinds).toContain('consultou_prazo');
    const quickBlock = r.done?.blocks.find((b) => b.type === 'quick_replies');
    expect(JSON.stringify(quickBlock)).toContain('Falar com um analista');
  });

  it('número de chamado de outra pessoa é tratado como inexistente', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'consultar_chamado', ticketRef: 'INC-20150' })); // é da Carla
    const r = await send(agent, conv.id, ANA, 'como está o INC-20150?');
    expect(r.done?.trace.outcome).toBe('chamado_nao_encontrado');
    expect(JSON.stringify(r.done)).not.toContain('SAP');
  });

  it('o prompt do decisor só contém chamados do próprio funcionário', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'saudacao' }));
    await send(agent, conv.id, ANA, 'oi');
    expect(llm.prompts[0]).toContain('INC-20311');
    expect(llm.prompts[0]).not.toContain('INC-20150');
  });

  it('conversa de outro funcionário não é acessível', async () => {
    const { agent, conversations } = setup();
    const conv = conversations.create(ANA);
    await expect(send(agent, conv.id, CARLA, 'oi')).rejects.toThrow();
  });
});

describe('transferência', () => {
  it('baixa confiança transfere e o agent para de responder', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'abrir_chamado', confidence: 0.41 }));
    const r = await send(agent, conv.id, ANA, 'tá estranho aí');
    expect(r.done?.trace.outcome).toBe('transferido');
    expect(r.done?.conversationStatus).toBe('aguardando_atendente');
    expect(r.done?.trace.overrides[0]).toContain('41%');

    const after = await send(agent, conv.id, ANA, 'alguém aí?');
    expect(after.events[0]?.type).toBe('silenced');
    expect(conversations.messages(conv.id).at(-1)?.role).toBe('user'); // registrou a mensagem, sem resposta
  });

  it('o estado sobrevive a um "reinício" (nova instância sobre o mesmo banco)', async () => {
    const { agent, llm, conversations, db } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'falar_com_analista', caseSummary: 'Quer falar com uma pessoa.' }));
    await send(agent, conv.id, ANA, 'quero falar com alguém');
    const reopened = new (await import('../src/services/conversations')).ConversationStore(db);
    expect(reopened.get(conv.id)?.status).toBe('aguardando_atendente');
    expect(reopened.get(conv.id)?.handoff?.summary).toBe('Quer falar com uma pessoa.');
  });
});

describe('escopo, limite e resiliência', () => {
  it('assunto fora de TI não aciona ferramentas', async () => {
    const { agent, llm, conversations } = setup();
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'fora_de_escopo', confidence: 0.3 })); // mesmo com confiança baixa: só redireciona
    const r = await send(agent, conv.id, ANA, 'quando cai meu 13º?');
    expect(r.done?.trace.outcome).toBe('fora_de_escopo');
    expect(r.done?.conversationStatus).toBe('com_agent');
  });

  it('respeita o limite de mensagens por sessão', async () => {
    const { agent, llm, conversations } = setup({ config: { messageLimit: 2 } });
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'saudacao' }), decision({ intent: 'saudacao' }));
    await send(agent, conv.id, ANA, 'oi');
    await send(agent, conv.id, ANA, 'oi de novo');
    const r = await send(agent, conv.id, ANA, 'terceira');
    expect(r.events[0]).toEqual({ type: 'limit_reached', limit: 2 });
  });

  it('legado instável: tenta de novo e o retry aparece na trilha', async () => {
    let calls = 0;
    const { agent, llm, conversations } = setup({ ticketOpts: { unavailableRate: 0.5, random: () => (calls++ < 2 ? 0 : 1) } });
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'saudacao' }));
    const r = await send(agent, conv.id, ANA, 'oi');
    expect(r.stepKinds.filter((k) => k === 'tentou_novamente')).toHaveLength(2);
  });

  it('legado fora do ar: ainda responde dúvida e avisa nas consultas', async () => {
    const { agent, llm, conversations } = setup({ ticketOpts: { unavailableRate: 1 } });
    const conv = conversations.create(ANA);
    llm.push(decision({ intent: 'duvida', searchQuery: 'horário atendimento' }));
    const a = await send(agent, conv.id, ANA, 'qual o horário do service desk?');
    expect(a.done?.trace.outcome).toBe('duvida_respondida');

    llm.push(decision({ intent: 'consultar_chamado' }));
    const b = await send(agent, conv.id, ANA, 'meus chamados');
    expect(b.done?.trace.outcome).toBe('sistema_indisponivel');
  });

  it('erro do LLM vira resposta de reserva, nunca silêncio', async () => {
    const { agent, conversations } = setup(); // fila vazia: o FakeLlm lança erro
    const conv = conversations.create(ANA);
    const r = await send(agent, conv.id, ANA, 'oi');
    expect(r.done?.trace.outcome).toBe('erro_interno');
    expect(r.done?.text.length).toBeGreaterThan(10);
  });
});
