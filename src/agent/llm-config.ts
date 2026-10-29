// Configuração do LLM sem importar o Mastra: dá para testar e usar nos scripts antes de qualquer chamada.

export interface MastraLlmConfig {
  /** Formato do Mastra: provedor/modelo (ex.: "google/gemini-3.8-flash"). */
  deciderModel: string;
  responderModel: string;
}

export const DEFAULT_MODEL = 'google/gemini-3.8-flash';

export function mastraConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MastraLlmConfig {
  return {
    deciderModel: env.NEXO_DECIDER_MODEL ?? DEFAULT_MODEL,
    responderModel: env.NEXO_RESPONDER_MODEL ?? DEFAULT_MODEL,
  };
}

/** Variável de ambiente que o roteador de modelos do Mastra lê para cada provedor. */
const KEY_VARS: Record<string, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/** O Google AI Studio costuma chamar a chave de GEMINI_API_KEY: aceitamos esse apelido. */
export function applyKeyAliases(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY && env.GEMINI_API_KEY) env.GOOGLE_GENERATIVE_AI_API_KEY = env.GEMINI_API_KEY;
}

export function requiredKeyVars(config: MastraLlmConfig): string[] {
  const providers = new Set([config.deciderModel, config.responderModel].map((m) => m.split('/')[0] ?? ''));
  return [...providers].map((p) => KEY_VARS[p]).filter((v): v is string => Boolean(v));
}

/** Nomes das variáveis de chave que faltam para os modelos configurados. */
export function missingApiKeys(config: MastraLlmConfig, env: NodeJS.ProcessEnv = process.env): string[] {
  applyKeyAliases(env);
  return requiredKeyVars(config).filter((v) => !env[v]);
}
