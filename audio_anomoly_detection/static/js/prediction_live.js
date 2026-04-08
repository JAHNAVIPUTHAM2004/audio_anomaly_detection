let liveAudioCtx = null;
let liveStream = null;
let liveSource = null;
let liveProcessor = null;

let liveRunning = false;
let liveLastResult = null;

// Trigger tuning
const DB_THRESHOLD = -40;     // <- decrease to trigger more (e.g., -50), increase to trigger less (e.g., -30)
const MIN_TRIGGER_MS = 350;   // sound must stay above threshold for this many ms
const COOLDOWN_MS = 1200;     // wait after a trigger before allowing next trigger
const CAPTURE_MS = 1200;      // length of captured audio sent to backend

let aboveSince = null;
let lastTriggerAt = 0;

let captureBuffers = [];
let captureStart = 0;

const tabLive = () => document.getElementById("tabLive");
const tabMic  = () => document.getElementById("tabMic");
const tabFile = () => document.getElementById("tabFile");

const panelLive = () => document.getElementById("panelLive");
const panelMic  = () => document.getElementById("panelMic");
const panelFile = () => document.getElementById("panelFile");

function setTab(active) {
  // buttons
  const liveBtn = tabLive(), micBtn = tabMic(), fileBtn = tabFile();
  const activeCls = "px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold";
  const idleCls = "px-4 py-2 rounded-2xl border bg-white font-semibold hover:bg-slate-50";

  liveBtn.className = (active === "live") ? activeCls : idleCls;
  micBtn.className  = (active === "mic")  ? activeCls : idleCls;
  fileBtn.className = (active === "file") ? activeCls : idleCls;

  // panels
  panelLive().classList.toggle("hidden", active !== "live");
  panelMic().classList.toggle("hidden", active !== "mic");
  panelFile().classList.toggle("hidden", active !== "file");
}

// ---------- WAV ENCODER (same style as mic wav streaming) ----------
function floatTo16BitPCM(float32Array) {
  const output = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}
function encodeWAV(samplesFloat32, sampleRate) {
  const pcm16 = floatTo16BitPCM(samplesFloat32);
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm16.length * 2, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, "data");
  view.setUint32(40, pcm16.length * 2, true);

  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) view.setInt16(offset, pcm16[i], true);

  return new Blob([view], { type: "audio/wav" });
}
function concatFloat32(buffers) {
  let length = 0;
  buffers.forEach(b => length += b.length);
  const out = new Float32Array(length);
  let offset = 0;
  buffers.forEach(b => { out.set(b, offset); offset += b.length; });
  return out;
}

// ---------- UI helpers ----------
function setLiveStatus(t) { document.getElementById("liveStatus").textContent = t; }
function setLiveDb(db) { document.getElementById("liveDb").textContent = db.toFixed(1); }

function renderLiveResult(res) {
  liveLastResult = res;
  document.getElementById("livePredicted").textContent = res.predicted_class || "-";
  document.getElementById("liveConfidence").textContent =
    res.confidence != null ? (res.confidence * 100).toFixed(2) + "%" : "-";

  const top3El = document.getElementById("liveTop3");
  top3El.innerHTML = "";
  (res.top3 || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between px-3 py-2 rounded-xl border bg-white";
    row.innerHTML = `<div class="font-medium">${item.label}</div>
                     <div class="text-sm text-slate-600">${(item.confidence*100).toFixed(2)}%</div>`;
    top3El.appendChild(row);
  });

  document.getElementById("btnLiveSave").disabled = !liveLastResult;
}

async function sendWavBlob(wavBlob) {

  const fd = new FormData();
  fd.append("audio", wavBlob, "live.wav");

  const res = await fetch("/api/predict-chunk", { method: "POST", body: fd });
  const data = await res.json();

  if (!data.ok) {
    setLiveStatus("Error: " + (data.error || "unknown"));
    toast(data.error || "Prediction error", "error");
    return;
  }

  renderLiveResult(data);
  toast("Sound detected → predicted", "success");
  triggerAlert(data);

  
}

// ---------- Live Trigger Logic ----------
function rmsToDb(rms) {
  // dbFS style (relative), avoid log(0)
  return 20 * Math.log10(rms + 1e-8);
}

