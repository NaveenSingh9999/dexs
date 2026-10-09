import { useEffect, useRef, useState, type JSX } from "react";
import { motion } from "motion/react";
import {
  Microphone,
  WaveformSlash,
  GearSix,
  MagicWand,
  CheckCircle,
  Pause,
  Play,
} from "@phosphor-icons/react";
import { barHeight } from "./wave";
import {
  BLOCK_MS,
  SAMPLE_RATE,
  blockLevel,
  formatTime,
  isAudioFile,
  toMono16k,
} from "./audioFile";

type Source = "mic" | "file";

type State = "idle" | "listening" | "working" | "done" | "error";
type DoneBack = "listening" | "idle";

const smooth = {
  type: "tween",
  duration: 0.32,
  ease: [0.32, 0.72, 0, 1],
} as const;

function pillWidth(
  state: State,
  hover: boolean,
  playing: boolean,
  dock: boolean,
): number {
  if (playing) return 236;
  if (state === "idle") return hover || dock ? 84 : 36;
  if (state === "listening") return 132;
  if (state === "working") return 64;
  if (state === "done") return 88;
  return 110; // error
}

export default function App(): JSX.Element {
  const frozen = location.search.includes("done");
  const [state, setState] = useState<State>(
    frozen
      ? "done"
      : location.search.includes("live")
        ? "listening"
        : location.search.includes("work")
          ? "working"
          : "idle",
  );
  const [doneBack, setDoneBack] = useState<DoneBack>("idle");
  const stateRef = useRef<State>("idle");
  const [source, setSource] = useState<Source>("mic");
  const [dockArmed, setDockArmed] = useState(false);
  const [shake, setShake] = useState(0);
  const [absorb, setAbsorb] = useState(0);
  const [fileName, setFileName] = useState("");
  const [rate, setRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState({ at: 0, total: 0 });
  const fileRef = useRef<{
    pcm: Int16Array;
    blockSize: number;
    cursor: number;
    timer: number;
    paused: boolean;
    rate: number;
    active: boolean;
  }>({
    pcm: new Int16Array(0),
    blockSize: (BLOCK_MS * SAMPLE_RATE) / 1000,
    cursor: 0,
    timer: 0,
    paused: false,
    rate: 1,
    active: false,
  });
  const [slot, setSlot] = useState<{
    h: "h-left" | "h-center" | "h-right";
    v: "v-top" | "v-middle" | "v-bottom";
  }>({ h: "h-center", v: "v-bottom" });
  const [hover, setHover] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const levelRef = useRef(0);
  const ampRef = useRef(0);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const springRef = useRef<{ h: number[]; v: number[] }>({ h: [], v: [] });
  const dragRef = useRef({
    down: false,
    armed: false,
    x: 0,
    y: 0,
    timer: 0,
    pendingX: 0,
    pendingY: 0,
    last: 0,
    frame: 0,
  });

  /** Feeds the decoded file into the same pipeline as the mic, at `rate`x. */
  function pumpFile(): void {
    const f = fileRef.current;
    if (!f.active) return;
    if (f.paused) {
      f.timer = window.setTimeout(pumpFile, 120);
      return;
    }
    const total = f.pcm.length;
    const size = f.blockSize;
    if (f.cursor >= total) {
      endFile();
      return;
    }
    const slice = f.pcm.subarray(f.cursor, Math.min(total, f.cursor + size));
    f.cursor += size;
    if (f.cursor <= size)
      window.api.log(`pump: first block sent (${slice.length})`);
    levelRef.current = Math.max(levelRef.current * 0.6, blockLevel(slice));
    const copy = new Int16Array(slice.length);
    copy.set(slice);
    window.api.sendPcm(copy.buffer);
    setClock({ at: f.cursor / SAMPLE_RATE, total: total / SAMPLE_RATE });
    f.timer = window.setTimeout(pumpFile, BLOCK_MS / f.rate);
  }

  function endFile(): void {
    const f = fileRef.current;
    f.active = false;
    window.clearTimeout(f.timer);
    setSource("mic");
    setPlaying(false);
    setPaused(false);
    setDockArmed(false);
    window.api.resize(132, 40);
    window.api.toggle();
  }

  function stopFile(): void {
    const f = fileRef.current;
    if (!f.active) return;
    endFile();
  }

  function cycleRate(): void {
    const next = rate === 1 ? 2 : rate === 2 ? 4 : 1;
    setRate(next);
    fileRef.current.rate = next;
  }

  function togglePause(): void {
    const f = fileRef.current;
    f.paused = !f.paused;
    setPaused(f.paused);
    if (f.paused) levelRef.current = 0;
  }

  async function startFile(file: File, decodedPcm?: Int16Array): Promise<void> {
    try {
      let pcm = decodedPcm;
      if (!pcm) {
        const bytes = await file.arrayBuffer();
        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        const decoded = await ctx.decodeAudioData(bytes);
        void ctx.close();
        pcm = toMono16k(
          Array.from({ length: decoded.numberOfChannels }, (_, c) =>
            decoded.getChannelData(c),
          ),
          decoded.sampleRate,
        );
      }
      if (pcm.length === 0) throw new Error("empty audio");

      const f = fileRef.current;
      f.pcm = pcm;
      f.cursor = 0;
      f.paused = false;
      f.rate = 1;
      f.active = true;
      setSource("file");
      setRate(1);
      setPaused(false);
      setFileName(file.name);
      setClock({ at: 0, total: pcm.length / SAMPLE_RATE });
      window.api.resize(268, 40);
      window.api.toggle();
      // absorb animation, then stream
      setAbsorb((n) => n + 1);
      window.setTimeout(() => {
        f.timer = window.setTimeout(pumpFile, 120);
      }, 180);
    } catch {
      setSource("mic");
      setPlaying(false);
      setDockArmed(false);
      setShake((n) => n + 1);
    }
  }

  function onDragEnter(e: React.DragEvent<HTMLElement>): void {
    if (stateRef.current !== "idle") return;
    e.preventDefault();
    setDockArmed(true);
  }

  function onDragOver(e: React.DragEvent<HTMLElement>): void {
    if (stateRef.current !== "idle") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: React.DragEvent<HTMLElement>): void {
    if (stateRef.current !== "idle") return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDockArmed(false);
  }

  function onDrop(e: React.DragEvent<HTMLElement>): void {
    if (stateRef.current !== "idle") return;
    e.preventDefault();
    setDockArmed(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !isAudioFile(file.name, file.type)) {
      setShake((n) => n + 1);
      return;
    }
    void startFile(file);
  }

  async function startCapture(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        levelRef.current = Math.min(1, Math.sqrt(sum / input.length) * 4);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++)
          pcm[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
        window.api.sendPcm(pcm.buffer);
      };
      src.connect(proc);
      proc.connect(ctx.destination);
    } catch {
      setState("error");
      window.api.abort();
    }
  }

  /** Move the window at most once per frame of wall clock. rAF is not used:
   *  Chromium throttles it for small always-on-top windows, which stalls the
   *  drag entirely. */
  function queueDrag(dx: number, dy: number): void {
    const d = dragRef.current;
    d.pendingX += dx;
    d.pendingY += dy;
    const flush = (): void => {
      d.frame = 0;
      if (d.pendingX === 0 && d.pendingY === 0) return;
      window.api.dragBy(d.pendingX, d.pendingY);
      d.pendingX = 0;
      d.pendingY = 0;
    };
    const since = Date.now() - d.last;
    if (since >= 16) {
      d.last = Date.now();
      flush();
      return;
    }
    if (d.frame) return;
    d.frame = window.setTimeout(() => {
      d.last = Date.now();
      flush();
    }, 16 - since) as unknown as number;
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>): void {
    if ((e.target as HTMLElement).closest(".tray-btn")) return;
    const d = dragRef.current;
    d.down = true;
    d.armed = false;
    d.x = e.clientX;
    d.y = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Long press arms dragging; a quick move before that stays a tap.
    d.timer = window.setTimeout(() => {
      d.armed = true;
      setHover(false);
      window.api.dragStart();
    }, 380);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>): void {
    const d = dragRef.current;
    if (!d.down) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.armed) {
      // Moving before the long press completes means the user is not dragging.
      if (Math.hypot(dx, dy) > 6) clearDrag(e.currentTarget, e.pointerId);
      return;
    }
    if (dx === 0 && dy === 0) return;
    d.x = e.clientX;
    d.y = e.clientY;
    queueDrag(dx, dy);
  }

  function clearDrag(el: HTMLElement, pointerId: number): void {
    const d = dragRef.current;
    d.down = false;
    d.armed = false;
    window.clearTimeout(d.timer);
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>): void {
    const wasDrag = dragRef.current.armed;
    if (wasDrag) window.api.dragEnd();
    clearDrag(e.currentTarget, e.pointerId);
    if (!wasDrag && playing) stopFile();
  }

  function stopCapture(): void {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    procRef.current?.disconnect();
    procRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    levelRef.current = 0;
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    window.api.onState((s: string) => setState(s as State));
    window.api.onDone((back: string) => {
      if (stateRef.current === "error" || stateRef.current === "idle") return;
      setDoneBack(back === "listening" ? "listening" : "idle");
      setState("done");
    });
    window.api.onAnchor((s) =>
      setSlot(
        s as {
          h: "h-left" | "h-center" | "h-right";
          v: "v-top" | "v-middle" | "v-bottom";
        },
      ),
    );
  }, []);

  const listening =
    state === "listening" || (state === "done" && doneBack === "listening");
  const capturing = listening && source === "mic";

  useEffect(() => {
    if (capturing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startCapture();
    } else {
      stopCapture();
    }
    return () => stopCapture();
  }, [capturing]);

  // A finish flash always returns to the state it interrupted — unless this
  // is a frozen ?done screenshot, which holds the check indefinitely.
  useEffect(() => {
    if (state !== "done" || frozen) return;
    const t = window.setTimeout(() => setState(doneBack), 650);
    return () => window.clearTimeout(t);
  }, [state, doneBack, frozen]);

  // Error collapses quickly; working gets a longer grace since its queue
  // (last utterance + whisper) can take a few seconds.
  useEffect(() => {
    if (state !== "error" && state !== "working") return;
    const t = window.setTimeout(
      () => setState("idle"),
      state === "error" ? 2000 : 8000,
    );
    return () => window.clearTimeout(t);
  }, [state]);

  // QA hook: ?dropdemo=1 drops a real speech clip through the full path
  // (Web Audio decode -> 16 kHz mono -> pipeline), so dictation can be
  // exercised without a microphone or a file manager drag.
  const droppedRef = useRef(false);
  useEffect(() => {
    if (!location.search.includes("dropdemo")) return;
    // StrictMode double-invokes effects in dev: never drop twice.
    if (droppedRef.current) return;
    droppedRef.current = true;
    const go = async (): Promise<void> => {
      try {
        window.api.log("qa: fetching demo clip");
        const res = await fetch("/demo-speech.wav");
        const blob = await res.blob();
        window.api.log(`qa: fetched ${blob.size} bytes`);
        await startFile(
          new File([blob], "demo-speech.wav", { type: "audio/wav" }),
        );
        window.api.log(`qa: startFile done, state=${stateRef.current}`);
      } catch (e) {
        window.api.log(`qa: drop failed ${e}`);
        setShake((n) => n + 1);
      }
    };
    const id = window.setTimeout(() => void go(), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      ampRef.current += (levelRef.current - ampRef.current) * 0.25;
      const amp = ampRef.current;
      const t = performance.now() / 1000;
      barsRef.current.forEach((el, i) => {
        if (!el) return;
        const target = barHeight(amp, i, t);
        const s = springRef.current;
        if (s.h[i] == null) {
          s.h[i] = target;
          s.v[i] = 0;
        }
        s.v[i] += (target - s.h[i]) * 0.28;
        s.v[i] *= 0.72;
        s.h[i] += s.v[i];
        el.style.height = `${Math.max(4, s.h[i]).toFixed(1)}px`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className={`container ${slot.h} ${slot.v}`}>
        {/* Bottom STT pill */}
        <motion.div
          animate={{
            width: pillWidth(state, hover, playing, dockArmed),
            height: state === "idle" && !hover ? 12 : 40,
          }}
          transition={smooth}
          className={`pill ${state} ${dockArmed ? "dock" : ""} ${shake ? "shake" : ""} ${absorb ? "absorb" : ""} ${playing ? "playing" : ""}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <style>{css}</style>
          {dockArmed && <span key={`dock${shake}`} className="dock-veil" />}
          {state === "idle" && !hover && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mini-handle"
            />
          )}
          {state === "idle" && hover && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="row"
            >
              <TrayButton
                label="Transcribe"
                onClick={() => window.api.toggle()}
              >
                <Microphone size={17} weight="duotone" />
              </TrayButton>
              <TrayButton label="Settings" onClick={() => {}}>
                <GearSix size={17} weight="duotone" />
              </TrayButton>
            </motion.div>
          )}
          {listening && playing && (
            <div className="row file-bar">
              <button
                className="ctl"
                aria-label={paused ? "Play" : "Pause"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={togglePause}
              >
                {paused ? (
                  <Play size={12} weight="fill" />
                ) : (
                  <Pause size={12} weight="fill" />
                )}
              </button>
              <div className="row wave">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      barsRef.current[i] = el;
                    }}
                    style={{ height: 4 }}
                  />
                ))}
              </div>
              <button
                className="ctl rate"
                aria-label="Playback speed"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={cycleRate}
              >
                {rate}x
              </button>
              <span className="clock" title={fileName}>
                {formatTime(clock.at)}/{formatTime(clock.total)}
              </span>
            </div>
          )}
          {state === "listening" && !playing && (
            <div className="row wave">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    barsRef.current[i] = el;
                  }}
                  style={{ height: 4 }}
                />
              ))}
            </div>
          )}
          {state === "working" && (
            <div className="row">
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                <MagicWand size={17} weight="duotone" />
              </motion.span>
            </div>
          )}
          {state === "done" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={smooth}
              className="row"
            >
              <span className="done-check">
                <CheckCircle size={18} weight="duotone" />
              </span>
            </motion.div>
          )}
          {state === "error" && (
            <div className="row">
              <WaveformSlash size={17} />
              <span className="err">Mic unavailable</span>
            </div>
          )}
        </motion.div>
      </div>
      <style>{css}</style>
    </>
  );
}

function TrayButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "tween", duration: 0.15 }}
      className="tray-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

const css = `
.container { position: fixed; inset: 0; display: flex; flex-direction: column; pointer-events: none; }
.container.h-left { align-items: flex-start; }
.container.h-center { align-items: center; }
.container.h-right { align-items: flex-end; }
.container.v-top { justify-content: flex-start; }
.container.v-middle { justify-content: center; }
.container.v-bottom { justify-content: flex-end; }
.pill {
  padding: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  pointer-events: auto;
  border-radius: 28px;
  background: rgba(28,28,30,0.55);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 4px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
  color: #fff; cursor: grab; user-select: none;
  transform: translateZ(0);
  touch-action: none;
}
.mini-handle { width: 22px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.16); }
.row { display: flex; align-items: center; gap: 8px; }
.err { font-size: 11px; opacity: 0.8; }
.wave { height: 24px; align-items: center; gap: 3px; }
.wave span { width: 3px; border-radius: 2px; background: linear-gradient(180deg,#FF9A8B,#FF4634); display: inline-block; }
.pill.listening {
  background: rgba(28,16,15,0.55);
  border-color: rgba(255,110,95,0.28);
  box-shadow: 0 4px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10);
}
.pill.done {
  border-color: rgba(255,255,255,0.28);
  box-shadow: 0 4px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
}
.pill.error { border-color: rgba(255,110,95,0.28); }
.pill.dock {
  border-color: rgba(255,255,255,0.42);
  box-shadow: 0 4px 22px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.10);
  background: rgba(40,40,44,0.72);
}
.dock-veil {
  position: absolute; inset: 0;
  border-radius: inherit;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%);
  background-size: 220% 100%;
  animation: sweep 900ms linear infinite;
  pointer-events: none;
}
.pill.absorb { animation: absorb 260ms cubic-bezier(0.32,0.72,0,1); }
.pill.shake { animation: shake 320ms cubic-bezier(0.36,0.07,0.19,0.97); }
.file-bar { gap: 7px; padding: 0 10px; }
.file-bar .wave { flex: 1; justify-content: center; }
.ctl {
  display: flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 6px;
  border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.08);
  color: #fff; cursor: pointer;
  -webkit-app-region: no-drag;
}
.ctl:hover { background: rgba(255,255,255,0.16); }
.ctl:active { transform: scale(0.94); }
.ctl.rate { font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }
.clock { font-size: 10px; color: rgba(255,255,255,0.62); font-variant-numeric: tabular-nums; }
@keyframes sweep { from { background-position: 130% 0; } to { background-position: -130% 0; } }
@keyframes absorb {
  0% { transform: scale(1); }
  38% { transform: scale(0.94); }
  100% { transform: scale(1); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-6px); }
  55% { transform: translateX(5px); }
  78% { transform: translateX(-2px); }
}
.done-check { color: #fff; display: flex; }
.tray-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.07);
  color: white; cursor: pointer; -webkit-app-region: no-drag;
}
`;
