import { NextResponse } from 'next/server';
import { buildDetail } from '../../../../../../server/console';
import { withAnalyst } from '../../../../../../server/console-guard';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAnalyst(async (analyst, { conversations, tickets, config }) => {
    const conv = conversations.close(id, analyst.email);
    conversations.addMessage(id, 'system', `Atendimento encerrado por ${analyst.name}.`);
    return NextResponse.json(await buildDetail({ conversations, tickets, confidenceThreshold: config.confidenceThreshold }, analyst, conv));
  });
}
