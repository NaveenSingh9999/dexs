// Verifies the sherpa native stack end to end: streaming recogniser and the
// offline whisper review pass, both against the models in ~/.dexs/models.
// Run inside the proot:
//   ELECTRON_RUN_AS_NODE=1 /usr/lib/dexs/dexs verify-sherpa.cjs <wav>
const path = require("path");
const sherpa = require("sherpa-onnx-node");

const root = path.join(process.env.HOME, ".dexs", "models");
const sdir = path.join(root, "sherpa-onnx-streaming-zipformer-en-2023-06-26");
const wdir = path.join(root, "sherpa-onnx-whisper-tiny.en");
const wav = process.argv[2];

console.log("sherpa version:", sherpa.version, "onnxruntime:", sherpa.onnxruntimeVersion);

const t0 = Date.now();
const rc = new sherpa.OnlineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: {
      encoder: path.join(sdir, "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
      decoder: path.join(sdir, "decoder-epoch-99-avg-1-chunk-16-left-128.onnx"),
      joiner: path.join(sdir, "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
    },
    tokens: path.join(sdir, "tokens.txt"),
    numThreads: 2,
  },
});
const stream = rc.createStream();
const w = sherpa.readWave(wav, false); // false: Electron forbids external ArrayBuffers
console.log("audio:", (w.samples.length / w.sampleRate).toFixed(2), "s @", w.sampleRate);

// feed in 100 ms chunks, the same cadence the app uses for a dropped file
let partials = 0;
const chunk = Math.round(0.1 * w.sampleRate);
for (let i = 0; i < w.samples.length; i += chunk) {
  stream.acceptWaveform({ samples: w.samples.subarray(i, i + chunk), sampleRate: w.sampleRate });
  while (rc.isReady(stream)) rc.decode(stream);
  const text = rc.getResult(stream).text;
  if (text) {
    partials++;
    if (partials <= 3) console.log("  partial:", text);
  }
}
stream.inputFinished();
while (rc.isReady(stream)) rc.decode(stream);
console.log("streaming result:", JSON.stringify(rc.getResult(stream).text));
console.log("streaming ms:", Date.now() - t0);

const t1 = Date.now();
const off = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    whisper: {
      encoder: path.join(wdir, "tiny.en-encoder.int8.onnx"),
      decoder: path.join(wdir, "tiny.en-decoder.int8.onnx"),
      task: "transcribe",
    },
    tokens: path.join(wdir, "tiny.en-tokens.txt"),
    numThreads: 2,
  },
});
const os = off.createStream();
os.acceptWaveform({ samples: w.samples, sampleRate: w.sampleRate });
off.decode(os);
console.log("whisper result:", JSON.stringify(off.getResult(os).text));
console.log("whisper ms:", Date.now() - t1);