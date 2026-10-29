import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  affected TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_email);

CREATE TABLE IF NOT EXISTS ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'com_agent',
  title TEXT,
  pending_json TEXT,
  handoff_reason TEXT,
  handoff_summary TEXT,
  handoff_at TEXT,
  assigned_analyst TEXT,
  ticket_id TEXT,
  closed_at TEXT,
  closed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_email);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  blocks_json TEXT,
  trace_json TEXT,
  author_email TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Contadores diários de uso (orçamento de mensagens por pessoa e global). Persistem entre reinícios.
CREATE TABLE IF NOT EXISTS usage_counters (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key, day)
);
`;

// Bancos criados nas etapas anteriores não têm estas colunas: CREATE TABLE IF NOT EXISTS não altera tabelas existentes.
const COLUMN_MIGRATIONS: ReadonlyArray<readonly [table: string, column: string, type: string]> = [
  ['messages', 'author_email', 'TEXT'],
  ['conversations', 'ticket_id', 'TEXT'],
  ['conversations', 'closed_at', 'TEXT'],
  ['conversations', 'closed_by', 'TEXT'],
];

export function migrate(db: Db): void {
  db.exec(SCHEMA);
  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Abre (ou cria) o banco. Use ':memory:' nos testes. */
export function openDatabase(path: string = process.env.NEXO_DB_PATH ?? './data/nexo.db'): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
