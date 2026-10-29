import { describe, expect, it } from 'vitest';
import { addBusinessDays, addBusinessHours, computeDueAt } from '../src/domain/sla';

// Datas locais: 27/out/2026 é terça-feira. Meses em JS começam em 0 (out = 9).
const d = (day: number, h = 10, m = 0, month = 9) => new Date(2026, month, day, h, m);

describe('prazos (SLA)', () => {
  it('Alta: 4 horas úteis dentro do expediente (prototipo: 09:43 -> 13:43)', () => {
    expect(addBusinessHours(d(27, 9, 43), 4)).toEqual(d(27, 13, 43));
  });

  it('Alta: sexta 16h + 4h úteis cai na segunda 10h', () => {
    expect(addBusinessHours(d(30, 16), 4)).toEqual(d(2, 10, 0, 10));
  });

  it('Alta: pedido fora do expediente começa a contar na próxima abertura', () => {
    expect(addBusinessHours(d(27, 19), 4)).toEqual(d(28, 12));
    expect(addBusinessHours(d(31, 11), 4)).toEqual(d(2, 12, 0, 10)); // sábado
  });

  it('Crítica: 1 hora em relógio corrido (há plantão 24h)', () => {
    expect(computeDueAt('Crítica', d(31, 23, 30))).toEqual(new Date(2026, 10, 1, 0, 30));
  });

  it('Média: 3 dias úteis pulando o fim de semana', () => {
    expect(computeDueAt('Média', d(30, 10))).toEqual(d(4, 10, 0, 10));
  });

  it('Baixa: 5 dias úteis', () => {
    expect(addBusinessDays(d(2, 10, 0, 10), 5)).toEqual(d(9, 10, 0, 10));
    expect(computeDueAt('Baixa', d(2, 10, 0, 10))).toEqual(d(9, 10, 0, 10));
  });
});
