import { NextResponse } from 'next/server';
import { buildDetail } from '../../../../../../server/console';
import { withAnalyst } from '../../../../../../server/console-guard';
import { withRetry } from '../../../../../../services/tickets/resilience';

export const runtime = 'nodejs';

/** Assumir o atendimento: o agent fica pausado (a conversa sai de "com_agent" de forma atômica). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAnalyst(async (analyst, { conversations, tickets, config }) => {
    const conv = conversations.assume(id, analyst.email); // 409 se outra pessoa chegou primeiro
    conversations.addMessage(id, 'system', `${analyst.name} (Suporte ${analyst.analystLevel ?? 'N1'}) assumiu a conversa. O assistente está pausado.`);
    if (conv.ticketId) {
      try {
        await withRetry(() => tickets.analystTake(analyst, conv.ticketId!));
      } catch {
        // melhor esforço: a conversa já foi assumida; o chamado pode ser ajustado depois
      }
    }
    const fresh = conversations.get(id)!;
    return NextResponse.json(await buildDetail({ conversations, tickets, confidenceThreshold: config.confidenceThreshold }, analyst, fresh));
  });
}
