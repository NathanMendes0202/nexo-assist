import { NextResponse } from 'next/server';
import { clientIp } from '../../../../../server/abuse';
import { getContainer } from '../../../../../server/container';
import { getSessionUser } from '../../../../../server/session';
import { sseResponse } from '../../../../../server/sse';
import { ConversationNotFoundError } from '../../../../../services/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LENGTH = 2000;

/** Envia uma mensagem e devolve a resposta do agent em streaming (SSE): passos, texto, blocos e a trilha final. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== 'funcionario') return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Escreva uma mensagem.' }, { status: 400 });
  if (text.length > MAX_LENGTH) {
    return NextResponse.json({ error: `A mensagem passa de ${MAX_LENGTH} caracteres.` }, { status: 413 });
  }

  const { id } = await params;
  const { agent, conversations, guard } = getContainer();
  let usesLlm = true;
  try {
    usesLlm = conversations.getOwned(id, user.email).status === 'com_agent'; // privacidade: só a própria conversa
  } catch (err) {
    if (err instanceof ConversationNotFoundError) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    throw err;
  }
  // Abuso e custo: ritmo por pessoa/IP e orçamento diário. Conversa com analista não gasta modelo.
  const verdict = guard.checkMessage({ email: user.email, ip: clientIp(request.headers), usesLlm });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.message },
      { status: verdict.status, ...(verdict.retryAfterSec ? { headers: { 'Retry-After': String(verdict.retryAfterSec) } } : {}) },
    );
  }
  // A identidade passada ao agent vem do cookie assinado, nunca do corpo da requisição.
  return sseResponse(agent.handleMessage(id, user.email, text));
}
