'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { initials } from './format';
import { ChatIcon, LogoutIcon, NexoMark, UserIcon } from './icons';

export function AppShell({
  user,
  crumb,
  topRight,
  children,
}: {
  user: { name: string; email: string };
  crumb: string;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <NexoMark size={20} tone="blue" />
          Nexo Assist
        </div>
        <nav className="nav" aria-label="Principal">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            <ChatIcon /> Atendimento
          </Link>
          <Link href="/perfil" aria-current={pathname === '/perfil' ? 'page' : undefined}>
            <UserIcon /> Meu perfil
          </Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="user">
          <div className="avatar" aria-hidden="true">{initials(user.name)}</div>
          <div className="user-text">
            <span className="user-name">{user.name}</span>
            <span className="user-email">{user.email}</span>
          </div>
        </div>
        <div className="nav">
          <button type="button" onClick={logout}>
            <LogoutIcon /> Sair
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>Service desk de TI</span>
            <span aria-hidden="true">›</span>
            <strong>{crumb}</strong>
          </div>
          {topRight}
        </header>
        {children}
      </div>
    </div>
  );
}
