import { describe, expect, it } from 'vitest';
import { createAbuseGuard, type AbuseConfig } from '../src/server/abuse';
import { SlidingWindowLimiter } from '../src/server/rate-limit';
import { openDatabase } from '../src/services/db';
import { UsageStore } from '../src/services/usage';

const config: AbuseConfig = { loginPerIp15Min: 3, messagesPerUserPerMin: 3, messagesPerIpPerMin: 5, userDailyMessages: 4, globalDailyMessages: 6 };

function setup() {
  let ms = Date.UTC(2026, 9, 27, 12, 0, 0);
  const db = openDatabase(':memory:');
  const usage = new UsageStore(db, () => new Date(ms));
  const guard = createAbuseGuard({ usage, config, now: () => ms });
  return { usage, guard, advance: (s: number) => { ms += s * 1000; } };
}

describe('janela deslizante', () => {
  it('bloqueia depois do limite e libera quando a janela passa', () => {
    let t = 0;
    const l = new SlidingWindowLimiter(2, 1000, () => t);
    expect(l.check('a').ok).toBe(true);
    expect(l.check('a').ok).toBe(true);
    const blocked = l.check('a');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(l.check('b').ok).toBe(true); // outra chave não é afetada
    t = 1001;
    expect(l.check('a').ok).toBe(true);
  });
});

describe('orçamento diário', () => {
  it('é tudo-ou-nada: se o global estoura, o da pessoa não é cobrado', () => {
    const { usage } = setup();
    for (let i = 0; i < 6; i++) {
      expect(usage.tryConsume([{ scope: 'user', key: `u${i}`, limit: 10 }, { scope: 'global', key: '*', limit: 6 }])).toBeNull();
    }
    const exceeded = usage.tryConsume([{ scope: 'user', key: 'novo', limit: 10 }, { scope: 'global', key: '*', limit: 6 }]);
    expect(exceeded?.scope).toBe('global');
    expect(usage.used('user', 'novo')).toBe(0);
  });

  it('zera no dia seguinte', () => {
    let ms = Date.UTC(2026, 9, 27, 23, 59, 0);
    const usage = new UsageStore(openDatabase(':memory:'), () => new Date(ms));
    expect(usage.tryConsume([{ scope: 'user', key: 'a', limit: 1 }])).toBeNull();
    expect(usage.tryConsume([{ scope: 'user', key: 'a', limit: 1 }])?.scope).toBe('user');
    ms += 2 * 60_000;
    expect(usage.tryConsume([{ scope: 'user', key: 'a', limit: 1 }])).toBeNull();
  });
});

describe('proteção contra abuso', () => {
  it('limita o ritmo por pessoa', () => {
    const { guard } = setup();
    const m = { email: 'ana@nexo.com.br', ip: '1.1.1.1', usesLlm: true };
    for (let i = 0; i < 3; i++) expect(guard.checkMessage(m).ok).toBe(true);
    const r = guard.checkMessage(m);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.status).toBe(429);
  });

  it('o limite diário vale para todas as conversas somadas ("Nova conversa" não zera)', () => {
    const { guard, advance } = setup();
    const m = { email: 'ana@nexo.com.br', ip: '1.1.1.1', usesLlm: true };
    for (let i = 0; i < 4; i++) {
      expect(guard.checkMessage(m).ok).toBe(true);
      advance(30); // devagar, para não cair no limite por minuto
    }
    const r = guard.checkMessage(m);
    expect(r.ok === false && r.message).toContain('limite de 4 mensagens por dia');
  });

  it('o teto global protege o custo mesmo com muitas pessoas diferentes', () => {
    const { guard, advance } = setup();
    for (let i = 0; i < 6; i++) {
      expect(guard.checkMessage({ email: `u${i}@nexo.com.br`, ip: `10.0.0.${i}`, usesLlm: true }).ok).toBe(true);
      advance(1);
    }
    const r = guard.checkMessage({ email: 'u9@nexo.com.br', ip: '10.0.0.9', usesLlm: true });
    expect(r.ok === false && r.message).toContain('limite de uso de hoje');
  });

  it('conversa com analista não gasta orçamento de modelo', () => {
    const { guard, usage, advance } = setup();
    for (let i = 0; i < 3; i++) {
      expect(guard.checkMessage({ email: 'ana@nexo.com.br', ip: '1.1.1.1', usesLlm: false }).ok).toBe(true);
      advance(30);
    }
    expect(usage.used('user', 'ana@nexo.com.br')).toBe(0);
  });

  it('limita tentativas de login por IP', () => {
    const { guard } = setup();
    for (let i = 0; i < 3; i++) expect(guard.checkLogin('9.9.9.9').ok).toBe(true);
    expect(guard.checkLogin('9.9.9.9').ok).toBe(false);
    expect(guard.checkLogin('8.8.8.8').ok).toBe(true);
  });
});
