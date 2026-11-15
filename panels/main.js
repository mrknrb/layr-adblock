// Ad blocker panel: configures layr's request blocker (core methods adblock.*, permission "adblock") and shows its
// counters (event layr:adblock). See docs/ARCHITECTURE.md › Web panels › Ad blocking.
const layr = window.layr;
const $ = (id) => document.getElementById(id);

let state = null;

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const num = (n) => Number(n || 0).toLocaleString();

function when(ms) {
  if (!ms) return "not downloaded yet";
  const d = new Date(ms);
  return "updated " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The page counted last: what "blocked on this page" means here (the newest page load). */
function currentPage(s) {
  return (s.pages || []).find((p) => p.host) || null;
}

function render(s) {
  state = s;
  $("enabled").checked = !!s.enabled;
  $("enabled").disabled = false;
  $("shield").classList.toggle("off", !s.enabled);
  $("total").textContent = num(s.total);
  $("rules").textContent = num(s.rules);
  const page = currentPage(s);
  let summary = s.enabled ? "On in every web panel" : "Off: nothing is blocked";
  if (s.fallback) summary += " · using the small built-in list until the lists download";
  if (s.updating) summary += " · downloading lists…";
  $("summary").textContent = summary;

  const pages = (s.pages || []).filter((p) => p.host);
  $("pagesEmpty").hidden = pages.length > 0;
  $("pages").innerHTML = pages
    .map(
      (p) => `<li>
        <div class="main"><div>${esc(p.host)}</div><div class="layr-muted small">${esc(p.url)}</div></div>
        <span class="count" title="Blocked on this page">${num(p.blocked)}</span>
        <button class="layr-button small ${p.allowed ? "active" : ""}" data-pause="${esc(p.host)}"
          data-allowed="${p.allowed ? 1 : 0}">${p.allowed ? "Paused" : "Pause here"}</button>
      </li>`,
    )
    .join("");

  $("allow").innerHTML = (s.allow || [])
    .map(
      (h) => `<li><div class="main"><div>${esc(h)}</div></div>
        <button class="layr-button small ghost" data-unpause="${esc(h)}">Block again</button></li>`,
    )
    .join("");

  const builtIn = new Set(["easylist", "easyprivacy"]);
  $("lists").innerHTML = (s.lists || [])
    .map(
      (l) => `<li>
        <input type="checkbox" data-list="${esc(l.id)}" ${l.enabled ? "checked" : ""} title="Use this list" />
        <div class="main"><div>${esc(l.name)}</div>
          <div class="layr-muted small">${l.rules ? num(l.rules) + " rules · " : ""}${esc(when(l.updatedAt))}${
            l.error ? ` · <span class="layr-error">${esc(l.error)}</span>` : ""
          }</div></div>
        ${builtIn.has(l.id) ? "" : `<button class="layr-button small ghost" data-remove="${esc(l.id)}">Remove</button>`}
      </li>`,
    )
    .join("");

  // The status bar item: blocked on the newest page, and in all.
  const text = page && s.enabled ? `${num(page.blocked)} blocked` : s.enabled ? "On" : "Off";
  const tooltip = s.enabled
    ? `Ad blocker: ${page ? `${num(page.blocked)} blocked on ${page.host}, ` : ""}${num(s.total)} in all`
    : "Ad blocker is off";
  if (text !== lastStatus) {
    lastStatus = text;
    layr.statusBar?.set("blocked", { text, tooltip }).catch(() => {});
  }
}
let lastStatus = null;

async function call(method, params) {
  try {
    render(await layr.call(method, params || {}));
  } catch (e) {
    layr.ui.notify(String(e.message || e), "error");
  }
}

function lists() {
  return (state?.lists || []).map(({ id, name, url, enabled }) => ({ id, name, url, enabled }));
}

$("enabled").onchange = (e) => call("adblock.configure", { enabled: e.target.checked });
$("refresh").onclick = async () => {
  $("refresh").disabled = true;
  await call("adblock.refresh");
  $("refresh").disabled = false;
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.pause) call("adblock.allow", { host: b.dataset.pause, allowed: b.dataset.allowed !== "1" });
  if (b.dataset.unpause) call("adblock.allow", { host: b.dataset.unpause, allowed: false });
  if (b.dataset.remove) call("adblock.configure", { lists: lists().filter((l) => l.id !== b.dataset.remove) });
});
document.addEventListener("change", (e) => {
  const id = e.target.dataset?.list;
  if (!id) return;
  call("adblock.configure", { lists: lists().map((l) => (l.id === id ? { ...l, enabled: e.target.checked } : l)) });
});

$("allowForm").onsubmit = (e) => {
  e.preventDefault();
  const host = $("allowHost").value.trim();
  if (!host) return;
  $("allowHost").value = "";
  call("adblock.allow", { host, allowed: true });
};

$("listForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("listName").value.trim();
  const url = $("listUrl").value.trim();
  if (!name || !/^https?:\/\//.test(url)) return layr.ui.notify("A name and an http(s) address", "error");
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "list";
  while (lists().some((l) => l.id === id)) id += "-2";
  $("listName").value = $("listUrl").value = "";
  call("adblock.configure", { lists: [...lists(), { id, name, url, enabled: true }] });
};

await layr.ready;
layr.events.on("layr:adblock", render);
await call("adblock.state");
