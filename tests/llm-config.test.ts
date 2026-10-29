import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, applyKeyAliases, mastraConfigFromEnv, missingApiKeys } from '../src/agent/llm-config';

describe('configuração do LLM', () => {
  it('o padrão é o Gemini', () => {
    expect(mastraConfigFromEnv({})).toEqual({ deciderModel: DEFAULT_MODEL, responderModel: DEFAULT_MODEL });
    expect(DEFAULT_MODEL.startsWith('google/')).toBe(true);
  });

  it('exige a chave do provedor de cada modelo', () => {
    const cfg = mastraConfigFromEnv({});
    expect(missingApiKeys(cfg, {})).toEqual(['GOOGLE_GENERATIVE_AI_API_KEY']);
    expect(missingApiKeys(cfg, { GOOGLE_GENERATIVE_AI_API_KEY: 'x' })).toEqual([]);
  });

  it('aceita o apelido GEMINI_API_KEY do AI Studio', () => {
    const env: NodeJS.ProcessEnv = { GEMINI_API_KEY: 'x' };
    applyKeyAliases(env);
    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('x');
    expect(missingApiKeys(mastraConfigFromEnv({}), { GEMINI_API_KEY: 'x' })).toEqual([]);
  });

  it('modelos de provedores diferentes pedem as duas chaves', () => {
    const cfg = { deciderModel: 'google/gemini-3.8-flash', responderModel: 'anthropic/claude-haiku-5-5' };
    expect(missingApiKeys(cfg, {}).sort()).toEqual(['ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']);
  });
});
