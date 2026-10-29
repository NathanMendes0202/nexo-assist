import { NextResponse } from 'next/server';
import { withAnalyst } from '../../../../server/console-guard';
import { buildList } from '../../../../server/console';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista de conversas do console (o filtro e a busca são feitos na tela, com os contadores vindos daqui). */
export async function GET() {
  return withAnalyst(async (analyst, { conversations }) => NextResponse.json(buildList(conversations, analyst)));
}
