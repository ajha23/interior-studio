import { describe, expect, it } from 'vitest';
import { parsePrefs } from './assistantStore';

describe('assistant preferences', () => {
  it('upgrades saved preferences from the old server/offline choice', () => {
    expect(parsePrefs({})).toEqual({ autoApply: false, provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(parsePrefs({ provider: 'offline', autoApply: true })).toEqual({ autoApply: true, provider: 'rules', model: 'rules-v1' });
    expect(parsePrefs({ provider: 'server' })).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(parsePrefs({ provider: 'openai', model: 'gpt-6-luna' })).toMatchObject({ provider: 'openai', model: 'gpt-6-luna' });
    expect(parsePrefs({ provider: 'openai', model: 'retired-model' })).toMatchObject({ provider: 'openai', model: 'gpt-6.1-sol' });
  });
});
