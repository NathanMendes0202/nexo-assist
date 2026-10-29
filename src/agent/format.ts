import type { Ticket } from '../domain/types';

export function relativeDays(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

export function formatDue(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export const firstName = (fullName: string): string => fullName.split(' ')[0] ?? fullName;

export const ticketSummaryLine = (t: Ticket): string => `${t.id} (${t.title})`;
