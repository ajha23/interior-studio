/**
 * Adapts the Web-standard handlers (`/api/assistant`, `/api/speech`, `/api/live-token`, `/api/render`,
 * `/api/reference`) to Node's (req, res)
 * interface, used by the Vite dev server and the Vercel Node functions. Typed structurally so the
 * app's tsconfig needs no Node types.
 */
import { createAssistantHandler, type ServerEnv } from './assistantHandler';
import { createLiveTokenHandler } from './liveToken';
import { createSpeechHandler } from './speech';
import { createReferenceHandler, createRenderHandler } from './vision';

interface NodeRequest extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'close', listener: () => void): unknown;
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string | Uint8Array): unknown;
  readonly writableEnded?: boolean;
}

const MAX_BODY = 1_100_000;

export const nodeHandler = (env: ServerEnv) => toNode(createAssistantHandler({ env }), '/api/assistant');
export const speechNodeHandler = (env: ServerEnv) => toNode(createSpeechHandler({ env }), '/api/speech');
export const liveTokenNodeHandler = (env: ServerEnv) => toNode(createLiveTokenHandler({ env }), '/api/live-token');
// Images: larger bodies (the handlers check their own limits).
export const renderNodeHandler = (env: ServerEnv) => toNode(createRenderHandler({ env }), '/api/render', 4_200_000);
export const referenceNodeHandler = (env: ServerEnv) => toNode(createReferenceHandler({ env }), '/api/reference', 4_200_000);

function toNode(handle: (req: Request) => Promise<Response>, path: string, maxBody = MAX_BODY) {
  return async (req: NodeRequest, res: NodeResponse): Promise<void> => {
    const chunks: string[] = [];
    let size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of req) {
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      size += text.length;
      if (size > maxBody) {
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
    const response = await handle(new Request(`${proto}://${host}${req.url ?? path}`, { method: req.method ?? 'GET', headers, body: req.method === 'POST' ? chunks.join('') : undefined, signal: abort.signal }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(new Uint8Array(await response.arrayBuffer()));
  };
}
