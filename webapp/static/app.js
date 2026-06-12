// ---------------------------------------------------------------------------
// Brain Function Visualisation — frontend
// Talks to the backend purely over JSON (SSE stream of normalized snapshots).
// ---------------------------------------------------------------------------
const state = { mode: "broadcast", busy: false, es: null };

const el = (id) => document.getElementById(id);
const chatArea = el("chatArea");
const sidebarBody = el("sidebarBody");
const sidebarTitle = el("sidebarTitle");
const legend = el("legend");
const terminalBody = el("terminalBody");
const input = el("queryInput");

// Color palette keyed by the level-2 brain division (for hierarchy mode).
const ROOT_COLORS = {
  prosencephalon: "#5b8cff",
  rhombencephalon: "#38d39f",
  midbrain: "#ffb454",
};
function rootColor(root) {
  return ROOT_COLORS[(root || "").toLowerCase()] || "#9b6bff";
}
// Mix a base color toward white by amount (0..1) — brighter = higher confidence.
function brighten(hex, amount) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const mix = (x) => Math.round(x + (255 - x) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// ---------------------------------------------------------------------------
// Mode switch
// ---------------------------------------------------------------------------
el("modeSwitch").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn || state.busy) return;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.mode = btn.dataset.mode;
  sidebarTitle.textContent = state.mode === "hierarchy" ? "Hierarchical Activation" : "Active Regions";
  legend.textContent = state.mode === "hierarchy" ? "top-down routing" : "brightness = confidence";
  sidebarBody.innerHTML = `<div class="empty-hint">Mode: <b>${state.mode}</b>. Ask something to begin.</div>`;
});

// ---------------------------------------------------------------------------
// Examples + composer
// ---------------------------------------------------------------------------
el("examples")?.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") { input.value = e.target.textContent; submit(); }
});
el("composer").addEventListener("submit", (e) => { e.preventDefault(); submit(); });

function submit() {
  const q = input.value.trim();
  if (!q || state.busy) return;
  input.value = "";
  document.querySelector(".welcome")?.remove();
  addUserMessage(q);
  runQuery(q);
}

// ---------------------------------------------------------------------------
// Run a query via SSE
// ---------------------------------------------------------------------------
function runQuery(query) {
  state.busy = true;
  el("sendBtn").disabled = true;
  terminalBody.textContent = "";
  sidebarBody.innerHTML = "";

  const pending = addAssistantPending();
  const url = `/api/stream?query=${encodeURIComponent(query)}&mode=${state.mode}`;
  const es = new EventSource(url);
  state.es = es;

  es.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.event === "step") {
      logStep(data);
      renderSidebar(data.snapshot);
    } else if (data.event === "done") {
      renderAnswer(pending, data.result);
      finish();
    } else if (data.event === "error") {
      pending.querySelector(".bubble").innerHTML = `<span style="color:#ff7a7a">Error: ${escapeHtml(data.message)}</span>`;
      finish();
    }
  };
  es.onerror = () => {
    // Stream closed (or failed). If we never finished, surface it.
    if (state.busy) {
      pending.querySelector(".bubble").innerHTML =
        `<span style="color:#ff7a7a">Connection to the brain network was interrupted.</span>`;
      finish();
    }
  };
}

function finish() {
  state.busy = false;
  el("sendBtn").disabled = false;
  if (state.es) { state.es.close(); state.es = null; }
}

