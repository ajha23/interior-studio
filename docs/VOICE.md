# Voice (Phase 3)

Voice is another way to type into the design assistant. Speech never changes the design directly:

```
mic click → SpeechToTextProvider (browser) → interim text (shown only)
          → final transcript → normaliseSpokenRequest → voice control phrase?  stop / cancel / apply / reject
          → Conversation.send(text, { source: 'voice' })      ← the same call the text box makes
          → provider → plan → resolve + compile → isolated dry run → preview → approval → applyTransaction
          → canonical project → plan, 3D, drawings, undo/redo, save
```

| Piece | File |
| --- | --- |
| Speech-to-text interface, Web Speech adapter, error messages, privacy notice | `src/voice/speech.ts` |
| Spoken replies (`speechSynthesis`) | `src/voice/synthesis.ts` |
| Spoken numbers/units → parser text; control phrases | `src/voice/normalize.ts` |
| Session state machine (one submission per utterance, guards) | `src/voice/controller.ts` |
| Store wiring to the shared conversation | `src/state/voiceStore.ts` |
| Mic button, status bar, settings | `src/features/assistant/VoiceControls.tsx` |

## Behaviour
- **One utterance per click.** The microphone is used only from a click on the mic button until the
  utterance ends, Done/Cancel/Esc is pressed, or 15 seconds pass. Nothing listens in the background.
- **States:** idle → waiting for microphone permission → listening (live transcript) → working on it
  → speaking → idle; "change ready: say apply or reject" while a preview waits; error with a reason.
- **Exactly once:** interim results are only displayed. A session submits at most one final
  transcript; repeated or revised finals are ignored. If the engine ends with only a partial
  transcript, it is put in the message box for you to check, never sent.
- **Cancel / stale:** Cancel and Esc abort listening and any in-flight request. Events from a
  cancelled session are ignored. If another project is opened while you speak or while the request is
  processed, nothing is sent and the late reply is dropped. "This"/"the selected one" means what was
  selected when you spoke, even if the selection changes while the request is processed.
- **Approval is unchanged.** Spoken "apply" (also "approve", "confirm", "go ahead", "do it") approves the
  waiting preview exactly like the button; "reject" rejects it. Deletions still need that explicit
  approval. "Stop listening", "cancel" and "never mind" are controls and never reach the assistant.
- **Review mode** (settings): the transcript goes to the message box to edit before sending.
- **Spoken replies** (on by default for voice requests, mute in the voice bar or settings): one short
  line — "The change is ready to preview… Say apply, or reject", the reason a change failed,
  "The change was applied", a clarification question, the first sentence of an answer. Never tables.

## Spoken dimensions
`normaliseSpokenRequest` only rewrites how numbers and units were said; conversion and rounding stay
in the shared length parser (whole millimetres, halves away from zero):

| Said | Sent | Stored |
| --- | --- | --- |
| nine hundred millimetres / 900 mils | 900 mm | 900 |
| two point four metres | 2.4 m | 2400 |
| seventy six centimetres | 76 cm | 760 |
| twelve feet six inches / twelve foot six | 12 ft 6 in | 3810 |
| 12.5 feet / twelve and a half feet | 12.5 ft | 3810 (decimal feet, = 12' 6") |
| twelve feet five inches | 12 ft 5 in | 3785 |

A number spoken without a unit uses the project's display unit (inches in feet-and-inches mode), as
everywhere else. A missing size is asked for ("How much wider?"), never assumed.

## Browsers and privacy
- Recognition uses the browser's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`):
  Chrome and Edge (desktop, Android), Safari (macOS, iOS). Firefox has no speech recognition: the mic is
  disabled with an explanation and the text box works as before.
- **Where audio goes:** Interior Studio never records, uploads or stores audio. The browser's speech
  service does the recognition: Chrome sends audio to Google, Edge to Microsoft, Safari uses Apple's
  service. The panel shows the relevant notice while listening and in settings. Recognition needs a
  network connection in Chrome/Edge.
- Language: English variants (en-GB default, en-US, en-IN, en-AU, en-CA), chosen in the assistant
  settings; the browser's language picks the default.
- Transcripts become ordinary chat messages (marked with a mic) and are kept like typed messages —
  in memory only, cleared on reload or project switch. They are untrusted input and pass the same
  limits, validation and approval as typed text.
- The browser asks for microphone permission on the first click. If it is blocked, the voice bar says
  how to allow it; the permission is the browser's to manage.

## Configuration
None. Voice needs no keys or environment variables. The assistant provider (rules or Anthropic) is
configured as in `docs/AI_ASSISTANT.md`; voice requests go through it unchanged.

## Limitations and next steps
- Browser recognition quality and vendor processing vary; there is no cloud STT provider yet. A
  server-side provider can implement `SpeechToTextProvider` (stream audio to `/api/…` with the key on
  the server) if on-premise or higher-accuracy recognition is needed.
- No push-to-talk keyboard shortcut or wake word (deliberately: no background listening).
- Spoken replies use the browser's default voice for the language.
- Tested with a scripted speech engine in unit, component and Playwright tests; real microphones and
  vendor services were not exercised in CI.
