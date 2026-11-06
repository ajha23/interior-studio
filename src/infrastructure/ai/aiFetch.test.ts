// Spec 045, FR-010: every browser AI call carries the user's token and the paying studio.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPayingStudio, getPayingStudio, setPayingStudio } from '@/features/ai/payingStudio';
import { AiNotReadyError, createAiFetch } from './aiFetch';

const alpha = { orgId: 'aaaaaaaa-0000-4000-8000-000000000000', orgName: 'Alpha Studio', orgSlug: 'alpha', role: 'designer' as const, plan: 'inhouse' };

function setup(token: string | null = 'access-token', response = new Response('{}', { status: 200, headers: { 'x-ai-credits': '499' } })) {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
  const aiFetch = createAiFetch({ getToken: async () => token, fetchImpl });
  return { aiFetch, fetchImpl };
}

afterEach(() => clearPayingStudio());

describe('aiFetch', () => {
  it('adds the bearer token and the paying studio, keeping the caller’s headers and body', async () => {
    setPayingStudio(alpha);
    const { aiFetch, fetchImpl } = setup();
    await aiFetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"message":"hi"}' });
    const [input, init] = fetchImpl.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(input).toBe('/api/assistant');
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('x-studio-id')).toBe(alpha.orgId);
    expect(headers.get('content-type')).toBe('application/json');
    expect(init?.body).toBe('{"message":"hi"}');
  });

  it('records the balance the server reports after a paid call', async () => {
    setPayingStudio(alpha);
    const { aiFetch } = setup();
    await aiFetch('/api/speech', { method: 'POST', body: '{}' });
    expect(getPayingStudio()?.balance).toBe(499);
  });

  it('without a session it sends nothing', async () => {
    setPayingStudio(alpha);
    const { aiFetch, fetchImpl } = setup(null);
    await expect(aiFetch('/api/assistant', { method: 'POST', body: '{}' })).rejects.toEqual(new AiNotReadyError('Sign in to use AI.'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('without a paying studio a POST sends nothing', async () => {
    const { aiFetch, fetchImpl } = setup();
    await expect(aiFetch('/api/render', { method: 'POST', body: '{}' })).rejects.toEqual(new AiNotReadyError('Open or join a studio to use AI.'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a GET (provider status) needs only the sign-in', async () => {
    const { aiFetch, fetchImpl } = setup();
    await aiFetch('/api/assistant', { method: 'GET' });
    const headers = new Headers(fetchImpl.mock.calls[0]![1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.has('x-studio-id')).toBe(false);
  });

  it('a viewer’s call is not sent (the server would refuse it anyway)', async () => {
    setPayingStudio({ ...alpha, role: 'viewer' });
    const { aiFetch, fetchImpl } = setup();
    await expect(aiFetch('/api/assistant', { method: 'POST', body: '{}' })).rejects.toEqual(new AiNotReadyError("Viewers can't use AI. Ask a studio owner for designer access."));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
