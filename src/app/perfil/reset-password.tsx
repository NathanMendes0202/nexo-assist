'use client';

import { useState } from 'react';

export default function ResetPassword({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="profile-card">
      <div className="profile-row">
        <div>
          <dt>Senha</dt>
          <dd>{sent ? `Enviaremos um link de redefinição para ${email}.` : 'Redefina pela caixa de e-mail corporativa.'}</dd>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setSent(true)} disabled={sent}>
          {sent ? 'Link solicitado' : 'Redefinir senha'}
        </button>
      </div>
    </div>
  );
}
