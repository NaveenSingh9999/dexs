# Dexs Foundation — v1 Spec

## Goal

Ship the smallest useful Dexs: a floating overlay capsule, a global
hotkey, and live offline dictation with a correction pipeline, on
Windows and X11 Linux.

## Scope

In:
- Electron + TypeScript app (electron-vite build, TSX for UI)
- Floating always-on-top transparent overlay capsule with
  idle / listening / working states and a live waveform
- Draggable and dockable to a screen edge
- Global hotkey to toggle dictation (default: Ctrl+Shift+Space,
  configurable)
- Mic capture in the main process
- Vosk streaming: types raw words instantly into the focused app
- whisper.cpp on each completed utterance: re-transcribes more
  accurately, diffs against what Vosk typed, applies corrections
- Text injection into the focused app: keystroke simulation for short
  text, clipboard paste for long text (heuristic, no user toggle in v1)
- Settings window: hotkey, language, whisper model size, injection
  behavior
- Local model download on first run (Vosk model ~50MB, whisper model
  user-selected among tiny/base/small/medium/turbo)
- Structured logging to a file; `dexs doctor`-style self-check in
  settings

Out (later phases):
- Wake word, agent mode, edit mode, screen selection
- Wayland support
- Cloud STT
- LLM grammar pass over dictation (pipeline stage is reserved in the
  interface but not implemented in v1)
- Auto-update, installers beyond electron-builder portable targets

## Architecture

Single Electron app, four packages:

- `packages/main` — process entry: tray, hotkeys, windows, mic
  capture, VAD, STT orchestration, injection, settings store, logs
- `packages/overlay` — the capsule renderer (React + TSX)
- `packages/settings` — settings window renderer (React + TSX)
- `packages/core` — shared: audio pipeline, VAD, Vosk/whisper engine
  wrappers, injector, correction differ, types

Data flow for one utterance:

```
mic → pcm16 16k mono
    → VAD (silero or energy) detects sentence boundaries
    → Vosk partial/final → injector.type(...)
    → on sentence end: whisper.cpp transcribe(chunk)
         → diff(typed_text, whisper_text) → injector.correct(...)
```

Injection details:
- Linux X11: `xdotool type` / `xdotool key` for corrections,
  `xclip` + Ctrl-V for long text
- Windows: PowerShell/`nut.js` SendInput path, clipboard path for long
  text
- Correction = N backspaces + typed replacement; bounded by a max
  diff size, else fall back to selecting the last sentence region

## Failure modes

- No mic → overlay shows error, stays idle
- whisper.cpp missing/failed → dictation still works via Vosk alone,
  status shows "basic mode"
- Vosk model missing → first-run download, clear progress UI
- Focus lost mid-dictation → drop into paused state, do not type into
  the wrong window
- Hotkey conflict → settings validation warns

## Testing

- Unit: correction differ, VAD chunker, injector decision logic
- Integration: fake mic WAV through the pipeline end-to-end, assert
  typed text and corrections
- Manual matrix: Windows + X11 Linux, Chrome/VS Code/terminals

## Success criteria

- Dictation into any focused app on Windows and X11 Linux with no
  cloud dependency
- Time from finishing a sentence to text appearing: under ~1s for Vosk
  path, corrections within a few seconds after
- App starts, hotkey toggles, overlay animates states