async function startLive() {
  if (liveRunning) return;

  try {
    liveStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast("Microphone permission denied.", "error");
    setLiveStatus("Mic permission denied");
    return;
  }

  liveAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  liveSource = liveAudioCtx.createMediaStreamSource(liveStream);

  const bufferSize = 4096;
  liveProcessor = liveAudioCtx.createScriptProcessor(bufferSize, 1, 1);

  aboveSince = null;
  lastTriggerAt = 0;
  captureBuffers = [];
  captureStart = 0;

  liveProcessor.onaudioprocess = async (e) => {
    if (!liveRunning) return;

    const input = e.inputBuffer.getChannelData(0);
    const block = new Float32Array(input); // copy

    // compute RMS -> dB
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    const db = rmsToDb(rms);
    setLiveDb(db);

    const now = performance.now();

    // Cooldown check
    if (now - lastTriggerAt < COOLDOWN_MS) {
      setLiveStatus("Cooldown… listening");
      return;
    }

    // if above threshold, start tracking
    if (db > DB_THRESHOLD) {
      if (aboveSince === null) aboveSince = now;

      // start capture window
      if (captureStart === 0) {
        captureStart = now;
        captureBuffers = [];
      }
      captureBuffers.push(block);

      setLiveStatus("Sound detected… capturing");

      // trigger only if sustained above threshold
      if (now - aboveSince >= MIN_TRIGGER_MS) {
        // capture until CAPTURE_MS then send
        if (now - captureStart >= CAPTURE_MS) {
          lastTriggerAt = now;
          aboveSince = null;

          const samples = concatFloat32(captureBuffers);
          captureBuffers = [];
          captureStart = 0;

          setLiveStatus("Predicting…");
          const wavBlob = encodeWAV(samples, liveAudioCtx.sampleRate);
          await sendWavBlob(wavBlob);

          setLiveStatus("Listening for sound…");
        }
      }
    } else {
      // below threshold
      aboveSince = null;

      // reset capture if it was too short / no longer needed
      if (captureStart !== 0 && now - captureStart > CAPTURE_MS) {
        captureStart = 0;
        captureBuffers = [];
      }

      setLiveStatus("Listening for sound…");
    }
  };

  liveSource.connect(liveProcessor);
  liveProcessor.connect(liveAudioCtx.destination);

  liveRunning = true;

  document.getElementById("btnLiveStart").disabled = true;
  document.getElementById("btnLiveStop").disabled = false;
  document.getElementById("btnLiveSave").disabled = true;

  setLiveStatus("Listening for sound…");
  toast("Live Prediction started", "success");
}

async function stopLive() {
  if (!liveRunning) return;
  liveRunning = false;

  try { liveProcessor.disconnect(); } catch {}
  try { liveSource.disconnect(); } catch {}
  try { liveStream.getTracks().forEach(t => t.stop()); } catch {}
  try { await liveAudioCtx.close(); } catch {}

  liveProcessor = null;
  liveSource = null;
  liveStream = null;
  liveAudioCtx = null;

  document.getElementById("btnLiveStart").disabled = false;
  document.getElementById("btnLiveStop").disabled = true;
  document.getElementById("btnLiveSave").disabled = !liveLastResult;

  setLiveStatus("Stopped");
  toast("Live Prediction stopped", "success");
}

async function saveLiveEvent() {
  if (!liveLastResult) return;

  const res = await fetch("/api/save-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      predicted_class: liveLastResult.predicted_class,
      confidence: liveLastResult.confidence,
      probs: liveLastResult.probs
    })
  });

  const data = await res.json();
  if (!data.ok) {
    toast(data.error || "Save failed", "error");
    return;
  }
  toast("Saved to History", "success");
  document.getElementById("btnLiveSave").disabled = true;
}

// init
window.addEventListener("DOMContentLoaded", () => {
  // tab switching
  tabLive().addEventListener("click", () => setTab("live"));
  tabMic().addEventListener("click", () => setTab("mic"));
  tabFile().addEventListener("click", () => setTab("file"));

  // live buttons
  document.getElementById("btnLiveStart").addEventListener("click", startLive);
  document.getElementById("btnLiveStop").addEventListener("click", stopLive);
  document.getElementById("btnLiveSave").addEventListener("click", saveLiveEvent);

  document.getElementById("btnLiveStop").disabled = true;
  document.getElementById("btnLiveSave").disabled = true;

  // default tab
  setTab("live");
});

// ===== ALERT SYSTEM =====
let alertActive = false;
let alertCooldown = false;

function triggerAlert(data) {
  if (alertActive || alertCooldown) return;

  const dangerousClasses = ["scream", "gunshot", "glass_breaking"];

  if (
    
    dangerousClasses.includes(data.predicted_class.toLowerCase()) &&
    data.confidence >= 0.7
  ) {
    alertActive = true;

    // Split screen
    document.getElementById("mainContainer").classList.add("split-active");

    // Show SOS panel
    const sosPanel = document.getElementById("sosPanel");
    sosPanel.classList.remove("hidden");

    // Update text
    document.getElementById("alertText").innerText =
      data.predicted_class.toUpperCase() + " DETECTED!";

    // Play alarm
    const alarm = document.getElementById("alarmSound");

    if (alarm) {
       alarm.currentTime = 0;   // restart sound every time
       alarm.loop = true;       // keep playing
       alarm.play();
    }

    // cooldown
    alertCooldown = true;
    setTimeout(() => {
      alertCooldown = false;
    }, 10000);
  }
}

function stopAlert() {
  alertActive = false;

  document.getElementById("mainContainer").classList.remove("split-active");
  document.getElementById("sosPanel").classList.add("hidden");

  const alarm = document.getElementById("alarmSound");
  alarm.pause();
  alarm.currentTime = 0;
}
