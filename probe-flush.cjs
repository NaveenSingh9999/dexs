const path = require("path");
const sherpa = require("sherpa-onnx-node");
const root = path.join(process.env.HOME, ".dexs", "models");
const dir = path.join(root, "sherpa-onnx-streaming-zipformer-en-2023-06-26");
const rc = new sherpa.OnlineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: {
      encoder: path.join(dir, "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
      decoder: path.join(dir, "decoder-epoch-99-avg-1-chunk-16-left-128.onnx"),
      joiner: path.join(dir, "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
    },
    tokens: path.join(dir, "tokens.txt"),
    numThreads: 2,
  },
  enableEndpoint: false,
});
const w = sherpa.readWave(process.argv[2], false);
function run(withPad) {
  const st = rc.createStream();
  if (withPad) st.acceptWaveform({ samples: new Float32Array(16000 * 0.3), sampleRate: 16000 });
  const chunk = 1600;
  for (let i = 0; i < w.samples.length; i += chunk) {
    st.acceptWaveform({ samples: w.samples.subarray(i, i + chunk), sampleRate: 16000 });
    while (rc.isReady(st)) rc.decode(st);
  }
  const beforePad = (rc.getResult(st)?.text ?? "").trim();
  if (withPad) st.acceptWaveform({ samples: new Float32Array(16000 * 0.4), sampleRate: 16000 });
  while (rc.isReady(st)) rc.decode(st);
  const after = (rc.getResult(st)?.text ?? "").trim();
  console.log(`pad=${withPad}\n  before pad: ${JSON.stringify(beforePad)}\n  after  pad: ${JSON.stringify(after)}`);
}
run(false);
run(true);
