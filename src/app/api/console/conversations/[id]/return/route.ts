import { NextResponse } from 'next/server';
import { buildDetail } from '../../../../../../server/console';
import { withAnalyst } from '../../../../../../server/console-guard';

export const runtime = 'nodejs';

/** Devolver ao agent: ele volta a responder, já com o histórico (inclusive as falas do analista). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAnalyst(async (analyst, { conversations, tickets, config }) => {
    const conv = conversations.returnToAgent(id, analyst.email);
    conversations.addMessage(id, 'system', `${analyst.name} devolveu a conversa ao assistente.`);
    return NextResponse.json(await buildDetail({ conversations, tickets, confidenceThreshold: config.confidenceThreshold }, analyst, conv));
  });
}
