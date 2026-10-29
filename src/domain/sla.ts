import type { Priority } from './types';

const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;

const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

function nextBusinessDayStart(d: Date): Date {
  const n = new Date(d);
  n.setHours(OPEN_HOUR, 0, 0, 0);
  do {
    n.setDate(n.getDate() + 1);
  } while (isWeekend(n));
  return n;
}

function intoBusinessWindow(d: Date): Date {
  if (isWeekend(d)) return nextBusinessDayStart(d);
  const hour = d.getHours() + d.getMinutes() / 60;
  if (hour < OPEN_HOUR) {
    const n = new Date(d);
    n.setHours(OPEN_HOUR, 0, 0, 0);
    return n;
  }
  if (hour >= CLOSE_HOUR) return nextBusinessDayStart(d);
  return new Date(d);
}

export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = intoBusinessWindow(start);
  let remainingMin = hours * 60;
  while (remainingMin > 0) {
    const close = new Date(cursor);
    close.setHours(CLOSE_HOUR, 0, 0, 0);
    const availableMin = (close.getTime() - cursor.getTime()) / 60_000;
    if (remainingMin <= availableMin) {
      return new Date(cursor.getTime() + remainingMin * 60_000);
    }
    remainingMin -= availableMin;
    cursor = nextBusinessDayStart(cursor);
  }
  return cursor;
}

export function addBusinessDays(start: Date, days: number): Date {
  const n = new Date(start);
  let left = days;
  while (left > 0) {
    n.setDate(n.getDate() + 1);
    if (!isWeekend(n)) left--;
  }
  return n;
}

export function computeDueAt(priority: Priority, from: Date): Date {
  switch (priority) {
    case 'Crítica':
      return new Date(from.getTime() + 60 * 60_000);
    case 'Alta':
      return addBusinessHours(from, 4);
    case 'Média':
      return addBusinessDays(from, 3);
    case 'Baixa':
      return addBusinessDays(from, 5);
  }
}

export const SLA_LABEL: Record<Priority, string> = {
  Crítica: '1 hora',
  Alta: '4 horas úteis',
  Média: '3 dias úteis',
  Baixa: '5 dias úteis',
};
