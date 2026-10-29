import { redirect } from 'next/navigation';
import { getSessionUser } from '../../server/session';
import { NexoMark } from '../../ui/icons';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'analista' ? '/console' : '/');

  return (
    <main className="login">
      <section className="login-showcase" aria-label="Apresentação do Nexo Assist">
        <div className="brand">
          <NexoMark size={24} />
          Nexo Assist
        </div>
        <div className="login-story">
          <div>
            <p className="login-eyebrow">Service desk de TI da Nexo</p>
            <h1 className="login-title">Seu problema de TI, resolvido em uma conversa.</h1>
            <p className="login-body">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
            </p>
          </div>
          <div className="preview" aria-hidden="true">
            <div className="preview-user">Meu notebook não conecta na VPN. Erro 809.</div>
            <div className="preview-agent">
              <div className="preview-who">
                Nexo Assist <span>consultou seus chamados · criou um chamado</span>
              </div>
              <div className="preview-bubble">Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.</div>
              <div className="preview-ticket">
                <b>INC-20517</b> Rede e VPN · Alta · em até 4 h
              </div>
            </div>
          </div>
        </div>
        <div className="login-stats" aria-label="Exemplo de indicadores">
          <div className="login-stat"><strong>8 s</strong><span>primeira resposta, em média</span></div>
          <div className="login-stat"><strong>72%</strong><span>resolvidos sem fila</span></div>
          <div className="login-stat"><strong>6</strong><span>analistas online agora</span></div>
        </div>
      </section>

      <section className="login-side">
        <div className="login-help">
          <span>Problema para entrar?</span>
          <strong>Ligue no ramal 4000</strong>
        </div>
        <div className="login-center">
          <LoginForm />
        </div>
        <footer className="login-foot">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
