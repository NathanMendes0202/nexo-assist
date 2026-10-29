import { redirect } from 'next/navigation';
import { getSessionUser } from '../../server/session';
import { AppShell } from '../../ui/AppShell';
import ResetPassword from './reset-password';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'analista') redirect('/console');

  return (
    <AppShell user={{ name: user.name, email: user.email }} crumb="Meu perfil">
      <div className="page">
        <div className="page-inner">
          <header>
            <h1>Meu perfil</h1>
            <p className="sub">Seus dados de acesso ao service desk de TI.</p>
          </header>
          <dl className="profile-card">
            <div className="profile-row">
              <div>
                <dt>Nome</dt>
                <dd>{user.name}</dd>
              </div>
            </div>
            <div className="profile-row">
              <div>
                <dt>E-mail corporativo</dt>
                <dd>{user.email}</dd>
              </div>
              <span className="badge">Gerenciado pela TI</span>
            </div>
            <div className="profile-row">
              <div>
                <dt>Área</dt>
                <dd>{user.department}</dd>
              </div>
            </div>
            {user.device ? (
              <div className="profile-row">
                <div>
                  <dt>Equipamento</dt>
                  <dd>
                    {user.device.model} · {user.device.os}
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>
          <ResetPassword email={user.email} />
        </div>
      </div>
    </AppShell>
  );
}
