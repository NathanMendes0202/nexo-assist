import { NextResponse } from 'next/server';
import { buildDetail } from '../../../../../../server/console';
import { withAnalyst } from '../../../../../../server/console-guard';
import { ConversationNotFoundError, ConversationStateError } from '../../../../../../services/conversations';

export const runtime = 'nodejs';

const MAX_LENGTH = 2000;

/** Mensagem do analista. Só quem assumiu o atendimento pode responder. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Escreva uma mensagem.' }, { status: 400 });
  if (text.length > MAX_LENGTH) return NextResponse.json({ error: `A mensagem passa de ${MAX_LENGTH} caracteres.` }, { status: 413 });

  return withAnalyst(async (analyst, { conversations, tickets, config }) => {
    const conv = conversations.get(id);
    if (!conv) throw new ConversationNotFoundError(id);
    if (conv.status !== 'com_analista' || conv.assignedAnalyst !== analyst.email) {
      throw new ConversationStateError('Assuma o atendimento para responder.');
    }
    conversations.addMessage(id, 'analyst', text, { authorEmail: analyst.email });
    return NextResponse.json(await buildDetail({ conversations, tickets, confidenceThreshold: config.confidenceThreshold }, analyst, conv));
  });
}
