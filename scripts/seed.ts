import { openDatabase } from '../src/services/db';
import { seedIfEmpty } from '../src/services/seed';
import { rmSync } from 'node:fs';

const path = process.env.NEXO_DB_PATH ?? './data/nexo.db';

if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  console.log(`Banco ${path} removido.`);
}

const db = openDatabase(path);
console.log(seedIfEmpty(db) ? 'Dados de exemplo criados.' : 'O banco já tinha dados, nada foi alterado.');
