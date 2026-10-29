import { NextResponse } from 'next/server';
import { getContainer } from '../../../server/container';
import { buildPayload } from '../../../server/payload';
import { getSessionUser } from '../../../server/session';
import { ConversationBusyError } from '../../../services/conversations';

export const runtime = 'nodejs';

/** Começa uma conversa nova (encerra a anterior se ela estava só com o agent). */
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== 'funcionario') return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { conversations, config } = getContainer();
  try {
    return NextResponse.json(buildPayload(conversations.startNew(user.email), conversations, user, config), { status: 201 });
  } catch (err) {
    if (err instanceof ConversationBusyError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
