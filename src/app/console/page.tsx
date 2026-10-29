import { redirect } from 'next/navigation';
import { getContainer } from '../../server/container';
import { buildList } from '../../server/console';
import { getSessionUser } from '../../server/session';
import ConsoleApp from '../../ui/console/ConsoleApp';

export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'analista') redirect('/');

  const { conversations } = getContainer();
  return <ConsoleApp initial={buildList(conversations, user)} />;
}
