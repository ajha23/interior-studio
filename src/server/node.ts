/**
 * Adapts the Web-standard assistant handler to Node's (req, res) interface, used by the Vite dev
 * server and the Vercel Node function. Typed structurally so the app's tsconfig needs no Node types.
 */
import { createAssistantHandler, type ServerEnv } from './assistantHandler';

interface NodeRequest extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'close', listener: () => void): unknown;
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
  readonly writableEnded?: boolean;
}

const MAX_BODY = 1_100_000;

export function nodeHandler(env: ServerEnv) {
  const handle = createAssistantHandler({ env });
  return async (req: NodeRequest, res: NodeResponse): Promise<void> => {
    const chunks: string[] = [];
    let size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of req) {
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      size += text.length;
      if (size > MAX_BODY) {
        res.statusCode = 413;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: { code: 'bad_request', message: 'The request is too large.', retryable: false } }));
        return;
      }
      chunks.push(text);
    }
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost');
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http');
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const abort = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const response = await handle(new Request(`${proto}://${host}${req.url ?? '/api/assistant'}`, { method: req.method ?? 'GET', headers, body: req.method === 'POST' ? chunks.join('') : undefined, signal: abort.signal }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  };
}
