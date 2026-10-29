import { NextResponse } from 'next/server';
import { getContainer } from '../../../../server/container';
import { buildPayload } from '../../../../server/payload';
import { getSessionUser } from '../../../../server/session';
import { ConversationNotFoundError } from '../../../../services/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Estado atual da conversa (a interface consulta de tempos em tempos enquanto está com um analista). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== 'funcionario') return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { id } = await params;
  const { conversations, config } = getContainer();
  try {
    return NextResponse.json(buildPayload(conversations.getOwned(id, user.email), conversations, user, config));
  } catch (err) {
    if (err instanceof ConversationNotFoundError) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    throw err;
  }
}
