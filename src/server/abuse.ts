import type { UsageStore } from '../services/usage';
import { SlidingWindowLimiter } from './rate-limit';

export interface AbuseConfig {
  loginPerIp15Min: number;
  messagesPerUserPerMin: number;
  messagesPerIpPerMin: number;
  userDailyMessages: number;
  globalDailyMessages: number;
}

export function abuseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AbuseConfig {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    loginPerIp15Min: n(env.NEXO_LOGIN_PER_IP_15MIN, 20),
    messagesPerUserPerMin: n(env.NEXO_MESSAGES_PER_USER_PER_MIN, 12),
    messagesPerIpPerMin: n(env.NEXO_MESSAGES_PER_IP_PER_MIN, 40),
    userDailyMessages: n(env.NEXO_USER_DAILY_MESSAGES, 100),
    globalDailyMessages: n(env.NEXO_GLOBAL_DAILY_MESSAGES, 1000),
  };
}

export type AbuseDecision = { ok: true } | { ok: false; status: 429; message: string; retryAfterSec?: number };

export interface AbuseGuard {
  checkLogin(ip: string): AbuseDecision;
  checkMessage(input: { email: string; ip: string; usesLlm: boolean }): AbuseDecision;
}

const tooMany = (message: string, retryAfterSec?: number): AbuseDecision => ({
  ok: false,
  status: 429,
  message,
  ...(retryAfterSec ? { retryAfterSec } : {}),
});

export function createAbuseGuard(deps: { usage: UsageStore; config?: AbuseConfig; now?: () => number }): AbuseGuard {
  const config = deps.config ?? abuseConfigFromEnv();
  const now = deps.now ?? Date.now;
  const login = new SlidingWindowLimiter(config.loginPerIp15Min, 15 * 60_000, now);
  const perUser = new SlidingWindowLimiter(config.messagesPerUserPerMin, 60_000, now);
  const perIp = new SlidingWindowLimiter(config.messagesPerIpPerMin, 60_000, now);

  return {
    checkLogin(ip) {
      const r = login.check(ip);
      return r.ok ? { ok: true } : tooMany('Muitas tentativas de login. Aguarde alguns minutos e tente de novo.', r.retryAfterSec);
    },

    checkMessage({ email, ip, usesLlm }) {
      const u = perUser.check(email);
      if (!u.ok) return tooMany('Você está enviando mensagens rápido demais. Respire um instante e tente de novo.', u.retryAfterSec);
      const i = perIp.check(ip);
      if (!i.ok) return tooMany('Muitas mensagens desta rede em pouco tempo. Tente de novo em instantes.', i.retryAfterSec);
      if (!usesLlm) return { ok: true };

      const exceeded = deps.usage.tryConsume([
        { scope: 'user', key: email, limit: config.userDailyMessages },
        { scope: 'global', key: '*', limit: config.globalDailyMessages },
      ]);
      if (!exceeded) return { ok: true };
      return exceeded.scope === 'user'
        ? tooMany(`Você chegou ao limite de ${config.userDailyMessages} mensagens por dia. Se for urgente, peça para falar com um analista pelo ramal 4000.`)
        : tooMany('O assistente atingiu o limite de uso de hoje. Volte amanhã ou ligue para o service desk no ramal 4000.');
    },
  };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('fly-client-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'desconhecido'
  );
}