// ---------------------------------------------------------------------------
// Terminal log
// ---------------------------------------------------------------------------
function logStep(data) {
  const s = data.snapshot;
  appendTerminal(`> ${data.label}`, "t-node");
  if (s.mode === "hierarchy" && data.node === "route") {
    (s.routing_path || []).forEach((e) =>
      appendTerminal(`    ${e.parent} → ${e.child}  (${(e.confidence ?? 0).toFixed(2)})`, "t-route"));
    (s.activated_regions || []).forEach((a) =>
      appendTerminal(`  ✦ ACTIVATE  ${a.path.join(" → ")}`, "t-activate"));
  }
  if (s.mode === "broadcast" && data.node === "parallel_eval") {
    const inv = (s.regions || []).filter((r) => r.involved).length;
    appendTerminal(`    ${inv} regions self-reported involved`, "t-route");
  }
  if (s.mode === "broadcast" && data.node === "region_selector") {
    appendTerminal(`    active: ${(s.active_regions || []).join(", ") || "none"}`, "t-activate");
  }
}
function appendTerminal(text, cls) {
  const span = document.createElement("span");
  span.className = cls || "";
  span.textContent = text + "\n";
  terminalBody.appendChild(span);
  terminalBody.parentElement.scrollTop = terminalBody.parentElement.scrollHeight;
}

// ---------------------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------------------
function renderSidebar(snapshot) {
  if (snapshot.mode === "hierarchy") renderTree(snapshot);
  else renderChips(snapshot);
}

// Broadcast: chips, brightness ∝ confidence, dim until activated.
function renderChips(s) {
  const regions = s.regions || [];
  if (!regions.length) return;
  const grid = document.createElement("div");
  grid.className = "region-grid";
  regions.forEach((r) => {
    const chip = document.createElement("div");
    chip.className = "region-chip" + (r.activated ? " activated" : "");
    const amount = Math.max(0, Math.min(1, r.confidence));
    const color = brighten("#5b8cff", 0.15 + amount * 0.5);
    chip.innerHTML = `
      <span class="region-dot" style="background:${color};
        box-shadow:${r.activated ? `0 0 ${4 + amount * 12}px ${color}` : "none"}"></span>
      <span class="region-name" title="${escapeHtml(r.reasoning || "")}">${escapeHtml(r.name)}</span>
      <span class="region-conf">${r.confidence.toFixed(2)}</span>`;
    grid.appendChild(chip);
  });
  sidebarBody.innerHTML = "";
  sidebarBody.appendChild(grid);
}

