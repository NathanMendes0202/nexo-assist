import { mkdirSync, writeFileSync } from 'node:fs';
import { CASES } from '../evals/cases';
import { OracleLlm, renderReport, runCase, type CaseResult } from '../evals/run';
import { mastraConfigFromEnv, missingApiKeys } from '../src/agent/llm-config';
import { createMastraLlm } from '../src/agent/mastra-llm';
import type { LlmPort } from '../src/agent/llm';

try {
  process.loadEnvFile('.env');
} catch {
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const cases = only ? CASES.filter((c) => c.id === only) : CASES;
  if (cases.length === 0) {
    console.error(`Nenhum caso com id "${only}". Ids: ${CASES.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  const cfg = mastraConfigFromEnv();
  const missing = dry ? [] : missingApiKeys(cfg);
  if (missing.length > 0) {
    console.error(`Falta ${missing.join(' e ')} (use \`npm run eval:dry\` para rodar sem modelo).`);
    process.exit(1);
  }
  const results: CaseResult[] = [];
  for (const c of cases) {
    const llm: LlmPort = dry ? new OracleLlm() : createMastraLlm(cfg);
    try {
      const r = await runCase(c, llm);
      results.push(r);
      console.log(`${r.passed ? '✅' : '❌'} ${c.id}${c.soft ? ' (soft)' : ''}`);
      for (const t of r.turns) for (const f of t.failures) console.log(`     ⚠️  “${t.say.slice(0, 50)}” → ${f}`);
    } catch (err) {
      console.log(`❌ ${c.id}: erro de execução: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ id: c.id, title: c.title, criterion: c.criterion, soft: Boolean(c.soft), passed: false, turns: [] });
    }
  }

  const report = renderReport(results, {
    mode: dry ? 'dry (oráculo, sem LLM)' : 'real (LLM)',
    models: dry ? '—' : `decisor ${cfg.deciderModel} · redator ${cfg.responderModel}`,
    at: new Date().toISOString(),
  });
  mkdirSync('evals', { recursive: true });
  const file = dry ? 'evals/last-run-dry.md' : 'evals/last-run.md';
  writeFileSync(file, report);
  console.log(`\nRelatório salvo em ${file}`);

  const hardFailures = results.filter((r) => !r.soft && !r.passed).length;
  process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
