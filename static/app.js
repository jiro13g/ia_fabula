(() => {
  "use strict";

  /* ================= utilidades ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Escapa texto antes de meterlo en innerHTML (evita inyección de HTML desde resultados web).
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => {
    try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; }
    catch { return ""; }
  };
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
  };

  const el = {
    form: $("#searchForm"), input: $("#query"), clear: $("#clearBtn"), go: $("#searchBtn"),
    pill: $("#statusPill"), rotator: $("#rotator"),
    suggestions: $("#suggestions"), recent: $("#recent"),
    results: $("#results"), loader: $("#loader"), loaderText: $("#loaderText"), content: $("#content"),
    side: $("#side"),
    answer: $("#answer"), notes: $("#notes"), modelTag: $("#modelTag"),
    voice: $("#voiceBtn"), voiceLabel: $("#voiceLabel"), copy: $("#copyBtn"), skip: $("#skipBtn"),
    relatedGallery: $("#relatedGallery"), genGallery: $("#genGallery"), genForm: $("#genForm"), genPrompt: $("#genPrompt"), genStyle: $("#genStyle"), genBtn: $("#genBtn"), followups: $("#followups"), audioList: $("#audioList"), webList: $("#webList"), memoryList: $("#memoryList"),
    lb: $("#lightbox"), lbImg: $("#lbImg"), lbCaption: $("#lbCaption"), toast: $("#toast"),
  };

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  /* ================= fondo: luciérnagas ================= */
  function initBackground() {
    const c = $("#bg"), ctx = c.getContext("2d");
    let W, H, dpr, flies = [];
    const mouse = { x: -9999, y: -9999 };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(28, Math.min(85, Math.round((W * H) / 18000)));
      flies = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + .6,
        vx: (Math.random() - .5) * .25, vy: -Math.random() * .25 - .05,
        ph: Math.random() * 6.28, hue: [165, 255, 200, 45][Math.floor(Math.random() * 4)],
      }));
    }

    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (const f of flies) {
        const dx = f.x - mouse.x, dy = f.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 14000) { const k = 1 - d2 / 14000; f.x += dx * .02 * k; f.y += dy * .02 * k; }
        f.x += f.vx + Math.sin(t / 1800 + f.ph) * .15;
        f.y += f.vy;
        if (f.y < -10) { f.y = H + 10; f.x = Math.random() * W; }
        if (f.x < -10) f.x = W + 10; else if (f.x > W + 10) f.x = -10;
        const a = .35 + .65 * Math.abs(Math.sin(t / 1200 + f.ph));
        ctx.fillStyle = `hsla(${f.hue},90%,75%,${a * .18})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 4, 0, 6.283); ctx.fill();
        ctx.fillStyle = `hsla(${f.hue},95%,88%,${a})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
    }
    function loop(t) { if (!document.hidden) frame(t); requestAnimationFrame(loop); }

    addEventListener("resize", resize);
    addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    resize();
    if (reduceMotion) frame(0); else requestAnimationFrame(loop);
  }

  /* ================= efecto de luz en elementos .glow ================= */
  document.addEventListener("pointermove", e => {
    const g = e.target.closest && e.target.closest(".glow");
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty("--mx", (e.clientX - r.left) + "px");
    g.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  /* ================= cabecera, sugerencias y recientes ================= */
  const WORDS = ["historia", "fábula", "imagen", "melodía", "moraleja", "leyenda"];
  function initRotator() {
    if (reduceMotion) return;
    let i = 0;
    setInterval(() => {
      el.rotator.classList.add("out");
      setTimeout(() => {
        i = (i + 1) % WORDS.length;
        el.rotator.textContent = WORDS[i];
        el.rotator.classList.remove("out");
      }, 350);
    }, 2600);
  }

  const IDEAS = ["🐢 La tortuga y la liebre", "🐉 Un dragón sabio", "🌲 El sonido del bosque", "🌧️ Lluvia sobre un tejado", "🦊 El zorro y las uvas", "🌌 Una leyenda de las estrellas"];
  function renderSuggestions() {
    el.suggestions.innerHTML = "";
    IDEAS.forEach((txt, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = txt;
      b.style.animationDelay = (i * 70) + "ms";
      b.addEventListener("click", () => runSearch(txt.replace(/^\S+\s/, "")));
      el.suggestions.appendChild(b);
    });
  }

  function renderRecent() {
    const list = store.get("fabula_recent", []);
    el.recent.innerHTML = "";
    el.recent.classList.toggle("hidden", !list.length);
    list.forEach(q => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = "🕘 " + q;
      b.addEventListener("click", () => runSearch(q));
      el.recent.appendChild(b);
    });
  }
  function saveRecent(q) {
    const list = [q, ...store.get("fabula_recent", []).filter(x => x !== q)].slice(0, 5);
    store.set("fabula_recent", list);
    renderRecent();
  }

  /* ================= navegación lateral ================= */
  let current = { query: "", answer: "", spoken: "" };
  const loaded = { imagenes: "", audio: "" };   // última consulta ya cargada en cada panel

  function setTab(name) {
    $$(".nav", el.side).forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-current", on ? "true" : "false");
    });
    $$(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));
    if (name === "imagenes") loadRelated();
    else if (name === "audio") loadAudio();
    else if (name === "generar" && !el.genPrompt.value) el.genPrompt.value = current.query;
  }
  el.side.addEventListener("click", e => {
    const t = e.target.closest(".nav");
    if (t) setTab(t.dataset.tab);
  });

  /* ================= Markdown básico y seguro ================= */
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  }
  function renderMarkdown(src) {
    let out = "", inList = false, para = [];
    const flush = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } };
    const closeList = () => { if (inList) { out += "</ul>"; inList = false; } };
    for (const raw of String(src).replace(/\r/g, "").split("\n")) {
      const line = raw.trim();
      let m;
      if (!line) { flush(); closeList(); continue; }
      if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); closeList(); out += "<hr>"; continue; }
      if ((m = line.match(/^#{1,6}\s+(.*)/))) { flush(); closeList(); out += `<h4>${inline(m[1])}</h4>`; continue; }
      if ((m = line.match(/^[-*•]\s+(.*)/))) {
        flush();
        if (!inList) { out += "<ul>"; inList = true; }
        out += `<li>${inline(m[1])}</li>`;
        continue;
      }
      closeList(); para.push(line);
    }
    flush(); closeList();
    return out;
  }

  /* ================= efecto máquina de escribir ================= */
  let typingFrame = null, typingState = null;
  function cancelTyping() {
    if (typingFrame) cancelAnimationFrame(typingFrame);
    typingFrame = null;
    if (typingState) typingState.finish();
  }
  function typeInto(target, html, done) {
    cancelTyping();
    target.innerHTML = html;
    if (reduceMotion) { if (done) done(); return; }

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) { nodes.push({ node: n, text: n.nodeValue }); n.nodeValue = ""; }
    const total = nodes.reduce((a, o) => a + o.text.length, 0);
    if (!total) { if (done) done(); return; }

    const speed = Math.max(2, Math.ceil(total / 450));
    let shown = 0;
    target.classList.add("typing");
    el.skip.classList.remove("hidden");

    const finish = () => {
      nodes.forEach(o => { o.node.nodeValue = o.text; });
      target.classList.remove("typing");
      el.skip.classList.add("hidden");
      typingState = null;
      if (done) done();
    };
    typingState = { finish };

    const step = () => {
      shown = Math.min(total, shown + speed);
      let left = shown;
      for (const o of nodes) {
        const k = Math.min(o.text.length, left);
        o.node.nodeValue = o.text.slice(0, k);
        left -= k;
        if (left <= 0) break;
      }
      if (shown >= total) { typingFrame = null; finish(); return; }
      typingFrame = requestAnimationFrame(step);
    };
    typingFrame = requestAnimationFrame(step);
  }
  el.skip.addEventListener("click", cancelTyping);

  /* ================= voz ================= */
  const synth = window.speechSynthesis;
  let speaking = false;
  function setSpeaking(v) {
    speaking = v;
    el.voice.classList.toggle("playing", v);
    el.voiceLabel.textContent = v ? "Detener" : "Escuchar";
  }
  function stopVoice() { if (synth) synth.cancel(); setSpeaking(false); }
  function chunkText(text) {
    const parts = text.match(/[^.!?\n]+[.!?]*\s*/g) || [text];
    const chunks = []; let cur = "";
    for (const p of parts) {
      if ((cur + p).length > 220 && cur) { chunks.push(cur); cur = p; } else cur += p;
    }
    if (cur.trim()) chunks.push(cur);
    return chunks;
  }
  el.voice.addEventListener("click", () => {
    if (!synth) return toast("Tu navegador no soporta lectura en voz alta.");
    if (speaking) return stopVoice();
    if (!current.spoken) return;
    const voice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith("es"));
    const chunks = chunkText(current.spoken);
    chunks.forEach((txt, i) => {
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = "es-ES";
      if (voice) u.voice = voice;
      u.onerror = () => setSpeaking(false);
      if (i === chunks.length - 1) u.onend = () => setSpeaking(false);
      synth.speak(u);
    });
    setSpeaking(true);
  });

  /* ================= copiar ================= */
  el.copy.addEventListener("click", async () => {
    if (!current.answer) return;
    try {
      await navigator.clipboard.writeText(current.answer);
      toast("Respuesta copiada ✨");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = current.answer; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Respuesta copiada ✨"); } catch { toast("No se pudo copiar."); }
      ta.remove();
    }
  });

  /* ================= comunicación con el servidor ================= */
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch { throw new Error("El servidor devolvió una respuesta inválida."); }
    if (!res.ok || data.error) throw new Error(data.error || "Error del servidor.");
    return data;
  }
  const friendly = err => err instanceof TypeError
    ? "No se pudo conectar con el servidor. ¿Sigue ejecutándose `python app.py`?"
    : err.message;
  const skeletons = n => Array.from({ length: n }, () => '<span class="shimmer gallery-skel"></span>').join("");

  /* ================= galerías (relacionadas y generadas) + visor ================= */
  let lbContainer = null, lbIndex = 0;

  function startImage(shot) {
    if (shot.dataset.state === "loading" || shot.dataset.state === "done") return;
    const img = $("img", shot);
    shot.dataset.state = "loading";
    shot.classList.remove("failed");
    const retry = Number(shot.dataset.retry || 0);
    const base = shot.dataset.src;
    const fail = () => {
      clearTimeout(timeout);
      shot.dataset.state = "failed";
      shot.classList.add("failed");
      img.removeAttribute("src");
    };
    const timeout = setTimeout(fail, 100000);
    img.onload = () => { clearTimeout(timeout); shot.dataset.state = "done"; shot.classList.add("loaded"); };
    img.onerror = fail;
    img.src = retry ? base + (base.includes("?") ? "&" : "?") + "retry=" + retry : base;
  }
  const loadImages = container => $$(".shot", container).forEach(startImage);

  function renderGallery(container, images) {
    container.innerHTML = "";
    images.forEach((item, i) => {
      const src = safeUrl(item.image);
      if (!src) return;
      const shot = document.createElement("button");
      shot.type = "button"; shot.className = "shot"; shot.dataset.src = src; shot.dataset.index = i;
      shot.dataset.page = safeUrl(item.page || "");
      shot.innerHTML = `<span class="shimmer"></span><span class="cap">${esc(item.title)}</span><span class="fail">⚠️ No se pudo cargar.<br>Toca para reintentar</span>`;
      const img = new Image(); img.alt = item.title; img.decoding = "async";
      shot.prepend(img);
      shot.addEventListener("click", () => {
        if (shot.dataset.state === "failed") {
          shot.dataset.retry = Number(shot.dataset.retry || 0) + 1;
          shot.dataset.state = ""; startImage(shot);
        } else if (shot.dataset.state === "done") openLightbox(container, shot);
      });
      container.appendChild(shot);
    });
  }

  const loadedShots = () => lbContainer ? $$(".shot.loaded", lbContainer) : [];
  function openLightbox(container, shot) {
    lbContainer = container;
    lbIndex = Math.max(0, loadedShots().indexOf(shot));
    showLightbox();
    el.lb.classList.remove("hidden");
    $("#lbClose").focus();
  }
  function showLightbox() {
    const s = loadedShots()[lbIndex];
    if (!s) return closeLightbox();
    const img = $("img", s);
    el.lbImg.src = img.src; el.lbImg.alt = img.alt;
    el.lbCaption.innerHTML = esc(img.alt) + (s.dataset.page
      ? ` · <a href="${esc(s.dataset.page)}" target="_blank" rel="noopener noreferrer">Ver origen</a>` : "");
  }
  function stepLightbox(d) {
    const n = loadedShots().length;
    if (!n) return;
    lbIndex = (lbIndex + d + n) % n;
    showLightbox();
  }
  function closeLightbox() { el.lb.classList.add("hidden"); el.lbImg.removeAttribute("src"); }
  $("#lbClose").addEventListener("click", closeLightbox);
  $("#lbPrev").addEventListener("click", () => stepLightbox(-1));
  $("#lbNext").addEventListener("click", () => stepLightbox(1));
  el.lb.addEventListener("click", e => { if (e.target === el.lb) closeLightbox(); });

  /* ================= bajo demanda: imágenes relacionadas, audio y generación ================= */
  async function loadRelated() {
    const q = current.query;
    if (!q || loaded.imagenes === q) return;
    loaded.imagenes = q;
    el.relatedGallery.innerHTML = skeletons(6);
    try {
      const data = await postJSON("/api/related-images", { query: q });
      if (current.query !== q) return;
      const images = data.images || [];
      if (!images.length) {
        el.relatedGallery.innerHTML = `<div class="empty">🖼️ No se encontraron imágenes relacionadas.<br>Prueba con <b>Generar imagen</b> para crear una a tu gusto.</div>`;
        return;
      }
      renderGallery(el.relatedGallery, images);
      loadImages(el.relatedGallery);
    } catch (err) {
      loaded.imagenes = "";
      el.relatedGallery.innerHTML = `<div class="empty">⚠️ ${esc(friendly(err))}</div>`;
    }
  }

  async function generate(prompt) {
    prompt = String(prompt || el.genPrompt.value).trim();
    if (!prompt) { toast("Describe la imagen primero ✍️"); el.genPrompt.focus(); return; }
    el.genPrompt.value = prompt;
    el.genBtn.disabled = true;
    el.genGallery.innerHTML = skeletons(3);
    try {
      const data = await postJSON("/api/generate-image", { prompt, style: el.genStyle.value });
      renderGallery(el.genGallery, data.images || []);
      loadImages(el.genGallery);
    } catch (err) {
      el.genGallery.innerHTML = `<div class="empty">⚠️ ${esc(friendly(err))}</div>`;
    } finally {
      el.genBtn.disabled = false;
    }
  }
  el.genForm.addEventListener("submit", e => { e.preventDefault(); generate(); });

  async function loadAudio() {
    const q = current.query;
    if (!q || loaded.audio === q) return;
    loaded.audio = q;
    el.audioList.innerHTML = '<span class="shimmer" style="height:64px"></span><span class="shimmer" style="height:64px"></span>';
    try {
      const data = await postJSON("/api/audio", { query: q });
      if (current.query !== q) return;
      renderAudio(data.audio || []);
    } catch (err) {
      loaded.audio = "";
      el.audioList.innerHTML = `<div class="empty">⚠️ ${esc(friendly(err))}</div>`;
    }
  }

  function renderAudio(list) {
    const items = list.map((a, i) => {
      const src = safeUrl(a.audio);
      if (!src) return "";
      return `<div class="audio-card" style="animation-delay:${i * 60}ms">
        <strong>🎵 ${esc(a.title)}</strong>
        <audio controls preload="none" src="${esc(src)}"></audio>
      </div>`;
    }).join("");
    el.audioList.innerHTML = items ||
      `<div class="empty">🔇 No se encontraron sonidos para esta búsqueda.<br>Prueba con palabras como “lluvia”, “bosque” o “viento”.</div>`;
  }
  // Los eventos de audio no burbujean: se escuchan en fase de captura. Solo suena uno a la vez.
  el.audioList.addEventListener("play", e => {
    $$("audio", el.audioList).forEach(a => { if (a !== e.target) a.pause(); });
    $$(".audio-card", el.audioList).forEach(c => c.classList.remove("playing"));
    e.target.closest(".audio-card")?.classList.add("playing");
  }, true);
  el.audioList.addEventListener("pause", e => e.target.closest(".audio-card")?.classList.remove("playing"), true);

  /* ================= fuentes y memoria ================= */
  function card(title, text, url, sourceLabel, i) {
    const href = safeUrl(url);
    const head = href
      ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`
      : `<strong>${esc(title)}</strong>`;
    return `<div class="card" style="animation-delay:${i * 50}ms">${head}${text ? `<p>${esc(text)}</p>` : ""}<small>${esc(sourceLabel)}</small></div>`;
  }
  function renderMemory(web, memory, noKey) {
    el.webList.innerHTML = web.length
      ? web.map((w, i) => card(w.title, w.snippet, w.url, host(w.url), i)).join("")
      : `<div class="empty">${noKey ? "🔑 Añade SEARCH_API_KEY en tu .env para ver fuentes de la web." : "Sin resultados web para esta búsqueda."}</div>`;
    el.memoryList.innerHTML = memory.length
      ? memory.map((m, i) => card(m.title, String(m.content).slice(0, 280), m.source, host(m.source) || m.source, i)).join("")
      : `<div class="empty">🧠 Aún no hay recuerdos sobre este tema. Cada búsqueda web alimenta tu memoria.</div>`;
  }

  /* ================= render principal (solo texto) ================= */
  function render(data, query) {
    const answer = String(data.answer || "");
    current = {
      query,
      answer,
      spoken: data.failed ? "" : answer.split(/\n\s*-{3,}\s*(\n|$)/)[0].replace(/[*#_`]/g, "").trim(),
    };
    // Una búsqueda nueva invalida lo cargado antes en los otros paneles.
    loaded.imagenes = ""; loaded.audio = "";
    el.relatedGallery.innerHTML = ""; el.genGallery.innerHTML = ""; el.audioList.innerHTML = "";
    el.genPrompt.value = query;
    el.followups.classList.add("hidden");

    el.modelTag.textContent = data.model ? "⚡ " + data.model : "";
    el.modelTag.classList.toggle("hidden", !data.model);
    el.notes.innerHTML = (data.warnings || []).map(w => `<span class="note">⚠️ ${esc(w)}</span>`).join("");

    const web = data.web || [], memory = data.memory || [];
    $("#badge-memoria").textContent = web.length + memory.length;
    renderMemory(web, memory, (data.warnings || []).some(w => w.includes("SEARCH_API_KEY")));

    el.loader.classList.add("hidden");
    el.content.classList.remove("hidden");
    setTab("texto");
    typeInto(el.answer, renderMarkdown(answer), () => el.followups.classList.remove("hidden"));
  }

  /* ================= sugerencias al final de la respuesta ================= */
  el.followups.addEventListener("click", e => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    setTab(action);
    if (action === "generar") generate(current.query);
    $("#panel-" + action).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });

  /* ================= búsqueda ================= */
  const LOADING_STEPS = ["Buscando en la web…", "Recordando lo que ya sé…", "Escribiendo tu respuesta…", "Puliendo los detalles…"];
  let busy = false, loaderTimer;

  function setBusy(v) {
    busy = v;
    el.go.disabled = v;
    el.go.firstElementChild.textContent = v ? "Buscando…" : "Descubrir";
    el.pill.classList.toggle("busy", v);
    el.pill.lastChild.textContent = v ? " Pensando…" : " Lista para explorar";
    el.side.classList.toggle("locked", v);
  }

  async function runSearch(query) {
    query = String(query || "").trim();
    if (!query) { toast("Escribe algo para buscar ✍️"); el.input.focus(); return; }
    if (busy) return;

    el.input.value = query;
    el.clear.classList.remove("hidden");
    stopVoice(); cancelTyping(); closeLightbox();
    $$("audio", el.audioList).forEach(a => a.pause());
    setBusy(true);

    el.results.classList.remove("hidden");
    el.content.classList.add("hidden");
    el.loader.classList.remove("hidden");
    let step = 0;
    el.loaderText.textContent = LOADING_STEPS[0];
    clearInterval(loaderTimer);
    loaderTimer = setInterval(() => { step = (step + 1) % LOADING_STEPS.length; el.loaderText.textContent = LOADING_STEPS[step]; }, 1700);
    el.results.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

    try {
      const data = await postJSON("/api/search", { query });
      render(data, query);
      saveRecent(query);
    } catch (err) {
      // Aunque falle la IA, las imágenes y los sonidos siguen disponibles para esta consulta.
      render({ answer: "⚠️ " + friendly(err), failed: true }, query);
    } finally {
      clearInterval(loaderTimer);
      setBusy(false);
    }
  }

  /* ================= eventos globales ================= */
  el.form.addEventListener("submit", e => { e.preventDefault(); runSearch(el.input.value); });
  el.input.addEventListener("input", () => el.clear.classList.toggle("hidden", !el.input.value));
  el.clear.addEventListener("click", () => { el.input.value = ""; el.clear.classList.add("hidden"); el.input.focus(); });

  document.addEventListener("keydown", e => {
    if (!el.lb.classList.contains("hidden")) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") stepLightbox(-1);
      else if (e.key === "ArrowRight") stepLightbox(1);
      return;
    }
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
    if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault(); el.input.focus(); el.input.select();
    }
  });

  addEventListener("beforeunload", () => { if (synth) synth.cancel(); });

  /* ================= inicio ================= */
  $("#year").textContent = new Date().getFullYear();
  initBackground();
  initRotator();
  renderSuggestions();
  renderRecent();
  el.input.focus();
})();
