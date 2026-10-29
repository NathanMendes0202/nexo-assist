import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { findEmployee } from '../services/seed';
import type { Employee } from '../domain/types';

export const SESSION_COOKIE = 'nexo_session';
export const SESSION_TTL = { short: 60 * 60 * 12, long: 60 * 60 * 24 * 30 } as const;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET é obrigatório em produção.');
  return 'segredo-de-desenvolvimento-nao-use-em-producao';
}

const sign = (payload: string): string => createHmac('sha256', secret()).update(payload).digest('base64url');

export function createSessionToken(email: string, ttlSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email: string; exp: number };
    return exp > Date.now() / 1000 ? email : null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<Employee | null> {
  const store = await cookies();
  const email = readSessionToken(store.get(SESSION_COOKIE)?.value);
  return email ? (findEmployee(email) ?? null) : null;
}
