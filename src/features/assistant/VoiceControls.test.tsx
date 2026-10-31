import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';

/** Minimal browser recognition object the test can drive. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = true;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

async function renderPanel() {
  vi.resetModules();
  const { useEditorStore } = await import('@/state/editorStore');
  const { useAssistantStore } = await import('@/state/assistantStore');
  const { AssistantPanel } = await import('./AssistantPanel');
  useEditorStore.getState().openProject(createProject({ name: 'Panel', room: DEFAULT_ROOM, layout: 'straight' }));
  useAssistantStore.getState().setPrefs({ provider: 'rules' });
  render(<AssistantPanel />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('voice controls', () => {
  it('without speech recognition the mic is disabled and the text box still works', async () => {
    await renderPanel();
    expect(screen.getByRole('button', { name: 'Voice input is not supported in this browser' })).toBeDisabled();
    const box = screen.getByLabelText('Message the design assistant');
    await userEvent.type(box, 'Show me all cabinet dimensions{Enter}');
    expect(await screen.findByTestId('answer-table')).toBeInTheDocument();
  });

  it('shows permission, listening and live transcript states, and explains a blocked microphone', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    await renderPanel();
    const mic = screen.getByRole('button', { name: 'Speak a request' });
    await userEvent.click(mic);
    expect(screen.getByTestId('voice-status')).toHaveTextContent('Waiting for microphone permission');
    act(() => FakeRecognition.last!.onstart!());
    expect(screen.getByTestId('voice-status')).toHaveTextContent('Listening');
    expect(screen.getByRole('button', { name: 'Stop listening' })).toHaveAttribute('aria-pressed', 'true');
    act(() => FakeRecognition.last!.onresult!({ results: [Object.assign([{ transcript: 'make the sink', confidence: 0 }], { isFinal: false })] }));
    expect(screen.getByTestId('voice-interim')).toHaveTextContent('make the sink');
    act(() => FakeRecognition.last!.onerror!({ error: 'not-allowed' }));
    expect(screen.getByTestId('voice-error')).toHaveTextContent(/Microphone access is blocked/);
    expect(screen.getByLabelText('Message the design assistant')).toBeEnabled();
    expect(screen.queryAllByTestId('user-message')).toHaveLength(0);
  });

  it('a spoken request appears as text, enters the normal preview flow once, and Esc cancels listening', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Speak a request' }));
    act(() => FakeRecognition.last!.onstart!());
    await act(async () => {
      FakeRecognition.last!.onresult!({ results: [Object.assign([{ transcript: 'make the sink nine hundred millimetres wide', confidence: 0.9 }], { isFinal: true })] });
      FakeRecognition.last!.onresult!({ results: [Object.assign([{ transcript: 'make the sink nine hundred millimetres wide', confidence: 0.9 }], { isFinal: true })] });
    });
    expect(await screen.findByTestId('change-preview')).toBeInTheDocument();
    expect(screen.getAllByTestId('user-message')).toHaveLength(1);
    expect(screen.getByTestId('user-message')).toHaveAttribute('data-source', 'voice');
    expect(screen.getByTestId('user-message')).toHaveTextContent('make the sink 900 mm wide');
    expect(screen.getByTestId('voice-heard')).toHaveTextContent('Heard: “make the sink nine hundred millimetres wide” → sent as “make the sink 900 mm wide”');

    await userEvent.click(screen.getByRole('button', { name: 'Speak a request' }));
    act(() => FakeRecognition.last!.onstart!());
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('voice-status')).not.toHaveTextContent('Listening');
  });
});
