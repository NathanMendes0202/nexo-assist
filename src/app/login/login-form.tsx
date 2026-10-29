'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const body = (await res.json().catch(() => null)) as { redirect?: string; error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? 'Não foi possível entrar agora. Tente de novo.');
        return;
      }
      router.push(body?.redirect ?? '/');
      router.refresh();
    } catch {
      setError('Sem conexão com o servidor. Verifique sua rede e tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <div>
        <h2>Entrar</h2>
        <p className="sub">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="field">
          <label htmlFor="email">E-mail corporativo</label>
          <input id="email" type="email" autoComplete="username" placeholder="ana.souza@nexo.com.br" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <div className="field-row">
            <label htmlFor="password">Senha</label>
            <button type="button" className="link-btn" onClick={() => setShowReset((v) => !v)}>
              Esqueci minha senha
            </button>
          </div>
          <input id="password" type="password" autoComplete="current-password" placeholder="Qualquer senha, neste desafio" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Manter conectado neste computador
        </label>
      </div>

      {showReset ? <div className="form-note">Para redefinir a senha da rede, use o portal de autoatendimento ou ligue no ramal 4000.</div> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <button type="submit" className="btn btn-primary" disabled={loading || !email || !password}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
