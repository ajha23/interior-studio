import { beforeEach, describe, expect, it } from 'vitest';
import { allElements, createProject, DEFAULT_ROOM } from '@/domain';
import { sequentialIds } from '@/test/ids';
import { assistantConversation, useAssistantStore } from './assistantStore';
import { useEditorStore } from './editorStore';
import { liveContext, runLiveTool } from './liveTools';

const project = () => useEditorStore.getState().project!;
const propose = (userText = 'add a 600 base cabinet') => runLiveTool('propose_changes', { explanation: 'Add a 600 mm base cabinet.', operations: [{ op: 'create_cabinet', cabinetType: 'base', width: 600 }] }, { userText });

beforeEach(() => {
  localStorage.clear();
  useAssistantStore.getState().setPrefs({ provider: 'rules', autoApply: false });
  assistantConversation().reset();
  useEditorStore.getState().openProject(createProject({ name: 'Live', room: DEFAULT_ROOM, layout: 'empty' }, sequentialIds()));
});

describe('realtime tool calls', () => {
  it('reads the project with the inspection tools', async () => {
    const r = await runLiveTool('get_walls', {}, { userText: '' });
    expect('output' in r && r.output).toContain('back');
    expect(liveContext()?.text).toContain('<project_state>');
  });

  it('turns a proposal into the normal preview in the chat, and applies only on the designer’s word', async () => {
    const r = await propose();
    expect('output' in r && r.output).toMatch(/^Preview ready and valid: Add a 600 mm base cabinet\..*Waiting for the designer to say apply or reject\.$/);
    const messages = assistantConversation().state.messages;
    expect(messages.at(-2)).toMatchObject({ role: 'user', text: 'add a 600 base cabinet', source: 'voice' });
    expect(messages.at(-1)).toMatchObject({ kind: 'proposal', status: 'proposed' });
    expect(assistantConversation().state.served).toEqual({ provider: 'gemini-live', model: 'gemini-3.8-live' });
    expect(allElements(project())).toHaveLength(0);

    // The model cannot approve on its own initiative.
    expect(await runLiveTool('apply_pending_change', {}, { userText: 'what does it look like' })).toEqual({ error: expect.stringContaining('has not said to apply') });
    expect(allElements(project())).toHaveLength(0);
    expect(await runLiveTool('apply_pending_change', {}, { userText: 'yes apply it' })).toEqual({ output: expect.stringMatching(/^Applied/) });
    expect(allElements(project())).toHaveLength(1);
  });

  it('rejects, reports invalid input for repair, and explains impossible changes', async () => {
    await propose();
    expect(await runLiveTool('reject_pending_change', {}, { userText: 'no' })).toEqual({ output: 'Rejected. Nothing was changed.' });
    expect(await runLiveTool('apply_pending_change', {}, { userText: 'apply' })).toEqual({ error: 'No change is waiting for approval.' });
    expect(await runLiveTool('propose_changes', { operations: 'nope' }, { userText: 'x' })).toEqual({ error: expect.stringMatching(/^Invalid input/) });
    const r = await runLiveTool('propose_changes', { explanation: 'Delete it.', operations: [{ op: 'delete', target: { id: 'cab_missing' } }] }, { userText: 'delete the fridge' });
    expect('output' in r && r.output).toMatch(/^The app could not make this change/);
  });
});
