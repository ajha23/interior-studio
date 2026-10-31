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
| Spoken replies: browser voices, or Gemini / ChatGPT voices from `/api/speech` | `src/voice/synthesis.ts`, `src/voice/voices.ts`, `src/server/speech.ts` |
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
- **Reply voice** (settings, under "Speak short replies"): choose who speaks and in which voice —
  - **Gemini voices** (default): the 30 voices of Google's speech model `gemini-3.8-flash-tts`
    (Kore, Puck, Zephyr, Charon, Aoede, …, each with its character, e.g. "Firm", "Upbeat").
  - **ChatGPT voices (OpenAI)**: marin and cedar (best quality), alloy, ash, ballad, coral, echo,
    sage, shimmer and verse, through OpenAI's audio model `gpt-audio-1.5`.
  - **Browser voices (offline)**: any voice installed in the browser, or the browser's default.

  The ▶ button previews the choice. Server voices are synthesised by `POST /api/speech` with the
  server's key; a line takes a few seconds the first time (about 5–8 s for Gemini in testing) and
  repeated lines ("Applied.") play at once from a cache. If the server has no key for that voice, the
  request fails, or the browser blocks audio playback, the browser's own voice says the line instead
  and settings show why.

## Hands-free conversation
The conversation button (sound-wave icon) next to the microphone starts a voice conversation, like
Gemini Live or ChatGPT's voice mode: you keep talking without clicking until you end it. There are
two engines (settings → "Voice conversation"):

**Realtime — Gemini Live (default).** Speech is streamed both ways with `gemini-3.8-live`:
- The browser asks `/api/live-token` for a single-use token (30 min) that locks the model, the
  instructions, the tools and the voice; the API key never leaves the server. The browser then
  connects to Google directly over a WebSocket (no extra hop), streams the microphone as 16 kHz PCM
  in 40 ms chunks and plays the 24 kHz reply as it arrives.
- Turn detection and barge-in are done by the Live server (talk over the assistant to interrupt;
  playback stops at once). Live captions show what you say and what the assistant says.
- **No self-interruption:** the microphone uses the browser's echo cancellation, and the reply is
  played through a local WebRTC loopback so Chrome uses it as the echo reference (Chrome only
  cancels audio that arrives over WebRTC). The Live server's start-of-speech sensitivity is set low
  so leftover echo does not count as speech. If the loopback is not possible, the microphone pauses
  while the assistant speaks (the bar says so; headphones work best).
- **Same editing path:** the model uses the chat assistant's tools — read-only inspection, then
  `propose_changes` / `plan_layout` / … — which go through `Conversation.send`, so every spoken edit
  is validated, previewed in the chat and applied only after "apply". `apply_pending_change` only
  works when the designer's own words in that turn say so. Spoken answers are logged in the chat.
- Measured (Oct 2026, live service, scripted speech): ~1.3 s from the end of a request to the start
  of the spoken reply, including the tool call and validation (previously 15 s or more: whole LLM
  answer, then whole TTS clip). The project summary is sent at the start and again when it changes.
- Without `GEMINI_API_KEY` on the server, or if Live cannot connect, the standard engine is used and
  the bar says why.

**Standard — the chosen AI provider.** Listen (browser recognition) → send → speak the reply (reply
voice above) → listen again. It is half-duplex: the microphone is off while a reply plays, so the
assistant never hears itself; **Stop** interrupts a reply.

Both engines:
- **Ending:** **End** in the conversation bar, Esc, or say "goodbye", "end the conversation",
  "that's all" or "we're done" (the realtime model says goodbye first). It also ends after a period
  without speech (settings: 30 s, 1 min (default), 2 min or 5 min; a countdown shows in the last
  15 s, and time spent waiting for or hearing a reply does not count), after 30 minutes, when another
  project is opened, or on a microphone or connection error (with the reason).
- **Hold / Resume:** pauses the microphone and any reply without ending the conversation; the idle
  timer stops. Switching to another tab puts the conversation on hold.
- Code: `src/voice/live/` (session, audio, echo-cancelling playback), `src/ai/live.ts` (model,
  instructions, tools), `src/server/liveToken.ts`, `src/state/liveTools.ts` (running the model's
  tools), `VoiceController` (both engines, ending, idle) and `ConversationBar`.

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
- **Realtime conversation:** microphone audio streams to Google's Live API while the conversation
  is on (not on hold), with the project summary; nothing is recorded or stored by Interior Studio.
- **Reply text with server voices:** with Gemini or ChatGPT voices, the short reply line (never
  audio from the microphone, never the project) is sent to the app's server and from there to Google
  or OpenAI to be spoken. Browser voices keep everything on the device.
- Transcripts become ordinary chat messages (marked with a mic) and are kept like typed messages —
  in memory only, cleared on reload or project switch. They are untrusted input and pass the same
  limits, validation and approval as typed text.
- The browser asks for microphone permission on the first click. If it is blocked, the voice bar says
  how to allow it; the permission is the browser's to manage.

## Configuration
Voice input needs no keys. Gemini reply voices use the server's `GEMINI_API_KEY` (or
`GOOGLE_API_KEY`) and ChatGPT voices its `OPENAI_API_KEY` — the same keys as the assistant
(`docs/AI_ASSISTANT.md`); without them the browser's voices speak. `/api/speech` is same-origin only,
accepts listed voices and lines up to 300 characters, and allows three times `ASSISTANT_RATE_LIMIT`
requests per client per minute. Voice requests go through the chosen assistant provider unchanged.

## Limitations and next steps
- Browser recognition quality and vendor processing vary; there is no cloud STT provider yet. A
  server-side provider can implement `SpeechToTextProvider` (stream audio to `/api/…` with the key on
  the server) if on-premise or higher-accuracy recognition is needed.
- No push-to-talk keyboard shortcut or wake word (deliberately: no background listening).
- Realtime voice needs a Gemini key and sends the designer's voice to Google (as Chrome's own
  recognition already does). Echo cancellation through the WebRTC loopback depends on the browser:
  it is designed for Chrome; elsewhere the microphone may pause while the assistant speaks. The
  realtime path was tested against the live service with a scripted microphone in headless Chromium
  (where speakers are not captured), not with real speakers and a real room.
- In the standard engine, browser recognition is per utterance, so it restarts after each pause.
- Server voices are not streamed, so the first time a line is spoken it starts after the whole
  clip is ready. OpenAI's dedicated speech endpoint (`gpt-4o-mini-tts`, `tts-1`) shuts down on
  6 Jan 2027, so ChatGPT voices use the `gpt-audio-1.5` chat model told to read the line verbatim;
  it has not been exercised live here (no OpenAI key).
- Tested with a scripted speech engine in unit, component and Playwright tests; real microphones and
  vendor services were not exercised in CI.
