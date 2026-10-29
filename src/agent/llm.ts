import type { DeciderResult } from './schemas';

export interface LlmPort {
  decide(input: { prompt: string }): Promise<DeciderResult>;
  respond(input: { prompt: string }): AsyncIterable<string>;
  readonly models: { decider: string; responder: string };
}
