// Cachy Chat — plain HTML/CSS/JS, no build step. Talks to OpenRouter straight from the browser.
const $ = s => document.querySelector(s);
const DEF = { key: "", model: "nvidia/nemotron-3-ultra-550b-a55b", temperature: 0.7, maxTokens: 4096, system: "You are a precise, concise assistant." };
const uid = () => Math.random().toString(36).slice(2, 10);
const fresh = () => ({ id: uid(), title: "New chat", messages: [] });
let convs = [], active = "", cfg = { ...DEF }, busy = false, ctrl = null;

try { convs = JSON.parse(localStorage.getItem("cc.convs") || "[]"); cfg = { ...DEF, ...JSON.parse(localStorage.getItem("cc.cfg") || "{}") }; } catch {}
if (!convs.length) convs = [fresh()];
active = convs[0].id;
const save = () => { try { localStorage.setItem("cc.convs", JSON.stringify(convs)); localStorage.setItem("cc.cfg", JSON.stringify(cfg)); } catch {} };
const conv = () => convs.find(c => c.id === active) || convs[0];
const md = t => DOMPurify.sanitize(marked.parse(t || ""));
const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const time = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function showErr(t) { const e = $("#err"); e.textContent = t || ""; e.hidden = !t; }

function renderList() {
  $("#list").innerHTML = convs.map(c => `<div class="item ${c.id === active ? "on" : ""}" data-id="${c.id}"><span>${esc(c.title)}</span><button data-del="${c.id}" aria-label="Delete chat">✕</button></div>`).join("");
}

function bubble(m, i, last) {
  const d = document.createElement("div");
  d.className = "msg " + m.role;
  const acts = `<button class="ib" data-a="copy">Copy</button>` +
    (m.role === "user" ? `<button class="ib" data-a="edit">Edit</button>` : "") +
    (m.role === "assistant" && last && !busy ? `<button class="ib" data-a="regen">Regenerate</button>` : "");
  d.innerHTML = `<div class="bubble glass" data-i="${i}"><div class="meta">${m.role === "user" ? "You" : `<span class="m">${esc((m.model || "").split("/").pop())}</span>`}<span>${time(m.ts)}</span></div><div class="body"></div><div class="acts">${acts}</div></div>`;
  const body = d.querySelector(".body");
  if (m.role === "user") body.innerHTML = `<p>${esc(m.content).replace(/\n/g, "<br>")}</p>`;
  else body.innerHTML = m.content ? md(m.content) : `<div class="shimmer" aria-label="Thinking"></div>`;
  return d;
}

function renderMsgs() {
  const c = conv();
  $("#hero").hidden = c.messages.length > 0;
  const box = $("#msgs"); box.innerHTML = "";
  c.messages.forEach((m, i) => box.appendChild(bubble(m, i, i === c.messages.length - 1)));
  $("#scroll").scrollTop = $("#scroll").scrollHeight;
}
function render() { renderList(); renderMsgs(); const b = $("#send"); b.textContent = busy ? "■" : "➤"; b.classList.toggle("stop", busy); }

async function send(history) {
  if (!cfg.key) { openSettings(); showErr("Add your OpenRouter API key in Settings to start chatting."); return; }
  showErr(""); busy = true;
  const c = conv();
  const reply = { role: "assistant", content: "", ts: Date.now(), model: cfg.model };
  c.messages = [...history, reply]; render();
  ctrl = new AbortController();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: "Bearer " + cfg.key, "Content-Type": "application/json", "X-Title": "Cachy Chat" },
      body: JSON.stringify({ model: cfg.model, stream: true, temperature: cfg.temperature, max_tokens: cfg.maxTokens,
        messages: [{ role: "system", content: cfg.system }, ...history.map(({ role, content }) => ({ role, content }))] })
    });
    if (!res.ok || !res.body) {
      const s = res.status;
      throw new Error(s === 401 ? "OpenRouter rejected the API key. Check it in Settings." : s === 429 ? "Rate limit reached. Wait a moment, then press Regenerate." : s === 402 ? "Out of OpenRouter credits. Top up your account." : `Request failed (${s}).`);
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const l of lines) {
        if (!l.startsWith("data: ") || l.includes("[DONE]")) continue;
        try { text += JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? ""; } catch {}
      }
      reply.content = text;
      const last = $("#msgs").lastElementChild; if (last) last.querySelector(".body").innerHTML = md(text);
      $("#scroll").scrollTop = $("#scroll").scrollHeight;
    }
  } catch (e) { if (e.name !== "AbortError") showErr(e.message || "Something went wrong."); }
  busy = false; save(); render();
}

