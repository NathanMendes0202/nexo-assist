import { beforeEach, describe, expect, it } from 'vitest';
import { canReopen, getSla } from '../src/domain/rules';
import { openDatabase } from '../src/services/db';
import { seedIfEmpty } from '../src/services/seed';
import {
  InvalidTicketInputError,
  TicketNotFoundError,
  TicketNotReopenableError,
  TicketServiceUnavailableError,
} from '../src/services/tickets/errors';
import { withRetry } from '../src/services/tickets/resilience';
import { TicketService } from '../src/services/tickets/ticket-service';
import type { NewTicketInput } from '../src/domain/types';

const NOW = new Date(2026, 9, 27, 10, 5); // terça 10:05
const ANA = 'ana.souza@nexo.com.br';
const CARLA = 'carla.mendes@nexo.com.br';

function setup(opts: ConstructorParameters<typeof TicketService>[1] = {}) {
  const db = openDatabase(':memory:');
  seedIfEmpty(db, NOW);
  return { db, svc: new TicketService(db, { clock: () => NOW, ...opts }) };
}

const draft: NewTicketInput = {
  type: 'INC',
  title: 'VPN não conecta (erro 809)',
  description: 'Erro 809 ao conectar na VPN no Windows 11.',
  category: 'Rede e VPN',
  priority: 'Alta',
  affected: 'solicitante',
};

describe('privacidade', () => {
  it('lista só os chamados de quem está logado', async () => {
    const { svc } = setup();
    const tickets = await svc.listByRequester(ANA);
    expect(tickets).toHaveLength(5);
    expect(tickets.every((t) => t.requesterEmail === ANA)).toBe(true);
  });

  it('chamado de outra pessoa responde igual a "não existe"', async () => {
    const { svc } = setup();
    await expect(svc.getById(ANA, 'INC-20150')).rejects.toBeInstanceOf(TicketNotFoundError);
    await expect(svc.getById(ANA, 'INC-99999')).rejects.toBeInstanceOf(TicketNotFoundError);
    await expect(svc.addUpdate(ANA, 'INC-20150', { note: 'x' })).rejects.toBeInstanceOf(TicketNotFoundError);
  });
});

describe('prazos e vencimento', () => {
  it('INC-20311 está vencido; INC-20298 está dentro do prazo; REQ-10442 não corre prazo', async () => {
    const { svc } = setup();
    const byId = Object.fromEntries((await svc.listByRequester(ANA)).map((t) => [t.id, t]));
    expect(getSla(byId['INC-20311']!, NOW).overdue).toBe(true);
    expect(getSla(byId['INC-20298']!, NOW).overdue).toBe(false);
    expect(getSla(byId['REQ-10442']!, NOW).tracked).toBe(false);
  });
});

describe('criação', () => {
  it('cria o chamado com o próximo número (INC-20517) e status aberto', async () => {
    const { svc } = setup();
    const t = await svc.create(ANA, draft);
    expect(t.id).toBe('INC-20517');
    expect(t.status).toBe('aberto');
    expect((await svc.getById(ANA, t.id)).events[0]?.kind).toBe('criado');
  });

  it('recusa chamado incompleto (Anexo A)', async () => {
    const { svc } = setup();
    await expect(svc.create(ANA, { ...draft, title: ' ', description: '' })).rejects.toBeInstanceOf(InvalidTicketInputError);
  });
});

describe('duplicidade e reabertura', () => {
  it('findRelated devolve os abertos da categoria e os reabríveis', async () => {
    const { svc } = setup();
    const hw = await svc.findRelated(ANA, 'Hardware');
    expect(hw.open.map((t) => t.id).sort()).toEqual(['INC-20311', 'REQ-10442']);
    const acesso = await svc.findRelated(CARLA, 'Acesso');
    expect(acesso.reopenable.map((t) => t.id)).toEqual(['INC-20150']);
  });

  it('resolvido há 4 dias reabre ao receber informação nova', async () => {
    const { svc } = setup();
    const r = await svc.addUpdate(CARLA, 'INC-20150', { note: 'Bloqueou de novo hoje.' });
    expect(r.reopened).toBe(true);
    expect(r.ticket.status).toBe('aberto');
    expect(r.ticket.resolvedAt).toBeNull();
  });

  it('resolvido há mais de 7 dias não reabre', async () => {
    const { svc } = setup();
    await expect(svc.addUpdate(ANA, 'INC-19877', { note: 'voltou' })).rejects.toBeInstanceOf(TicketNotReopenableError);
    const t = (await svc.listByRequester(ANA)).find((x) => x.id === 'INC-19877')!;
    expect(canReopen(t, NOW)).toBe(false);
  });

  it('transferir marca o chamado como aguardando analista', async () => {
    const { svc } = setup();
    const t = await svc.markTransferred(ANA, 'INC-20298', 'Cliente pediu analista.');
    expect(t.status).toBe('aguardando_analista');
  });
});

describe('legado instável', () => {
  it('falha com TicketServiceUnavailableError quando o legado cai', async () => {
    const { svc } = setup({ unavailableRate: 1 });
    await expect(svc.listByRequester(ANA)).rejects.toBeInstanceOf(TicketServiceUnavailableError);
  });

  it('withRetry tenta de novo só quando o legado está indisponível', async () => {
    let calls = 0;
    const ok = await withRetry(
      async () => {
        if (++calls < 3) throw new TicketServiceUnavailableError();
        return 'ok';
      },
      { sleep: async () => {} },
    );
    expect(ok).toBe('ok');
    expect(calls).toBe(3);

    let notFoundCalls = 0;
    await expect(
      withRetry(async () => { notFoundCalls++; throw new TicketNotFoundError('INC-1'); }, { sleep: async () => {} }),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
    expect(notFoundCalls).toBe(1);
  });
});