// Hierarchy: animated top-down tree built from nodes + edges.
function renderTree(s) {
  const nodes = s.nodes || [];
  const edges = s.edges || [];
  if (!nodes.length) return;

  // Index + children map.
  const byId = {};
  nodes.forEach((n) => (byId[n.id] = { ...n, children: [] }));
  const childIds = new Set();
  edges.forEach((e) => {
    if (byId[e.from] && byId[e.to]) { byId[e.from].children.push(e.to); childIds.add(e.to); }
  });
  const roots = nodes.filter((n) => !childIds.has(n.id)).map((n) => byId[n.id]);

  // Tidy layout: leaves take sequential x slots, parents centre over children.
  const xGap = 150, yGap = 78, padX = 70, padY = 40;
  let leafX = 0;
  function layout(node) {
    node.y = padY + (node.level - 1) * yGap;
    if (!node.children.length) { node.x = padX + leafX * xGap; leafX++; return; }
    node.children.forEach((cid) => layout(byId[cid]));
    const xs = node.children.map((cid) => byId[cid].x);
    node.x = (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  roots.forEach(layout);

  const maxLevel = Math.max(...nodes.map((n) => n.level));
  const width = padX * 2 + Math.max(1, leafX) * xGap;
  const height = padY * 2 + (maxLevel - 1) * yGap + 30;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "treeSvg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  // Edges.
  edges.forEach((e) => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return;
    const path = document.createElementNS(svgNS, "path");
    const midY = (a.y + b.y) / 2;
    path.setAttribute("d", `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`);
    path.setAttribute("class", "tree-edge");
    path.dataset.level = b.level;
    svg.appendChild(path);
  });

  // Nodes.
  nodes.forEach((n) => {
    const node = byId[n.id];
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "tree-node dim");
    g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
    g.dataset.level = n.level;

    const conf = Math.max(0, Math.min(1, n.confidence));
    const color = brighten(rootColor(n.root), 0.1 + conf * 0.5);
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", n.terminal ? 9 : 6);
    circle.setAttribute("fill", color);
    circle.setAttribute("stroke", n.terminal ? "#fff" : "none");
    circle.setAttribute("stroke-width", n.terminal ? "1.5" : "0");
    g.appendChild(circle);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("y", -12);
    label.setAttribute("text-anchor", "middle");
    label.textContent = n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name;
    const t = document.createElementNS(svgNS, "title");
    t.textContent = `${n.name} (conf ${n.confidence.toFixed(2)})` + (n.report ? `\n${n.report}` : "");
    g.appendChild(t);
    g.appendChild(label);

    const sub = document.createElementNS(svgNS, "text");
    sub.setAttribute("y", 20); sub.setAttribute("text-anchor", "middle");
    sub.setAttribute("class", "node-sub");
    sub.textContent = n.confidence.toFixed(2);
    g.appendChild(sub);

    svg.appendChild(g);
  });

  const wrap = document.createElement("div");
  wrap.className = "tree-wrap";
  wrap.appendChild(svg);
  sidebarBody.innerHTML = "";
  sidebarBody.appendChild(wrap);

  // Animate reveal level by level ("first A, then what it activates…").
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    setTimeout(() => {
      svg.querySelectorAll(`.tree-node[data-level="${lvl}"]`).forEach((g) => {
        g.classList.remove("dim"); g.classList.add("lit");
      });
      svg.querySelectorAll(`.tree-edge[data-level="${lvl}"]`).forEach((p) => p.classList.add("lit"));
    }, lvl * 320);
  }
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------
function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatArea.appendChild(div);
  scrollChat();
}
function addAssistantPending() {
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.innerHTML = `<div class="bubble"><span class="spinner"></span> the network is reasoning…</div>`;
  chatArea.appendChild(div);
  scrollChat();
  return div;
}
function renderAnswer(container, result) {
  const c = result.consensus || {};
  const answer = (c.network_decision && c.network_decision.answer) || "";
  const narrative = result.final_answer || "(no narrative)";

  let html = `<div class="answer-narrative">${escapeHtml(narrative)}</div>`;
  if (answer) html = `<div style="font-weight:600;margin-bottom:8px">${escapeHtml(answer)}</div>` + html;

  // Collapsible JSON sections (the JSON contract, on display).
  if (result.mode === "hierarchy") {
    html += section("Routing path (JSON)", result.routing_path);
    html += section("Activated regions (JSON)", result.activated_regions);
  } else {
    html += section("Region votes (JSON)", result.regions);
  }
  html += section("Consensus (JSON)", result.consensus);

  container.querySelector(".bubble").innerHTML = html;
  scrollChat();
}
function section(title, obj) {
  return `<details class="section"><summary>${escapeHtml(title)}</summary>
    <pre>${escapeHtml(JSON.stringify(obj, null, 2))}</pre></details>`;
}
function scrollChat() { chatArea.scrollTop = chatArea.scrollHeight; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------------------
// Panel controls: hide toggles + resizer
// ---------------------------------------------------------------------------
el("toggleSidebar").addEventListener("click", (e) => {
  el("sidebar").classList.toggle("hidden");
  el("resizer").classList.toggle("hidden");
  e.currentTarget.classList.toggle("off");
});
el("toggleTerminal").addEventListener("click", (e) => {
  el("terminal").classList.toggle("hidden");
  e.currentTarget.classList.toggle("off");
});
el("clearTerminal").addEventListener("click", () => (terminalBody.textContent = ""));

(function enableResize() {
  const resizer = el("resizer"), sidebar = el("sidebar");
  let dragging = false;
  resizer.addEventListener("mousedown", () => { dragging = true; document.body.style.userSelect = "none"; });
  window.addEventListener("mouseup", () => { dragging = false; document.body.style.userSelect = ""; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.max(220, Math.min(620, e.clientX));
    sidebar.style.width = w + "px";
  });
})();
