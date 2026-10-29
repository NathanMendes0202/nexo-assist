import { NextResponse } from 'next/server';
import type { Employee } from '../domain/types';
import { ConversationNotFoundError, ConversationStateError } from '../services/conversations';
import { getContainer } from './container';
import { getSessionUser } from './session';

type Container = ReturnType<typeof getContainer>;

export async function withAnalyst(handler: (analyst: Employee, container: Container) => Promise<Response>): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (user.role !== 'analista') return NextResponse.json({ error: 'Acesso restrito ao service desk.' }, { status: 403 });
  try {
    return await handler(user, getContainer());
  } catch (err) {
    if (err instanceof ConversationNotFoundError) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    if (err instanceof ConversationStateError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
