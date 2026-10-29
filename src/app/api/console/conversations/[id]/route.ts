import { NextResponse } from 'next/server';
import { buildDetail } from '../../../../../server/console';
import { withAnalyst } from '../../../../../server/console-guard';
import { ConversationNotFoundError } from '../../../../../services/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAnalyst(async (analyst, { conversations, tickets, config }) => {
    const conv = conversations.get(id);
    if (!conv) throw new ConversationNotFoundError(id);
    return NextResponse.json(await buildDetail({ conversations, tickets, confidenceThreshold: config.confidenceThreshold }, analyst, conv));
  });
}
