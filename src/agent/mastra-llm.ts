import { Agent } from '@mastra/core/agent';
import { DecisionSchema, type DeciderResult } from './schemas';
import type { LlmPort } from './llm';
import { applyKeyAliases, mastraConfigFromEnv, type MastraLlmConfig } from './llm-config';
import { DECIDER_SYSTEM, RESPONDER_SYSTEM } from './prompts';

type ModelId = ConstructorParameters<typeof Agent>[0]['model'];

export { mastraConfigFromEnv, type MastraLlmConfig };
export function createMastraLlm(config: MastraLlmConfig = mastraConfigFromEnv()): LlmPort {
  applyKeyAliases();
  const decider = new Agent({
    id: 'nexo-decider',
    name: 'Nexo Assist · decisor',
    instructions: DECIDER_SYSTEM,
    model: config.deciderModel as ModelId,
  });
  const responder = new Agent({
    id: 'nexo-responder',
    name: 'Nexo Assist · redator',
    instructions: RESPONDER_SYSTEM,
    model: config.responderModel as ModelId,
  });

  return {
    models: { decider: config.deciderModel, responder: config.responderModel },

    async decide({ prompt }): Promise<DeciderResult> {
      const started = Date.now();
      const result = await decider.generate(prompt, { structuredOutput: { schema: DecisionSchema } });
      const decision = DecisionSchema.parse(result.object); // valida de novo: nunca confie na saída crua
      const usage = (result as { usage?: Record<string, unknown> }).usage ?? {};
      return {
        decision,
        call: {
          model: config.deciderModel,
          ms: Date.now() - started,
          inputTokens: num(usage.inputTokens ?? usage.promptTokens),
          outputTokens: num(usage.outputTokens ?? usage.completionTokens),
        },
      };
    },

    async *respond({ prompt }): AsyncIterable<string> {
      const stream = await responder.stream(prompt);
      for await (const chunk of stream.textStream) yield chunk;
    },
  };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
