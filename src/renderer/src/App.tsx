import { useEffect, useRef, useState, type JSX } from "react";
import { motion } from "motion/react";
import {
  Microphone,
  WaveformSlash,
  GearSix,
  MagicWand,
} from "@phosphor-icons/react";

type State = "idle" | "listening" | "working" | "error";

const smooth = {
  type: "tween",
  duration: 0.32,
  ease: [0.32, 0.72, 0, 1],
} as const;

export default function App(): JSX.Element {
  const [state, setState] = useState<State>(
    location.search.includes("live")
      ? "listening"
      : location.search.includes("work")
        ? "working"
        : "idle",
  );
  const [level, setLevel] = useState(0);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const [hover, setHover] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const ampRef = useRef(0);

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

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      ampRef.current += (level - ampRef.current) * 0.22;
      barsRef.current.forEach((el, i) => {
        if (el)
          el.style.height = `${Math.max(4, ampRef.current * (14 + 10 * Math.abs(Math.sin(i * 1.1))))}px`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);

  return (
    <>
      {/* Bottom STT pill */}
      <motion.div
        animate={{
          width:
            state === "idle" && !hover
              ? 36
              : state === "idle" && hover
                ? 84
                : state === "listening"
                  ? 132
                  : state === "working"
                    ? 64
                    : 110,
          height: state === "idle" && !hover ? 12 : 40,
        }}
        transition={smooth}
        style={{ left: "50%", x: "-50%", bottom: 8 }}
        className="pill"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <style>{css}</style>
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
            <TrayButton label="Transcript" onClick={() => window.api.toggle()}>
              <Microphone size={17} weight="duotone" />
            </TrayButton>
            <TrayButton label="Settings" onClick={() => {}}>
              <GearSix size={17} weight="duotone" />
            </TrayButton>
          </motion.div>
        )}
        {state === "listening" && (
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
        {state === "error" && (
          <div className="row">
            <WaveformSlash size={17} />
            <span className="err">Mic unavailable</span>
          </div>
        )}
      </motion.div>
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
.pill {
  position: fixed;
  padding: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border-radius: 28px;
  background: rgba(28,28,30,0.55);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 4px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
  color: #fff; cursor: grab; user-select: none;
  transform: translateZ(0);
}
.mini-handle { width: 22px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.16); }
.row { display: flex; align-items: center; gap: 8px; }
.err { font-size: 11px; opacity: 0.8; }
.wave { height: 24px; align-items: center; gap: 3px; }
.wave span { width: 3px; border-radius: 2px; background: rgba(255,255,255,0.85); display: inline-block; }
.tray-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.07);
  color: white; cursor: pointer; -webkit-app-region: no-drag;
}
  position: fixed; top: 50%; right: 10px;
  transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px; border-radius: 28px;
  background: rgba(28,28,30,0.55);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 4px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
}
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06);
  color: white; display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}



`;
