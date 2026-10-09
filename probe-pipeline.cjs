// Mirrors Session: streaming feed -> our VAD ends utterance -> sherpa flush ->
// queue the whisper review pass. Prints what the user would have seen typed.
const path = require("path");
const sherpa = require("sherpa-onnx-node");
const root = path.join(process.env.HOME, ".dexs", "models");
const sdir = path.join(root, "sherpa-onnx-streaming-zipformer-en-2023-06-26");
const wdir = path.join(root, "sherpa-onnx-whisper-tiny.en");

const RMS_THRESHOLD = 500, FRAME = 480, HANGOVER = 14, MAX_MS = 15000;

function makeStream() {
  const rc = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(sdir, "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
        decoder: path.join(sdir, "decoder-epoch-99-avg-1-chunk-16-left-128.onnx"),
        joiner: path.join(sdir, "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
      },
      tokens: path.join(sdir, "tokens.txt"), numThreads: 2,
    },
    enableEndpoint: true, rule1MinTrailingSilence: 1.2, rule2MinTrailingSilence: 0.8, rule3MinUtteranceLength: 20,
  });
  return { rc, st: rc.createStream() };
}
function decodeReady({ rc, st }) { while (rc.isReady(st)) rc.decode(st); }
function flush({ rc, st }) { decodeReady({ rc, st }); const t = (rc.getResult(st)?.text ?? "").trim(); rc.reset(st); return t; }

function review(pcm) {
  const off = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      whisper: { encoder: path.join(wdir, "tiny.en-encoder.int8.onnx"), decoder: path.join(wdir, "tiny.en-decoder.int8.onnx"), task: "transcribe" },
      tokens: path.join(wdir, "tiny.en-tokens.txt"), numThreads: 2,
    },
  });
  const st = off.createStream();
  st.acceptWaveform({ samples: pcm, sampleRate: 16000 });
  off.decode(st);
  return (off.getResult(st)?.text ?? "").trim();
}

function toMono16k(ch, rate) {
  const ratio = rate / 16000, n = Math.max(1, Math.floor(ch.length / ratio)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * ratio, lo = Math.floor(p), hi = Math.min(ch.length - 1, lo + 1), f = p - lo;
    out[i] = ch[lo] * (1 - f) + ch[hi] * f; }
  return out;
}

for (const file of process.argv.slice(2)) {
  console.log(`\n=== ${path.basename(file)}`);
  const w = sherpa.readWave(file, false);
  const pcm = new Int16Array(toMono16k(w.samples, w.sampleRate).map ? (() => {
    const f = toMono16k(w.samples, w.sampleRate); const i16 = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
    return i16;
  })() : []);
  console.log(`source ${w.sampleRate}Hz -> 16kHz ${pcm.length} samples (${(pcm.length / 16000).toFixed(2)}s)`);

  const s = makeStream();
  let speaking = false, silence = 0, buf = [], typed = "", t0 = Date.now();
  for (let i = 0; i < pcm.length; i += 1600) {
    const block = pcm.subarray(i, Math.min(pcm.length, i + 1600));
    s.st.acceptWaveform({ samples: new Float32Array(block.length).map((_, k) => block[k] / 32768), sampleRate: 16000 });
    decodeReady(s);
    for (let f = 0; f + FRAME <= block.length; f += FRAME) {
      let sum = 0; for (let k = 0; k < FRAME; k++) sum += block[f + k] ** 2;
      const rms = Math.sqrt(sum / FRAME);
      if (rms >= RMS_THRESHOLD) { speaking = true; silence = 0; } else if (speaking && ++silence >= HANGOVER) { endUt(); }
    }
    buf.push(...block);
  }
  if (speaking) endUt();
  function endUt() {
    speaking = false; silence = 0;
    if (buf.length < 16000 * 0.25) { buf = []; return; }
    const audio = Int16Array.from(buf); buf = [];
    const streamed = flush(s);
    if (streamed) { typed += " " + streamed; }
    console.log(`  [live t+${((Date.now() - t0) / 1000).toFixed(1)}s] streamed: ${JSON.stringify(streamed)}`);
    const rev = review(new Float32Array(audio).map((v) => v / 32768));
    console.log(`  [review   ] whisper:  ${JSON.stringify(rev)}`);
  }
  console.log(`total ${(pcm.length / 16000).toFixed(2)}s audio in ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
}
