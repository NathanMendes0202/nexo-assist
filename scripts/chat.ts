import { createInterface } from 'node:readline/promises';
import { agentConfigFromEnv, NexoAgent } from '../src/agent/nexo-agent';
import { mastraConfigFromEnv, missingApiKeys } from '../src/agent/llm-config';
import { createMastraLlm } from '../src/agent/mastra-llm';
import type { TurnTrace } from '../src/domain/conversation';
import { openDatabase } from '../src/services/db';
import { ConversationStore } from '../src/services/conversations';
import { findEmployee, seedIfEmpty } from '../src/services/seed';
import { TicketService } from '../src/services/tickets/ticket-service';

try {
  process.loadEnvFile('.env');
} catch {
}

const llmConfig = mastraConfigFromEnv();
const missing = missingApiKeys(llmConfig);
if (missing.length > 0) {
  console.error(`Falta ${missing.join(' e ')} (modelos: ${llmConfig.deciderModel}). Copie .env.example para .env e preencha.`);
  process.exit(1);
}

const email = (process.argv[2] ?? 'ana.souza@nexo.com.br').toLowerCase();
const employee = findEmployee(email);
if (!employee || employee.role !== 'funcionario') {
  console.error(`"${email}" não é um funcionário dos dados de exemplo.`);
  process.exit(1);
}

const main = async (): Promise<void> => {
  const db = openDatabase();
  seedIfEmpty(db);
  const conversations = new ConversationStore(db);
  const tickets = new TicketService(db, { unavailableRate: Number(process.env.TICKETS_FAILURE_RATE ?? 0) });
  const agent = new NexoAgent({ llm: createMastraLlm(llmConfig), tickets, conversations });

  const conv = conversations.create(email);
  const limit = agentConfigFromEnv().messageLimit;
  console.log(`\nNexo Assist · você é ${employee.name} (${employee.department}). Conversa ${conv.id.slice(0, 8)}.`);
  console.log('Digite sua mensagem. /trace mostra a última decisão em detalhe, /sair encerra.\n');

  let lastTrace: TurnTrace | null = null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  for (;;) {
    const text = (await rl.question('você › ')).trim();
    if (!text) continue;
    if (text === '/sair') break;
    if (text === '/trace') {
      console.log(lastTrace ? JSON.stringify(lastTrace, null, 2) : 'Ainda não há decisão para mostrar.');
      continue;
    }

    process.stdout.write('\n');
    let wroteText = false;
    for await (const ev of agent.handleMessage(conv.id, email, text)) {
      switch (ev.type) {
        case 'step':
          if (ev.step.visible) console.log(`  ⚙ ${ev.step.label}${ev.step.status !== 'ok' ? ` [${ev.step.status}]` : ''}`);
          break;
        case 'text':
          if (!wroteText) process.stdout.write('assistente › ');
          wroteText = true;
          process.stdout.write(ev.delta);
          break;
        case 'blocks':
          for (const b of ev.blocks) console.log(`\n  [${b.type}] ${JSON.stringify(b)}`);
          break;
        case 'done':
          lastTrace = ev.trace;
          console.log(
            `\n  · ${ev.trace.intent} · confiança ${Math.round(ev.trace.confidence * 100)}% · ${ev.trace.durationMs} ms · ${ev.userMessageCount}/${limit} · conversa: ${ev.conversationStatus}\n`,
          );
          break;
        case 'silenced':
          console.log(`(conversa ${ev.conversationStatus}: o agent não responde)\n`);
          break;
        case 'limit_reached':
          console.log(`Limite de ${ev.limit} mensagens por sessão atingido.\n`);
          break;
      }
    }
  }
  rl.close();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
