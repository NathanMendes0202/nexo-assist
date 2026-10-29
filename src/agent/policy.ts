import { isOpen } from '../domain/rules';
import type { CompleteDraft, PartialDraft } from '../domain/conversation';
import type { Priority, Ticket } from '../domain/types';
import type { Decision } from './schemas';

export function derivePriority(d: CompleteDraft): { priority: Priority; reason: string } {
  if (d.workStopped && d.affected !== 'solicitante') {
    const who = d.affected === 'equipe' ? 'a equipe' : 'a empresa';
    return { priority: 'Crítica', reason: `Há algo parado para ${who}.` };
  }
  if (d.blocksWork) return { priority: 'Alta', reason: 'Impede você de trabalhar.' };
  if (d.commitmentToday) return { priority: 'Alta', reason: 'Há um compromisso no mesmo dia em risco.' };
  if (d.type === 'REQ') return { priority: 'Baixa', reason: 'Pedido sem urgência.' };
  return { priority: 'Média', reason: 'Atrapalha, mas há alternativa.' };
}

export type MissingField = 'titulo' | 'descricao' | 'tipo' | 'categoria' | 'afetado' | 'impacto';

export const EMPTY_DRAFT: PartialDraft = {
  type: null,
  title: null,
  description: null,
  category: null,
  affected: null,
  blocksWork: null,
  commitmentToday: null,
  workStopped: null,
};

/** Junta o que já se sabia com o que o modelo entendeu agora (valor novo não-nulo vence). */
export function mergeDraft(prev: PartialDraft | null, next: PartialDraft | null): PartialDraft {
  const merged: PartialDraft = { ...EMPTY_DRAFT, ...(prev ?? {}) };
  if (!next) return merged;
  for (const key of Object.keys(next) as Array<keyof PartialDraft>) {
    const value = next[key];
    if (value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')) {
      Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

export function missingFields(d: PartialDraft): MissingField[] {
  const missing: MissingField[] = [];
  if (!d.title) missing.push('titulo');
  if (!d.description) missing.push('descricao');
  if (!d.type) missing.push('tipo');
  if (!d.category) missing.push('categoria');
  if (!d.affected) missing.push('afetado');
  if (d.type !== 'REQ' && d.blocksWork === null) missing.push('impacto');
  return missing;
}

export function toComplete(d: PartialDraft): CompleteDraft | null {
  if (missingFields(d).length > 0) return null;
  return {
    type: d.type!,
    title: d.title!,
    description: d.description!,
    category: d.category!,
    affected: d.affected!,
    blocksWork: d.blocksWork ?? false,
    commitmentToday: d.commitmentToday ?? false,
    workStopped: d.workStopped ?? false,
  };
}

export const toPartial = (d: CompleteDraft): PartialDraft => ({ ...d });

export interface Sanitized {
  decision: Decision;
  overrides: string[];
  /** Números de chamado citados que não pertencem ao funcionário. */
  rejectedRefs: string[];
}

export function sanitizeDecision(decision: Decision, mine: Ticket[] | null, reopenableIds: Set<string>): Sanitized {
  const overrides: string[] = [];
  const rejectedRefs: string[] = [];
  const d: Decision = { ...decision };

  const confidence = Number.isFinite(d.confidence) ? Math.min(1, Math.max(0, d.confidence)) : 0;
  if (confidence !== d.confidence) overrides.push('A confiança veio fora do intervalo 0–1 e foi corrigida.');
  d.confidence = confidence;

  if (mine === null) {
    if (d.ticketRef || d.duplicateOf) {
      overrides.push('O sistema de chamados está indisponível; as referências a chamados foram ignoradas.');
    }
    d.ticketRef = null;
    d.duplicateOf = null;
    return { decision: d, overrides, rejectedRefs };
  }

  const byId = new Map(mine.map((t) => [t.id.toUpperCase(), t]));

  if (d.ticketRef) {
    const t = byId.get(d.ticketRef.trim().toUpperCase());
    if (t) d.ticketRef = t.id;
    else {
      rejectedRefs.push(d.ticketRef);
      overrides.push('O chamado citado não foi encontrado entre os seus; a referência foi ignorada.');
      d.ticketRef = null;
    }
  }

  if (d.duplicateOf) {
    const t = byId.get(d.duplicateOf.trim().toUpperCase());
    if (t && (isOpen(t) || reopenableIds.has(t.id))) d.duplicateOf = t.id;
    else {
      overrides.push('A duplicidade apontada não é um chamado seu aberto ou reabrível; foi ignorada.');
      d.duplicateOf = null;
    }
  }

  return { decision: d, overrides, rejectedRefs };
}
