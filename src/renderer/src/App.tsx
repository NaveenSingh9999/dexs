import { useEffect, useRef, useState, type JSX } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Microphone, WaveformSlash, MagicWand } from "@phosphor-icons/react";

type State = "idle" | "listening" | "working" | "error";

export default function App(): JSX.Element {
  const QA = typeof location !== "undefined" && location.search.includes("qa");
  const [state, setState] = useState<State>(
    location.search.includes("live")
      ? "listening"
      : location.search.includes("work")
        ? "working"
        : "idle",
  );
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);

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
        setLevel(Math.min(1, Math.sqrt(sum / input.length) * 4));
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++)
          pcm[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
        window.api.sendPcm(pcm.buffer);
      };
      src.connect(proc);
      proc.connect(ctx.destination);
    } catch {
      setState("error");
    }
  }

  function stopCapture(): void {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    procRef.current?.disconnect();
    procRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setLevel(0);
  }

  useEffect(() => {
    window.api.onState((s: string) => setState(s as State));
    window.api.onPartial((t: string) => setPartial(t));
  }, []);

  useEffect(() => {
    if (state === "listening") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startCapture();
    } else {
      stopCapture();
    }
    return () => stopCapture();
  }, [state]);

  return (
    <motion.div
      layout
      className="capsule"
      onClick={() => window.api.toggle()}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <style>{glass}</style>
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div
            key="idle"
            initial={QA ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="row"
          >
            <Microphone size={18} weight="duotone" />
            <span>Ready</span>
          </motion.div>
        )}
        {state === "listening" && (
          <motion.div
            key="live"
            initial={QA ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="row"
          >
            <motion.span
              animate={{ scale: [1, 1 + level * 0.6, 1] }}
              transition={{ duration: 0.25 }}
              className="dot"
            />
            <div className="bars">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span
                  key={i}
                  animate={{ height: 6 + level * (10 + i * 4) }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              ))}
            </div>
            <span className="partial">{partial || "Listening…"}</span>
          </motion.div>
        )}
        {state === "working" && (
          <motion.div
            key="work"
            initial={QA ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="row"
          >
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
              <MagicWand size={18} weight="duotone" />
            </motion.span>
            <span>Polishing…</span>
          </motion.div>
        )}
        {state === "error" && (
          <motion.div
            key="err"
            initial={QA ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="row"
          >
            <WaveformSlash size={18} />
            <span>Mic unavailable</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const glass = `
.capsule {
  display: flex; align-items: center; padding: 10px 18px; border-radius: 999px;
  background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: 0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
  color: white; font-size: 13px; cursor: grab; user-select: none;
}
.row { display: flex; align-items: center; gap: 10px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #ff5f57; display: inline-block; }
.bars { display: flex; align-items: center; gap: 3px; }
.bars span { width: 3px; border-radius: 2px; background: rgba(255,255,255,0.85); display: inline-block; }
.partial { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.9; }
`;
