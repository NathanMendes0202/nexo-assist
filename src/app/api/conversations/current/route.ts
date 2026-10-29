import { NextResponse } from 'next/server';
import { getContainer } from '../../../../server/container';
import { buildPayload } from '../../../../server/payload';
import { getSessionUser } from '../../../../server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** "Voltar outro dia e continuar de onde parei": devolve a conversa ativa mais recente (ou cria uma). */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'funcionario') return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { conversations, config } = getContainer();
  const conv = conversations.listByUser(user.email).find((c) => c.status !== 'encerrada') ?? conversations.create(user.email);
  return NextResponse.json(buildPayload(conv, conversations, user, config));
}
