import { redirect } from 'next/navigation';
import { getContainer } from '../server/container';
import { buildPayload } from '../server/payload';
import { getSessionUser } from '../server/session';
import ChatApp from '../ui/ChatApp';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'analista') redirect('/console');

  // "Voltar outro dia e continuar de onde parei": retoma a conversa ativa mais recente.
  const { conversations, config } = getContainer();
  const conv = conversations.listByUser(user.email).find((c) => c.status !== 'encerrada') ?? conversations.create(user.email);
  return <ChatApp initial={buildPayload(conv, conversations, user, config)} />;
}
