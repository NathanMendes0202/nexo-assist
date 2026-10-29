import { shortDate } from '../format';
import type { ConsoleListItem, FilterKey } from './types';

const PALETTE = [
  ['#DCE9F7', '#0062C4'],
  ['#F6E3D3', '#9A4A12'],
  ['#E6E1F7', '#5B3FC4'],
  ['#DDF0E6', '#1E7A4C'],
  ['#F7E1E6', '#A3324F'],
  ['#E5E8EC', '#3D4656'],
  ['#FBEFD0', '#8A6100'],
] as const;

/** Cor estável por pessoa (mesma paleta do protótipo). */
export function avatarColors(key: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = PALETTE[h % PALETTE.length]!;
  return { bg, fg };
}

export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

/** "10:05" hoje, "ontem", ou "16 out". */
export function listTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return hhmm(iso);
  const yesterday = new Date(now.getTime() - 86_400_000);
  return sameDay(d, yesterday) ? 'ontem' : shortDate(iso);
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return 'Hoje';
  const yesterday = new Date(now.getTime() - 86_400_000);
  return sameDay(d, yesterday) ? 'Ontem' : shortDate(iso);
}

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function applyFilter(items: ConsoleListItem[], filter: FilterKey, query: string): ConsoleListItem[] {
  const q = norm(query.trim());
  return items.filter((i) => {
    if (filter === 'para_voce' && i.status !== 'aguardando_atendente') return false;
    if (filter === 'com_agent' && i.status !== 'com_agent') return false;
    if (filter === 'minhas' && !i.assignedToMe) return false;
    if (!q) return true;
    return norm(`${i.customer.name} ${i.customer.email} ${i.preview.text} ${i.tag.label}`).includes(q);
  });
}