function submit() {
  const t = $("#input").value.trim(); if (!t || busy) return;
  const c = conv();
  if (!c.messages.length) c.title = t.slice(0, 40);
  $("#input").value = ""; $("#input").style.height = "auto";
  send([...c.messages, { role: "user", content: t, ts: Date.now() }]);
}
const newChat = () => { const f = fresh(); convs.unshift(f); active = f.id; showErr(""); $("#side").classList.remove("open"); save(); render(); $("#input").focus(); };
const stop = () => ctrl && ctrl.abort();

// Events
$("#send").onclick = () => busy ? stop() : submit();
$("#input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
$("#input").addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; });
$("#new").onclick = newChat;
$("#rail").onclick = () => $("#side").classList.toggle("collapsed");
$("#menu").onclick = () => $("#side").classList.toggle("open");
$("#list").onclick = e => {
  const del = e.target.closest("[data-del]"), it = e.target.closest(".item");
  if (del) { convs = convs.filter(c => c.id !== del.dataset.del); if (!convs.length) convs = [fresh()]; if (!convs.find(c => c.id === active)) active = convs[0].id; }
  else if (it) { active = it.dataset.id; $("#side").classList.remove("open"); }
  else return;
  save(); render();
};
$("#msgs").onclick = e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const c = conv(), i = +b.closest(".bubble").dataset.i, m = c.messages[i];
  if (b.dataset.a === "copy") { navigator.clipboard.writeText(m.content); b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1200); }
  if (b.dataset.a === "regen" && !busy) send(c.messages.slice(0, -1));
  if (b.dataset.a === "edit") {
    const body = b.closest(".bubble").querySelector(".body");
    body.innerHTML = `<textarea rows="3">${esc(m.content)}</textarea><div class="acts" style="opacity:1"><button class="ib" data-a="cancel">Cancel</button><button class="ib" data-a="save">Save & resend</button></div>`;
  }
  if (b.dataset.a === "cancel") renderMsgs();
  if (b.dataset.a === "save") { const v = b.closest(".body").querySelector("textarea").value.trim(); if (v && !busy) send([...c.messages.slice(0, i), { ...m, content: v }]); }
};
$("#export").onclick = () => {
  const c = conv();
  const out = `# ${c.title}\n\n` + c.messages.map(m => `**${m.role === "user" ? "You" : m.model}**\n\n${m.content}`).join("\n\n---\n\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "text/markdown" })); a.download = c.title + ".md"; a.click();
};

// Settings
function openSettings() { $("#key").value = cfg.key; $("#model").value = cfg.model; $("#temp").value = cfg.temperature; $("#tval").textContent = cfg.temperature; $("#maxt").value = cfg.maxTokens; $("#sys").value = cfg.system; $("#modal").hidden = false; }
function closeSettings() { $("#modal").hidden = true; }
$("#open-settings").onclick = openSettings; $("#close-settings").onclick = closeSettings;
$("#modal").onclick = e => { if (e.target.id === "modal") closeSettings(); };
$("#showkey").onclick = () => { const k = $("#key"); k.type = k.type === "password" ? "text" : "password"; };
$("#key").oninput = e => { cfg.key = e.target.value.trim(); save(); };
$("#model").oninput = e => { cfg.model = e.target.value.trim() || DEF.model; save(); };
$("#temp").oninput = e => { cfg.temperature = +e.target.value; $("#tval").textContent = cfg.temperature; save(); };
$("#maxt").oninput = e => { cfg.maxTokens = +e.target.value || DEF.maxTokens; save(); };
$("#sys").oninput = e => { cfg.system = e.target.value; save(); };
$("#clear").onclick = () => { if (confirm("Clear this chat?")) { const c = conv(); c.messages = []; c.title = "New chat"; save(); render(); closeSettings(); } };

// Shortcuts + pointer glow
addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); newChat(); }
  if (e.key === "Escape") { stop(); closeSettings(); }
});
addEventListener("pointermove", e => { const s = document.documentElement.style; s.setProperty("--mx", e.clientX + "px"); s.setProperty("--my", e.clientY + "px"); });

render();
if (!cfg.key) openSettings();
