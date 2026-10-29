import type { Db } from './db';
import type { Employee, EventKind, Ticket } from '../domain/types';

// Dados de exemplo (Anexo B). As datas são relativas a "agora", assim o chamado
// INC-20311 continua "vencido" não importa quando você rodar o projeto.

export const EMPLOYEES: Employee[] = [
  { email: 'ana.souza@nexo.com.br', name: 'Ana Souza', department: 'Financeiro', role: 'funcionario', device: { model: 'Dell Latitude 5440', os: 'Windows 11' } },
  { email: 'carla.mendes@nexo.com.br', name: 'Carla Mendes', department: 'Comercial', role: 'funcionario', device: { model: 'Lenovo ThinkPad T14', os: 'Windows 10' } },
  { email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', department: 'Operações', role: 'funcionario', device: { model: 'HP EliteBook 840', os: 'Windows 11' } },
  { email: 'diego.ramos@nexo.com.br', name: 'Diego Ramos', department: 'Marketing', role: 'funcionario', device: { model: 'MacBook Air M2', os: 'macOS 14' } },
  { email: 'elisa.prado@nexo.com.br', name: 'Elisa Prado', department: 'Recursos Humanos', role: 'funcionario', device: { model: 'Dell Latitude 3440', os: 'Windows 11' } },
  { email: 'fabio.nunes@nexo.com.br', name: 'Fábio Nunes', department: 'Jurídico', role: 'funcionario', device: { model: 'Lenovo ThinkPad E14', os: 'Windows 10' } },
  { email: 'gabriela.rocha@nexo.com.br', name: 'Gabriela Rocha', department: 'Logística', role: 'funcionario', device: { model: 'HP ProBook 450', os: 'Windows 11' } },
  { email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', department: 'Service desk', role: 'analista', analystLevel: 'N2' },
  { email: 'juliana.costa@nexo.com.br', name: 'Juliana Costa', department: 'Service desk', role: 'analista', analystLevel: 'N1' },
];

export const findEmployee = (email: string): Employee | undefined =>
  EMPLOYEES.find((e) => e.email === email.trim().toLowerCase());

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function ago(now: Date, days: number, at?: [hour: number, minute: number]): string {
  const d = new Date(now.getTime() - days * DAY);
  if (at) d.setHours(at[0], at[1], 0, 0);
  return d.toISOString();
}

interface SeedTicket extends Omit<Ticket, 'resolvedAt'> {
  resolvedAt?: string;
  events: Array<{ at: string; kind: EventKind; actor: string; note: string }>;
}

function buildTickets(now: Date): SeedTicket[] {
  const ana = 'ana.souza@nexo.com.br';
  const carla = 'carla.mendes@nexo.com.br';
  const rafael = 'rafael.lima@nexo.com.br';

  return [
    // --- Ana: 3 abertos e 2 encerrados (como no protótipo) ---
    {
      id: 'INC-20311', type: 'INC', title: 'Notebook lento após atualização do Windows',
      description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
      category: 'Hardware', priority: 'Média', status: 'aguardando_analista', affected: 'solicitante', requesterEmail: ana,
      createdAt: ago(now, 7, [14, 20]), updatedAt: ago(now, 6), // há 6 dias: vencido (prazo é 3 dias úteis)
      events: [{ at: ago(now, 7, [14, 20]), kind: 'criado', actor: ana, note: 'Chamado aberto.' }, { at: ago(now, 6), kind: 'transferido', actor: 'agent', note: 'Aguardando analista.' }],
    },
    {
      id: 'INC-20298', type: 'INC', title: 'Acesso à pasta Financeiro no SharePoint',
      description: 'Perdi o acesso à pasta Financeiro depois da troca de equipe.',
      category: 'Acesso', priority: 'Média', status: 'em_andamento', affected: 'solicitante', requesterEmail: ana,
      createdAt: ago(now, 9), updatedAt: ago(now, 1), // atualizado ontem: dentro do prazo
      events: [{ at: ago(now, 9), kind: 'criado', actor: ana, note: 'Chamado aberto.' }, { at: ago(now, 1), kind: 'atualizado', actor: rafael, note: 'Aprovação do gestor solicitada.' }],
    },
    {
      id: 'REQ-10442', type: 'REQ', title: 'Segundo monitor para home office',
      description: 'Solicito um segundo monitor para trabalhar de casa.',
      category: 'Hardware', priority: 'Baixa', status: 'aprovado', affected: 'solicitante', requesterEmail: ana,
      createdAt: ago(now, 10), updatedAt: ago(now, 7),
      events: [{ at: ago(now, 10), kind: 'criado', actor: ana, note: 'Requisição aberta.' }, { at: ago(now, 7), kind: 'atualizado', actor: rafael, note: 'Aprovado pelo gestor.' }],
    },
    {
      id: 'INC-19877', type: 'INC', title: 'Outlook não sincroniza no celular',
      description: 'O e-mail não atualiza no app do celular.',
      category: 'E-mail', priority: 'Média', status: 'resolvido', affected: 'solicitante', requesterEmail: ana,
      createdAt: ago(now, 56), updatedAt: ago(now, 55), resolvedAt: ago(now, 55),
      events: [{ at: ago(now, 56), kind: 'criado', actor: ana, note: 'Chamado aberto.' }, { at: ago(now, 55), kind: 'resolvido', actor: rafael, note: 'Conta readicionada no app.' }],
    },
    {
      id: 'INC-19410', type: 'INC', title: 'Troca de senha da rede',
      description: 'Preciso trocar a senha da rede.',
      category: 'Acesso', priority: 'Baixa', status: 'resolvido', affected: 'solicitante', requesterEmail: ana,
      createdAt: ago(now, 108), updatedAt: ago(now, 108), resolvedAt: ago(now, 108),
      events: [{ at: ago(now, 108), kind: 'criado', actor: ana, note: 'Chamado aberto.' }, { at: ago(now, 108), kind: 'resolvido', actor: rafael, note: 'Senha redefinida.' }],
    },
    // --- Outros funcionários (servem para testar privacidade e reabertura) ---
    {
      id: 'INC-20150', type: 'INC', title: 'Senha do SAP bloqueada',
      description: 'A senha do SAP foi bloqueada após tentativas erradas.',
      category: 'Acesso', priority: 'Média', status: 'resolvido', affected: 'solicitante', requesterEmail: carla,
      createdAt: ago(now, 5), updatedAt: ago(now, 4), resolvedAt: ago(now, 4), // resolvido há 4 dias: ainda pode reabrir
      events: [{ at: ago(now, 5), kind: 'criado', actor: carla, note: 'Chamado aberto.' }, { at: ago(now, 4), kind: 'resolvido', actor: rafael, note: 'Senha desbloqueada.' }],
    },
    {
      id: 'REQ-10501', type: 'REQ', title: 'Acesso ao SAP, módulo de vendas',
      description: 'Preciso de acesso ao módulo de vendas do SAP para fechar propostas.',
      category: 'Acesso', priority: 'Alta', status: 'aberto', affected: 'solicitante', requesterEmail: carla,
      createdAt: ago(now, 0.1), updatedAt: ago(now, 0.1),
      events: [{ at: ago(now, 0.1), kind: 'criado', actor: carla, note: 'Requisição aberta.' }],
    },
    {
      id: 'INC-20402', type: 'INC', title: 'Impressora do 3º andar sem conexão',
      description: 'A impressora do 3º andar não aparece na rede.',
      category: 'Hardware', priority: 'Baixa', status: 'aberto', affected: 'equipe', requesterEmail: 'bruno.tavares@nexo.com.br',
      createdAt: ago(now, 2), updatedAt: ago(now, 2),
      events: [{ at: ago(now, 2), kind: 'criado', actor: 'bruno.tavares@nexo.com.br', note: 'Chamado aberto.' }],
    },
    {
      id: 'INC-20488', type: 'INC', title: 'Teams não abre após reiniciar',
      description: 'O Teams fecha sozinho ao abrir.',
      category: 'Software', priority: 'Média', status: 'resolvido', affected: 'solicitante', requesterEmail: 'elisa.prado@nexo.com.br',
      createdAt: ago(now, 3), updatedAt: ago(now, 1), resolvedAt: ago(now, 1),
      events: [{ at: ago(now, 3), kind: 'criado', actor: 'elisa.prado@nexo.com.br', note: 'Chamado aberto.' }, { at: ago(now, 1), kind: 'resolvido', actor: rafael, note: 'Cache limpo e app reinstalado.' }],
    },
    // O maior número de INC é 20516 de propósito: o próximo chamado criado será INC-20517, como no protótipo.
    {
      id: 'INC-20516', type: 'INC', title: 'Wi-Fi instável na sala de reunião 2',
      description: 'O Wi-Fi cai várias vezes durante reuniões.',
      category: 'Rede e VPN', priority: 'Média', status: 'em_andamento', affected: 'equipe', requesterEmail: 'diego.ramos@nexo.com.br',
      createdAt: ago(now, 1), updatedAt: ago(now, 0.5),
      events: [{ at: ago(now, 1), kind: 'criado', actor: 'diego.ramos@nexo.com.br', note: 'Chamado aberto.' }],
    },
  ];
}

/** Popula o banco só se estiver vazio (idempotente: reiniciar a app não duplica nada). */
export function seedIfEmpty(db: Db, now: Date = new Date()): boolean {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number };
  if (n > 0) return false;

  const insertTicket = db.prepare(
    `INSERT INTO tickets (id, type, title, description, category, priority, status, affected,
                          requester_email, created_at, updated_at, resolved_at)
     VALUES (@id, @type, @title, @description, @category, @priority, @status, @affected,
             @requesterEmail, @createdAt, @updatedAt, @resolvedAt)`,
  );
  const insertEvent = db.prepare(
    'INSERT INTO ticket_events (ticket_id, at, kind, actor, note) VALUES (?, ?, ?, ?, ?)',
  );

  db.transaction(() => {
    for (const { events, resolvedAt, ...t } of buildTickets(now)) {
      insertTicket.run({ ...t, resolvedAt: resolvedAt ?? null });
      for (const e of events) insertEvent.run(t.id, e.at, e.kind, e.actor, e.note);
    }
  })();
  return true;
}
