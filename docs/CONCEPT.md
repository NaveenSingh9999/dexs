# Dexs — Concept

## What it is

Dexs is an open-source, fully offline voice-to-action desktop tool for
Windows and Linux. It sits in the gap between a dictation app and a
voice assistant: you talk, it types, and when you ask it to act, it
acts. There is no cloud account, no API key, and no data ever leaving
the machine.

The long-term target is a VoiceOS-style product — voice as the primary
input layer across the whole desktop. That is not v1. This document
describes the complete concept so every phase has a place to land.

## The three modes of Dexs

In the spirit of the products it follows, Dexs is built around three
operating modes:

1. **Dictate** — speech becomes text inside whatever app has focus.
   Grammar, punctuation, and formatting come out clean, the way you
   would have typed it yourself.
2. **Agent** — a spoken instruction becomes a computer action: open an
   app, search, draft a message, check a status, control a window.
   Important actions are shown and confirmed before they run.
3. **Edit** — you select existing text and speak a change to it:
   "make this shorter", "fix the tone", "translate to Japanese".

Dictate is the foundation and ships first. Agent and Edit build on the
same input layer.

## Design principles

- **Always reachable, never in the way.** Dexs lives in a small
  floating capsule that can rest at a screen edge, a dock position the
  user chooses, or hidden behind a keypress. It does not steal focus
  from the work.
- **Off by default, instant to wake.** A global hotkey starts a session.
  A wake word ("Hey Dexs") is planned once the foundation is solid;
  shipping it early means shipping a false trigger problem.
- **Everything local.** Speech recognition, selection cleanup, wake
  word, and agent orchestration all run on the user's hardware. Models
  are downloaded once and then work without a network.
- **Multiwork, not sequential.** Typing, transcribing, reviewing, and
  correcting happen concurrently, like a person speaking while an
  editor reads over their shoulder.
- **Honest UI.** The interface shows what Dexs heard, what it is
  about to do, and what it did. Nothing happens silently.

## The dictation pipeline

Dictation is not one model doing one pass. It is a small pipeline where
each stage starts the moment the previous stage has anything to say:

```
microphone
  └─▶ Vosk ────────── types instantly, raw, as you speak
  └─▶ whisper.cpp ─── re-transcribes the same audio, more accurately,
  │                    a chunk or two behind; diffs against what Vosk
  │                    typed and applies corrections in place
  └─▶ language model ─ fixes grammar, punctuation, and formatting on
                       the committed sentence; applies word-level
                       replacements
```

What the user experiences: words appear immediately. A beat later the
sentence steadies itself — a proper noun fixed, a comma added, a run-on
tidied. There is no preview-then-replace; the text you see is the text
that ships, improved moments later. If the machine is slow, Vosk carries
the output and the other two stages catch up when they can.

All three stages use open-source components: Vosk (Apache-2.0),
whisper.cpp (MIT), and a small instruction-tuned model run locally.

## The overlay

The visible face of Dexs is a floating capsule built on Electron with
TypeScript. It shows a live waveform while you speak, the current
sentence, and a clear idle / listening / working state. It can be
dragged to any screen edge, docked flush like the notch sensors it is
inspired by, or hidden entirely — some users will only ever see it when
it is dictation time.

Interaction is kinetic: states crossfade, the capsule breathes while
listening, and it collapses rather than disappears when idle.

## Agent mode (later, but the point)

Where dictation turns speech into text, agent mode turns speech into
work. "Hey Dexs, open YouTube in Chrome, search for Coding Vibes Live,
subscribe, then check the project status on Hiveary" is the shape of
the ask. Dexs will reach into apps through their APIs and
browser-automation surfaces first, and fall back to vision-guided
GUI control only when no structured route exists. Confirmation gates
everything that sends, pays, deletes, or publishes.

## Edit mode (later)

Select text anywhere, speak the transformation, Dexs returns the
rewritten text into the same place. The same local language model that
cleans up dictation does the transformation, with the user's selection
as its input.

## Screen selection (later)

An analog of circle-to-search: activate Dexs, drag a region, and ask
about what is inside it. For a desktop tool this is a natural extension
of the overlay — the capsule is how you summon it, and the region
selection uses the same always-on-top layer.

## The model backend

Long term Dexs orchestrates through opencode where available, so users
who already run it get their agent tooling for free, and users who do
not get a thin built-in runtime. Every model call stays local by
default; cloud providers remain an explicit opt-in, never a default.

## Platform strategy

Windows and X11 Linux first. Wayland comes behind it — global hotkeys,
screen capture, and always-on-top windows all behave differently there,
and pinning that down early would only slow the foundation down. This
is a deliberate trade, not an oversight.

## What v1 ships

- Floating overlay capsule with idle / listening / working states
- Global hotkey to start and stop a dictation session
- Live direct dictation with the Vosk → whisper.cpp → LLM correction
  pipeline
- Local model download and management
- Settings window: hotkeys, injection behavior, language, model choice
- Text insertion into the focused app on Windows and X11 Linux

## What comes after

1. Wake word ("Hey Dexs")
2. Agent mode on top of the same input pipeline
3. Edit mode over selections
4. Screen-region selection from the overlay
5. Wayland support
6. Optional cloud STT for users who want the absolute fastest,
   highest-accuracy path and are comfortable with it

## Non-goals (for now)

- Cloud sync, accounts, telemetry, or analytics
- Mobile
- A replacement for a full shell or launcher
- Any paid tier of anything
