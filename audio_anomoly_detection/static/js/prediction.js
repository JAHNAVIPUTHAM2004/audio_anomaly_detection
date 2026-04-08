let audioCtx = null;
let stream = null;
let source = null;
let processor = null;

let isRunning = false;
let lastResult = null;

const CHUNK_MS = 1200; // near realtime
let chunkBuffer = [];
let chunkStartTime = 0;

const startBtn = () => document.getElementById("btnStart");
const stopBtn  = () => document.getElementById("btnStop");
const saveBtn  = () => document.getElementById("btnSave");

const statusEl = () => document.getElementById("status");
const predEl = () => document.getElementById("predicted");
const confEl = () => document.getElementById("confidence");
const top3El = () => document.getElementById("top3");

function setStatus(text) {
  if (statusEl()) statusEl().textContent = text;
}

function renderResult(res) {
  lastResult = res;
  predEl().textContent = res.predicted_class || "-";
  confEl().textContent = (res.confidence != null) ? (res.confidence * 100).toFixed(2) + "%" : "-";

  top3El().innerHTML = "";
  (res.top3 || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between px-3 py-2 rounded-xl border bg-white";
    row.innerHTML = `<div class="font-medium">${item.label}</div>
                     <div class="text-sm text-slate-600">${(item.confidence*100).toFixed(2)}%</div>`;
    top3El().appendChild(row);
  });
}

function floatTo16BitPCM(float32Array) {
  const output = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samplesFloat32, sampleRate) {
  const pcm16 = floatTo16BitPCM(samplesFloat32);
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm16.length * 2, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);        // PCM
  view.setUint16(20, 1, true);         // format = 1
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate = sr * blockAlign
  view.setUint16(32, 2, true);         // blockAlign = channels * bytesPerSample
  view.setUint16(34, 16, true);        // bitsPerSample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, pcm16.length * 2, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }

  return new Blob([view], { type: "audio/wav" });
}

async function sendWavBlob(wavBlob) {
  const fd = new FormData();
  fd.append("audio", wavBlob, "chunk.wav");

  const res = await fetch("/api/predict-chunk", { method: "POST", body: fd });
  const data = await res.json();

  if (!data.ok) {
    setStatus("Error: " + (data.error || "unknown"));
    toast(data.error || "Prediction error", "error");
    return;
  }
  setStatus("Listening…");
  renderResult(data);
  saveBtn().disabled = !lastResult;
}

function concatFloat32(buffers) {
  let length = 0;
  buffers.forEach(b => length += b.length);
  const out = new Float32Array(length);
  let offset = 0;
  buffers.forEach(b => { out.set(b, offset); offset += b.length; });
  return out;
}

async function startListening() {
  if (isRunning) return;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast("Microphone permission denied.", "error");
    setStatus("Mic permission denied");
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessor works in most browsers (deprecated but OK for this use)
  const bufferSize = 4096;
  processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

  chunkBuffer = [];
  chunkStartTime = performance.now();

  processor.onaudioprocess = async (e) => {
    if (!isRunning) return;

    const input = e.inputBuffer.getChannelData(0);
    // copy because input buffer is reused
    chunkBuffer.push(new Float32Array(input));

    const now = performance.now();
    if (now - chunkStartTime >= CHUNK_MS) {
      const samples = concatFloat32(chunkBuffer);
      chunkBuffer = [];
      chunkStartTime = now;

      const wavBlob = encodeWAV(samples, audioCtx.sampleRate);
      await sendWavBlob(wavBlob);
    }
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  isRunning = true;

  startBtn().disabled = true;
  stopBtn().disabled = false;
  saveBtn().disabled = true;

  setStatus("Listening…");
  toast("Listening started", "success");
}

async function stopListening() {
  if (!isRunning) return;
  isRunning = false;

  try { processor.disconnect(); } catch {}
  try { source.disconnect(); } catch {}
  try { stream.getTracks().forEach(t => t.stop()); } catch {}
  try { await audioCtx.close(); } catch {}

  processor = null;
  source = null;
  stream = null;
  audioCtx = null;

  startBtn().disabled = false;
  stopBtn().disabled = true;
  saveBtn().disabled = !lastResult;

  setStatus("Stopped");
  toast("Listening stopped", "success");
}

async function saveEvent() {
  if (!lastResult) return;

  const res = await fetch("/api/save-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      predicted_class: lastResult.predicted_class,
      confidence: lastResult.confidence,
      probs: lastResult.probs
    })
  });

  const data = await res.json();
  if (!data.ok) {
    toast(data.error || "Save failed", "error");
    return;
  }
  toast("Saved to History", "success");
  saveBtn().disabled = true;
}

window.addEventListener("DOMContentLoaded", () => {
  startBtn().addEventListener("click", startListening);
  stopBtn().addEventListener("click", stopListening);
  saveBtn().addEventListener("click", saveEvent);

  stopBtn().disabled = true;
  saveBtn().disabled = true;
  setStatus("Idle");
});