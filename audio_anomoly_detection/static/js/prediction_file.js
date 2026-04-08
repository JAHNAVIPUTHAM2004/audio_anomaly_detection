let lastFileResult = null;

function renderFileResult(res) {
  lastFileResult = res;

  document.getElementById("filePredicted").textContent = res.predicted_class || "-";
  document.getElementById("fileConfidence").textContent =
    res.confidence != null ? (res.confidence * 100).toFixed(2) + "%" : "-";

  const top3El = document.getElementById("fileTop3");
  top3El.innerHTML = "";
  (res.top3 || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between px-3 py-2 rounded-xl border bg-white";
    row.innerHTML = `<div class="font-medium">${item.label}</div>
                     <div class="text-sm text-slate-600">${(item.confidence * 100).toFixed(2)}%</div>`;
    top3El.appendChild(row);
  });

  document.getElementById("btnFileSave").disabled = !lastFileResult;
}

async function predictFile() {
  const input = document.getElementById("audioFile");
  const file = input.files && input.files[0];
  const status = document.getElementById("fileStatus");

  if (!file) {
    toast("Please choose an audio file.", "error");
    status.textContent = "No file selected";
    return;
  }

  status.textContent = "Uploading & predicting…";

  const fd = new FormData();
  fd.append("audio", file, file.name);

  let res, data;
  try {
    res = await fetch("/api/predict-file", { method: "POST", body: fd });
    data = await res.json();
  } catch (e) {
    status.textContent = "Network error";
    toast("Network error", "error");
    return;
  }

  if (!data.ok) {
    status.textContent = "Error: " + (data.error || "unknown");
    toast(data.error || "Prediction failed", "error");
    return;
  }

  status.textContent = "Done";
  toast("Prediction completed", "success");
  renderFileResult(data);
}

async function saveFileEvent() {
  if (!lastFileResult) return;

  const res = await fetch("/api/save-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      predicted_class: lastFileResult.predicted_class,
      confidence: lastFileResult.confidence,
      probs: lastFileResult.probs
    })
  });

  const data = await res.json();
  if (!data.ok) {
    toast(data.error || "Save failed", "error");
    return;
  }

  toast("Saved to History", "success");
  document.getElementById("btnFileSave").disabled = true;
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnFilePredict").addEventListener("click", predictFile);
  document.getElementById("btnFileSave").addEventListener("click", saveFileEvent);

  document.getElementById("btnFileSave").disabled = true;
});