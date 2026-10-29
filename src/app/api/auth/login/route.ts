import { NextResponse } from 'next/server';
import { clientIp } from '../../../../server/abuse';
import { getContainer } from '../../../../server/container';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL } from '../../../../server/session';
import { findEmployee } from '../../../../services/seed';

export const runtime = 'nodejs';

/** Login do desafio: aceita os funcionários dos dados de exemplo com qualquer senha (PRD). */
export async function POST(request: Request) {
  const attempt = getContainer().guard.checkLogin(clientIp(request.headers));
  if (!attempt.ok) {
    return NextResponse.json(
      { error: attempt.message },
      { status: attempt.status, ...(attempt.retryAfterSec ? { headers: { 'Retry-After': String(attempt.retryAfterSec) } } : {}) },
    );
  }

  const body = (await request.json().catch(() => null)) as { email?: string; password?: string; remember?: boolean } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';
  const employee = email ? findEmployee(email) : undefined;

  // Mesma mensagem para e-mail desconhecido e senha vazia: não revela quais e-mails existem.
  if (!employee || !password) {
    return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 });
  }

  const ttl = body?.remember ? SESSION_TTL.long : SESSION_TTL.short;
  const res = NextResponse.json({ redirect: employee.role === 'analista' ? '/console' : '/' });
  res.cookies.set(SESSION_COOKIE, createSessionToken(employee.email, ttl), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttl,
  });
  return res;
}
