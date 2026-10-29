import type { StreamEvent } from '../ui/types';

export function sseResponse(events: AsyncGenerator<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StreamEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      try {
        for await (const ev of events) send(ev);
      } catch (err) {
        console.error('[nexo] erro no stream do agent:', err);
        send({ type: 'error', message: 'Algo deu errado do nosso lado. Tente enviar de novo.' });
      } finally {
        controller.close();
      }
    },
    cancel() {
      void events.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
