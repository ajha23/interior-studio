# 016 — Tasks

- [x] `send(text, { source })` returns the reply; stale replies (reset/project switch) dropped; request-time selection used
- [x] Speech provider interface + Web Speech adapter + error mapping + privacy notice
- [x] Speech synthesis behind `TextToSpeech`
- [x] Spoken number/unit normalisation and voice control phrases
- [x] `VoiceController` state machine (one submission per session, cancel/timeout/stale guards, spoken apply/reject)
- [x] Rule-based provider: "this" = selection, "the island", "length", room creation by dimensions, clarification for missing sizes
- [x] Mic button, status bar with live transcript, voice settings, mic marker on spoken messages
- [x] Unit, integration, component and Playwright tests; docs
