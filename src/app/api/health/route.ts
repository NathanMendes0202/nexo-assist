import { NextResponse } from 'next/server';
import { getContainer } from '../../../server/container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Verificação de saúde da plataforma: confirma que o banco responde. Não expõe dados. */
export async function GET() {
  try {
    getContainer().db.prepare('SELECT 1').get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
