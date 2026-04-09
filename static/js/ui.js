function toast(message, type="info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.className = "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow text-white transition";
  el.style.opacity = 1;
  el.textContent = message;

  if (type === "success") el.classList.add("bg-emerald-600");
  else if (type === "error") el.classList.add("bg-rose-600");
  else el.classList.add("bg-slate-700");

  setTimeout(() => { el.style.opacity = 0; }, 2500);
}
