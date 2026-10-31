# 016 — Voice-driven design editing (Phase 3)

**Status:** Done. Guide: [docs/VOICE.md](../../docs/VOICE.md)

Voice is a second way to enter requests into the Phase 2 assistant. It does not edit the design:
a finished utterance is normalised and sent through `Conversation.send(text, { source: 'voice' })`,
the same path as typing, so validation, previews, approval, undo/redo and persistence are shared.

## Requirements
1. Mic button in the assistant composer; states idle, requesting permission, listening, processing,
   awaiting confirmation, speaking, error; live transcript; stop and cancel; Esc cancels; clear
   messages for unsupported browsers, blocked or missing microphones; text box always available.
2. Provider-neutral `SpeechToTextProvider`; Web Speech API adapter with feature detection; no audio
   stored; the UI says where the browser sends speech.
3. One utterance per click. Interim results never submit; at most one final transcript per session;
   cancel, project switch or unmount make late events inert; listening times out.
4. Spoken numbers/units normalised separately from geometry ("nine hundred millimetres" → 900 mm,
   "twelve foot six" → 12 ft 6 in, "12.5 feet" stays decimal feet); nothing invented.
5. "This"/"selected" resolve against the selection at the time of speaking; missing dimensions and
   ambiguous targets lead to a question.
6. Spoken "apply" / "reject" act on the pending preview like the buttons; approval rules unchanged.
7. Optional spoken replies via `speechSynthesis` (short lines only), with mute and stop.
8. Tests for all of the above; browser test with a scripted speech engine.
