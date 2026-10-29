import { describe, expect, it } from 'vitest';
import { CASES } from '../evals/cases';
import { OracleLlm, runCase } from '../evals/run';

// Os casos de ouro rodam aqui com um "modelo" que decide certo: isso prova que as REGRAS EM CÓDIGO
// (prioridade, duplicidade, reabertura, privacidade, confirmação, transferência) produzem o desfecho
// esperado. Com o modelo de verdade, rode `npm run eval`.
describe('casos de ouro (modo oráculo)', () => {
  for (const c of CASES) {
    it(c.title, async () => {
      const result = await runCase(c, new OracleLlm());
      const failures = result.turns.flatMap((t) => t.failures.map((f) => `“${t.say}”: ${f}`));
      expect(failures).toEqual([]);
    });
  }
});
