import { describe, expect, it } from 'vitest';
import { derivePriority, mergeDraft, missingFields, sanitizeDecision, EMPTY_DRAFT } from '../src/agent/policy';
import type { CompleteDraft } from '../src/domain/conversation';
import { decision } from './helpers';

const base: CompleteDraft = {
  type: 'INC',
  title: 't',
  description: 'd',
  category: 'Software',
  affected: 'solicitante',
  blocksWork: false,
  commitmentToday: false,
  workStopped: false,
};

describe('prioridade (impacto x urgência)', () => {
  it('Crítica: algo parado para a equipe ou a empresa', () => {
    expect(derivePriority({ ...base, affected: 'equipe', workStopped: true }).priority).toBe('Crítica');
    expect(derivePriority({ ...base, affected: 'empresa', workStopped: true }).priority).toBe('Crítica');
  });
  it('parado só para o próprio funcionário não é crítico', () => {
    expect(derivePriority({ ...base, workStopped: true, blocksWork: true }).priority).toBe('Alta');
  });
  it('Alta: impede de trabalhar ou compromisso no mesmo dia', () => {
    expect(derivePriority({ ...base, blocksWork: true }).priority).toBe('Alta');
    expect(derivePriority({ ...base, commitmentToday: true }).priority).toBe('Alta');
  });
  it('Média: incidente com alternativa. Baixa: requisição sem urgência', () => {
    expect(derivePriority(base).priority).toBe('Média');
    expect(derivePriority({ ...base, type: 'REQ' }).priority).toBe('Baixa');
  });
});

describe('rascunho', () => {
  it('lista o que falta (incidente precisa do impacto)', () => {
    expect(missingFields(EMPTY_DRAFT)).toEqual(['titulo', 'descricao', 'tipo', 'categoria', 'afetado', 'impacto']);
    expect(missingFields({ ...EMPTY_DRAFT, type: 'REQ', title: 'a', description: 'b', category: 'Acesso', affected: 'solicitante' })).toEqual([]);
  });
  it('merge: valor novo vence, nulo e vazio não apagam o que já se sabia', () => {
    const prev = { ...EMPTY_DRAFT, title: 'antigo', category: 'Acesso' as const };
    const next = { ...EMPTY_DRAFT, title: 'novo', category: null, description: '  ' };
    const m = mergeDraft(prev, next);
    expect(m.title).toBe('novo');
    expect(m.category).toBe('Acesso');
    expect(m.description).toBeNull();
  });
});

describe('sanitização da decisão do modelo', () => {
  it('descarta chamado que não é do funcionário e corrige a confiança', () => {
    const s = sanitizeDecision(decision({ ticketRef: 'INC-20150', confidence: 1.7 }), [], new Set());
    expect(s.decision.ticketRef).toBeNull();
    expect(s.decision.confidence).toBe(1);
    expect(s.rejectedRefs).toEqual(['INC-20150']);
    expect(s.overrides.length).toBe(2);
  });
});
