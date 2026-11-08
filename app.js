"use strict";

/* How the list of quiz files is found (no extra steps for you – just upload .json files to the repo folder):
   1. GitHub: the page asks GitHub which .json files are in this folder of the repo. The owner / repo are
      worked out from the site address (https://OWNER.github.io/REPO/). Only fill GH below if you use a
      custom domain or the auto-detection is wrong.
   2. files.json (optional manual list) if GitHub cannot be asked.
   3. questions.json as a last resort. */
const GH = { owner: "silentassassin14", repo: "mcq-practice", path: "", branch: "main" };   // e.g. { owner: "don", repo: "mcq", path: "", branch: "main" }
const FOLDER = "qp";   // quiz files live in this folder, next to index.html and app.js
const RAW_BASE = "https://raw.githubusercontent.com/" + GH.owner + "/" + GH.repo + "/" + GH.branch + "/";   // where new files are downloaded from
const CACHE_PREFIX = "mcq_cache:";    // saved copies of downloaded files (used when offline)
const LIST_CACHE_KEY = "mcq_filelist_saved";   // saved list of quiz file names (used when offline)
const MANIFEST_URL = "files.json";   // optional, also inside the qp folder
const FALLBACK_FILE = "questions.json";
const SKIP_FILES = ["files.json", "package.json", "package-lock.json", "manifest.json", "tsconfig.json", "composer.json"];
const LAST_FILE_KEY = "mcq_last_file";

/* ───────── Pictures in questions (NEW) ─────────
   Pictures live in  qp/images/  (next to the quiz .json files). A question only stores the file name:
       { "question": "...", "image": "heart.webp", "options": {...}, "answer": "B" }
   Allowed names: letters, digits, "-", "_", "." and ending in .webp / .jpg / .jpeg  (or a full https:// link).
   Extra fields:  "imageAlt" (description)  ·  "optionImages": {"A": "a.webp", ...}
   In a passage set, "image" on the set itself shows in the passage panel. */
const IMG_FOLDER = "images";
const IMG_RAW_BASE = RAW_BASE + FOLDER + "/" + IMG_FOLDER + "/";     // latest copy from GitHub
const IMG_LOCAL_BASE = FOLDER + "/" + IMG_FOLDER + "/";              // copy next to the app (fallback / offline bundle)
const IMG_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(webp|jpe?g)$/i;
const IMG_MAX_INPUT = 10 * 1024 * 1024;                              // refuse pictures bigger than 10 MB
const IMG_MAX_W = 900, IMG_MAX_H = 1200, IMG_TARGET_BYTES = 150 * 1024;
const IDB_NAME = "mcq_images", IDB_STORE = "blobs";                  // admin: pictures waiting to be uploaded


/* ═════════════════════════════════════════════════════════════════════
   CONTINUE THE QUIZ ON ANOTHER DEVICE (NEW – nothing above this line was changed)

   PC:    press "Share quiz" -> a code is made and copied.
   Phone: open the SAME question file, press "Enter code", paste it -> the quiz
          continues at the same question, score and order, with the same shuffled options.

   There is no server, so the code itself contains the progress. Its length depends on
   the quiz size (a few hundred characters for ~100 questions). Send it to yourself
   through WhatsApp, Telegram, e-mail, etc.
   ═════════════════════════════════════════════════════════════════════ */
const XFER_RAW = "MQR", XFER_ZIP = "MQZ";

const xb64e = bytes => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const xb64d = str => {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
async function xPipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/* Turn the live quiz into a code */
async function xferEncode() {
  const p = {
    f: currentFile,
    i: quiz.list.map(q => q.id),
    x: quiz.idx,
    s: quiz.score,
    w: quiz.wrong.map(q => q.id),
    d: quiz.details.map(d => {
      const q = findQ(d.id), ya = String(d.yourAnswer), ca = String(d.correctAnswer);
      const yo = q ? (LETTERS.find(l => q.options[l] === ya.slice(3)) || "") : "";
      return [d.id, ya[0] || "", yo, ca[0] || ""];
    }),
    a: quiz.answered ? 1 : 0,
    c: quiz.chosen || "",
    o: quiz.opts && validOrder(quiz.opts.order) ? quiz.opts.order.join("") : "",
    r: quiz.retest ? 1 : 0,
    e: quiz.results ? 1 : 0,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream === "function") {
    try { return XFER_ZIP + xb64e(await xPipe(bytes, new CompressionStream("deflate-raw"))); } catch (e) { /* use raw */ }
  }
  return XFER_RAW + xb64e(bytes);
}

/* Turn a code back into a quiz save (same format saveQuiz writes) */
async function xferDecode(code) {
  code = String(code).replace(/\s+/g, "");
  const kind = code.slice(0, 3), body = code.slice(3);
  if ((kind !== XFER_RAW && kind !== XFER_ZIP) || !body) throw new Error("That is not a valid code.");
  let p;
  try {
    let bytes = xb64d(body);
    if (kind === XFER_ZIP) {
      if (typeof DecompressionStream !== "function") throw new Error("This browser cannot read that code. Please update it.");
      bytes = await xPipe(bytes, new DecompressionStream("deflate-raw"));
    }
    p = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new Error(e && /browser/.test(e.message) ? e.message : "The code is damaged or incomplete. Copy it again completely.");
  }
  if (!p || typeof p.f !== "string" || !Array.isArray(p.i) || !p.i.length || !Array.isArray(p.w) || !Array.isArray(p.d))
    throw new Error("That is not a valid code.");
  if (p.f !== currentFile)
    throw new Error(`This code is for the file "${p.f}". Choose that file in the sidebar first, then enter the code again.`);

  const byId = new Map(questions.map(q => [q.id, q]));
  const details = p.d.map(d => {
    const q = byId.get(d[0]);
    if (!q) return null;
    return {
      id: q.id,
      yourAnswer: `${d[1]}. ${d[2] && q.options[d[2]] !== undefined ? q.options[d[2]] : "?"}`,
      correctAnswer: `${d[3]}. ${q.options[q.answer]}`,
    };
  }).filter(Boolean);
  return {
    v: 1, t: Date.now(), active: !p.e, results: !!p.e, retest: !!p.r,
    ids: p.i, idx: Number(p.x), score: Number(p.s) || 0, wrong: p.w, details,
    answered: !!p.a, chosen: String(p.c || ""), order: p.o ? String(p.o).split("") : null,
  };
}

/* ----- small pop-up window ----- */
function xferModal(title, bodyHtml) {
  closeXferModal();
  const o = document.createElement("div");
  o.id = "xferModal";
  o.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:14px";
  o.innerHTML = `<div class="card" style="max-width:520px;width:100%;max-height:90vh;overflow:auto;background:var(--card,#1e293b);color:inherit;padding:16px;border-radius:12px">
    <h3 style="margin-top:0">${esc(title)}</h3>${bodyHtml}</div>`;
  o.addEventListener("click", e => { if (e.target === o) closeXferModal(); });
  document.body.appendChild(o);
  return o;
}
function closeXferModal() { const o = document.getElementById("xferModal"); if (o) o.remove(); }

/* ----- PC: Share ----- */
async function shareQuiz() {
  if (!(quiz.active || quiz.results) || !quiz.list.length) { toast("There is no quiz in progress to share.", "warn"); return; }
  const m = xferModal("Share quiz progress", `<p class="muted">Making code…</p>`);
  let code;
  try { code = await xferEncode(); }
  catch (e) { m.querySelector(".card").innerHTML += notice("Could not make the code. " + errText(e), "error"); return; }
  m.querySelector(".card").innerHTML = `<h3 style="margin-top:0">Share quiz progress</h3>
    <p class="muted" style="font-size:13px">On the other device open the file <b>${esc(currentFile)}</b>, press <b>Enter code</b> and paste this code.
    Question ${quiz.results ? "results" : (quiz.idx + 1) + " of " + quiz.list.length} · ${code.length} characters.</p>
    <textarea id="xCode" readonly rows="6" style="width:100%;font-family:monospace;font-size:12px;word-break:break-all">${esc(code)}</textarea>
    <div class="btnrow" style="margin-top:10px"><button class="btn" id="xCopy">Copy code</button>
    <button class="btn secondary" id="xClose">Close</button></div>`;
  const ta = $("#xCode");
  $("#xCopy").onclick = async () => {
    const ok = await copyText(code);
    if (!ok) { ta.focus(); ta.select(); }
    toast(ok ? "Code copied." : "Select the code and copy it manually.", ok ? "success" : "warn");
  };
  $("#xClose").onclick = closeXferModal;
  if (await copyText(code)) toast("Code copied.", "success");
}

/* ----- Phone: Enter code ----- */
function enterCodeDialog() {
  if (!questions.length) { toast("Wait until the questions are loaded.", "warn"); return; }
  xferModal("Enter code", `<p class="muted" style="font-size:13px">Paste the code made by "Share quiz" on the other device. Both devices must have <b>${esc(currentFile)}</b> open.</p>
    <textarea id="xIn" rows="6" style="width:100%;font-family:monospace;font-size:12px" placeholder="Paste code here" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
    <div id="xErr"></div>
    <div class="btnrow" style="margin-top:10px"><button class="btn" id="xGo">Continue quiz here</button>
    <button class="btn secondary" id="xCancel">Cancel</button></div>`);
  $("#xCancel").onclick = closeXferModal;
  $("#xGo").onclick = async () => {
    const btn = $("#xGo"), err = $("#xErr");
    err.innerHTML = "";
    const text = $("#xIn").value.trim();
    if (!text) { err.innerHTML = notice("Paste the code first.", "warn"); return; }
    btn.disabled = true;
    try {
      const s = await xferDecode(text);
      const hasQuiz = (quiz.active && !quiz.results) || readSavedQuiz();
      if (hasQuiz && !confirm("This replaces the quiz saved on this device. Continue?")) { btn.disabled = false; return; }
      localStorage.setItem(quizSaveKey(), JSON.stringify(s));
      if (!readSavedQuiz()) { clearSavedQuiz(); throw new Error("The questions in this file do not match the code. Make sure both devices use the same, latest file."); }
      closeXferModal();
      resumeSavedQuiz();
      toast("Quiz continued from the other device.", "success");
    } catch (e) {
      err.innerHTML = notice(errText(e), "error");
      btn.disabled = false;
    }
  };
  $("#xIn").focus();
}

/* ----- the two buttons (floating, so no existing page code is touched) ----- */
function installTransferButtons() {
  if (document.getElementById("xferBar")) return;
  const bar = document.createElement("div");
  bar.id = "xferBar";
  bar.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9000;display:none;gap:8px;flex-wrap:wrap;justify-content:flex-end";
  bar.innerHTML = `<button class="btn secondary" id="xShare" type="button">Share quiz</button>
    <button class="btn secondary" id="xEnter" type="button">Enter code</button>`;
  document.body.appendChild(bar);
  $("#xShare").onclick = shareQuiz;
  $("#xEnter").onclick = enterCodeDialog;
  const sync = () => {
    const onPage = current === "dashboard" || current === "quiz";
    const sharable = (quiz.active || quiz.results) && quiz.list.length > 0;
    bar.style.display = onPage && questions.length ? "flex" : "none";
    $("#xShare").style.display = sharable ? "" : "none";
  };
  new MutationObserver(sync).observe(page, { childList: true });   // runs after every redraw of the page
  sync();
}
installTransferButtons();




/* ───────── Saved quiz progress (NEW) ───────── */
const QUIZ_SAVE_PREFIX = "mcq_quiz_progress:";                       // one save per question file
const QUIZ_MAX_AGE = 30 * 24 * 60 * 60 * 1000;                       // forget saves older than 30 days
let availableFiles = [];                  // every quiz file found, e.g. ["oceanography.json", "physics.json"]
let currentFile = "";                     // the file the person has chosen

/* ───────── Config ───────── */
const LETTERS = ["A", "B", "C", "D"];
/* Settings come from the iframe tag on the blog page (data-user, data-pass, data-title, data-blog).
   These defaults are only used when this file is opened on its own for testing. */
const CFG = (function () {
  const d = { user: "admin", pass: "admin123", title: "mcq-data", blog: "https://doninternationalwebsite.blogspot.com" };
  try {
    const ds = window.frameElement && window.frameElement.dataset;
    if (ds) {
      if (ds.user) d.user = ds.user;
      if (ds.pass) d.pass = ds.pass;
      if (ds.title) d.title = ds.title;
      if (ds.blog) d.blog = ds.blog.replace(/\/+$/, "");
    }
  } catch (e) { /* not inside an iframe */ }
  return d;
})();
const DRAFT_KEY = "mcq_blogger_draft_v1";
const draftKey = () => DRAFT_KEY + ":" + currentFile;   // one draft per file
const SESSION_KEY = "mcq_admin_session";
const NAV_USER = [["Dashboard", "dashboard"], ["View Questions", "view"], ["Take Quiz", "quiz"]];
const NAV_ADMIN = [
  ["Dashboard", "dashboard"], ["Publish to Blog", "publish"], ["Add Question", "add"], ["Edit Question", "edit"],
  ["Delete Question", "delete"], ["View Questions", "view"], ["Take Quiz", "quiz"],
];

/* ───────── State ───────── */
let questions = [];          // what this person is looking at (live list, or the admin's working copy)
let blogList = [];           // the list currently live on the blog
let draft = null;            // admin's unpublished working copy
let bankInfo = null;         // {updated, count, name}
let loadState = "loading";   // loading | ready | empty | error | nodb
let loadError = "";
let isAdmin = false;
let current = "dashboard";
let quiz = freshQuiz();
let pending = null;

function freshQuiz() {
  return { active: false, results: false, retest: false, list: [], idx: 0, score: 0,
           wrong: [], details: [], opts: null, answered: false, chosen: "" };
}

/* ───────── Helpers ───────── */
const $ = (s, r = document) => r.querySelector(s);
const page = $("#page");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sortById = arr => [...arr].sort((a, b) => a.id - b.id);
const nextId = () => questions.length ? Math.max(...questions.map(q => q.id)) + 1 : 1;
const findQ = id => questions.find(q => q.id === id) || null;
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch (e) { return ""; } };
const errText = e => (e && e.message) ? e.message : "Something went wrong.";

function toast(msg, kind = "info") {
  const t = $("#toast");
  t.className = "toast show " + kind;
  t.textContent = msg;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = "toast"; }, 3600);
}

const header = (title, sub) =>
  `<h2 class="title">${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : `<div style="height:16px"></div>`}`;
const notice = (text, kind = "info") => `<div class="notice ${kind}">${esc(text)}</div>`;

/* ═════════════════════════════════════════════════════════════════════
   PICTURES IN QUESTIONS (NEW)
   ═════════════════════════════════════════════════════════════════════ */
let normalizeWarnings = [];          // problems found by the most recent normalize() call
let fileWarnings = [];               // problems found in the file that is currently loaded
const pendingBlobs = new Map();      // admin: compressed pictures waiting for upload  (name -> Blob)
const pendingUrls = new Map();       // admin: preview addresses for those pictures    (name -> blob: URL)

/* Only plain file names (.webp/.jpg/.jpeg) or https links are accepted – never paths, scripts or other schemes */
function isSafeImage(v) {
  if (typeof v !== "string") return false;
  v = v.trim();
  if (IMG_NAME_RE.test(v)) return true;
  if (v.length <= 600 && /^https:\/\/[^\s"'<>\\]+$/i.test(v)) {
    try { return new URL(v).protocol === "https:"; } catch (e) { /* not a valid address */ }
  }
  return false;
}

/* Validates image fields of one question in place. A bad picture is dropped (with a warning), never the whole quiz. */
function cleanImages(o, label) {
  const bad = what => normalizeWarnings.push(`${label}: ${what} was ignored. Use a file name such as "photo.webp" (.webp, .jpg or .jpeg) or an https:// link.`);
  ["image", "passageImage"].forEach(k => {
    if (o[k] === undefined || o[k] === null || o[k] === "") { delete o[k]; return; }
    if (isSafeImage(o[k])) o[k] = o[k].trim();
    else { bad(`"${k}"`); delete o[k]; }
  });
  if (o.imageAlt !== undefined && typeof o.imageAlt !== "string") delete o.imageAlt;
  if (o.optionImages !== undefined) {
    const src = o.optionImages, clean = {};
    if (src && typeof src === "object" && !Array.isArray(src)) {
      LETTERS.forEach(l => {
        const v = src[l];
        if (v === undefined || v === null || v === "") return;
        if (isSafeImage(v)) clean[l] = v.trim(); else bad(`"optionImages.${l}"`);
      });
    } else bad('"optionImages"');
    if (Object.keys(clean).length) o.optionImages = clean; else delete o.optionImages;
  }
}

function imgSources(name) {
  name = String(name).trim();
  if (pendingUrls.has(name)) return { src: pendingUrls.get(name), fb: "" };      // admin preview before upload
  if (/^https:\/\//i.test(name)) return { src: name, fb: "" };
  const f = encodeURIComponent(name);
  return { src: IMG_RAW_BASE + f, fb: IMG_LOCAL_BASE + f };                       // GitHub first, then the local copy
}
function imgHtml(name, alt, opts) {
  opts = opts || {};
  if (!isSafeImage(name)) return "";
  const { src, fb } = imgSources(name);
  const cls = "qimg" + (opts.zoom ? " zoomable" : "") + (opts.small ? " optimg" : "");
  return `<img class="${cls}" src="${esc(src)}"${fb ? ` data-fallback="${esc(fb)}"` : ""} alt="${esc(alt || "Question image")}" loading="lazy" decoding="async" draggable="false">`;
}
function figure(name, alt, opts) {
  const h = imgHtml(name, alt, opts);
  return h ? `<div class="qfig">${h}</div>` : "";
}

/* A picture that fails to load: try the fallback address once, then show a small placeholder (layout never breaks) */
document.addEventListener("error", e => {
  const t = e.target;
  if (!t || t.tagName !== "IMG" || !t.classList || !t.classList.contains("qimg")) return;
  if (t.dataset.fallback && !t.dataset.tried) { t.dataset.tried = "1"; t.src = t.dataset.fallback; return; }
  const box = document.createElement("div");
  box.className = "imgfail";
  box.textContent = "Image unavailable";
  try { t.replaceWith(box); } catch (err) { /* ignore */ }
}, true);

/* Tap a picture to see it full screen; tap again (or press any key) to close */
function closeLightbox() { const o = document.getElementById("imgbox"); if (o) o.remove(); }
function openLightbox(src, alt) {
  closeLightbox();
  const o = document.createElement("div");
  o.id = "imgbox"; o.className = "imgbox-overlay";
  o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Picture preview");
  const im = document.createElement("img");
  im.src = src; im.alt = alt || "";
  o.appendChild(im);
  o.onclick = closeLightbox;
  document.body.appendChild(o);
}
document.addEventListener("click", e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains("zoomable")) openLightbox(t.currentSrc || t.src, t.alt);
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });

function injectImgStyles() {
  if (document.getElementById("quiz-img-style")) return;
  const st = document.createElement("style");
  st.id = "quiz-img-style";
  st.textContent = `
    .qfig { margin: 10px 0 14px; text-align: center; }
    .qimg { display: inline-block; max-width: 100%; height: auto; max-height: 420px; object-fit: contain;
            border-radius: 10px; background: rgba(127,127,127,.12); }
    .qimg.zoomable { cursor: zoom-in; }
    .qimg.optimg { display: block; max-height: 220px; margin: 8px 0 2px; }
    .qcard .qimg { max-height: 260px; }
    .passage .qimg { max-height: 360px; }
    .imgprev { margin-top: 8px; }
    .imgprev .qimg { max-height: 160px; }
    .imgfail { display: inline-block; padding: 14px 18px; border: 1px dashed rgba(127,127,127,.6);
               border-radius: 10px; font-size: 13px; opacity: .8; }
    .imgbox-overlay { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.9); display: flex;
                      align-items: center; justify-content: center; padding: 12px; cursor: zoom-out; }
    .imgbox-overlay img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; }
    .resumecard { border: 2px solid var(--accent, #38bdf8); margin-bottom: 16px; }
    .resumecard .rtitle { font-weight: 700; margin-bottom: 4px; }
  `;
  document.head.appendChild(st);
}

/* ----- admin: keep compressed pictures in IndexedDB so a page reload does not lose them ----- */
function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB is not available")); return; }
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { try { req.result.createObjectStore(IDB_STORE, { keyPath: "name" }); } catch (e) { /* ignore */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB error"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked"));
  });
}
async function idbDo(mode, fn) {
  const db = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const r = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(r ? r.result : undefined);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB error"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB aborted"));
    });
  } finally { try { db.close(); } catch (e) { /* ignore */ } }
}
const idbPut = (name, blob) => idbDo("readwrite", st => st.put({ name, blob }));
const idbAll = () => idbDo("readonly", st => st.getAll());
const idbClear = () => idbDo("readwrite", st => st.clear());

function registerPending(name, blob) {
  const old = pendingUrls.get(name);
  if (old) { try { URL.revokeObjectURL(old); } catch (e) { /* ignore */ } }
  pendingBlobs.set(name, blob);
  pendingUrls.set(name, URL.createObjectURL(blob));
}
async function loadPendingImages() {
  try {
    const all = await idbAll();
    let n = 0;
    (all || []).forEach(r => { if (r && r.name && r.blob && IMG_NAME_RE.test(r.name) && !pendingBlobs.has(r.name)) { registerPending(r.name, r.blob); n++; } });
    if (n && ["dashboard", "view", "publish"].includes(current)) render();   // never redraw a form the person may be typing in
  } catch (e) { /* storage unavailable: pictures just stay in memory */ }
}
async function clearPendingImages() {
  pendingUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
  pendingUrls.clear(); pendingBlobs.clear();
  try { await idbClear(); } catch (e) { /* ignore */ }
}

/* ----- admin: read, resize and convert a chosen picture to WebP (JPEG if WebP is not supported) ----- */
async function decodeImage(file) {
  if (window.createImageBitmap) {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => { if (bmp.close) bmp.close(); } };
    } catch (e) { /* fall back to <img> below */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => resolve({ src: im, w: im.naturalWidth, h: im.naturalHeight, close: () => URL.revokeObjectURL(url) });
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot read that picture. Please use a JPG, PNG or WebP file (iPhone HEIC photos only work in Safari)."));
    };
    im.src = url;
  });
}
const toBlobP = (canvas, type, quality) => new Promise(res => {
  try { canvas.toBlob(b => res(b), type, quality); } catch (e) { res(null); }
});
async function compressImage(file) {
  const fname = String(file.name || ""), type = String(file.type || "").toLowerCase();
  if (type.includes("svg") || /\.svgz?$/i.test(fname)) throw new Error("SVG pictures are not allowed. Please use a JPG, PNG or WebP picture.");
  if (!/^image\//.test(type) && !/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(fname)) throw new Error("That file is not a picture.");
  if (!file.size) throw new Error("That file is empty.");
  if (file.size > IMG_MAX_INPUT) throw new Error("That picture is bigger than 10 MB. Please choose a smaller one.");
  const img = await decodeImage(file);
  try {
    if (!img.w || !img.h) throw new Error("That picture has no size.");
    const scale = Math.min(1, IMG_MAX_W / img.w, IMG_MAX_H / img.h);
    const w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot process pictures.");
    ctx.drawImage(img.src, 0, 0, w, h);
    let blob = null;
    for (const q of [0.82, 0.72, 0.62, 0.5]) {                       // lower the quality until it is small enough
      blob = await toBlobP(canvas, "image/webp", q);
      if (!blob || blob.type !== "image/webp") { blob = null; break; }   // WebP not supported here
      if (blob.size <= IMG_TARGET_BYTES) break;
    }
    if (!blob) {                                                      // JPEG on a white background instead
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      for (const q of [0.85, 0.75, 0.65, 0.55]) {
        blob = await toBlobP(canvas, "image/jpeg", q);
        if (!blob || blob.size <= IMG_TARGET_BYTES) break;
      }
    }
    if (!blob) throw new Error("Could not convert that picture. Please try another one.");
    return blob;
  } finally { try { img.close(); } catch (e) { /* ignore */ } }
}
function makeImageName(orig, mime) {
  const ext = mime === "image/jpeg" ? "jpg" : "webp";
  let base = String(orig || "image").replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!base) base = "image";
  let name;
  do { name = base + "-" + Math.random().toString(36).slice(2, 7) + "." + ext; } while (pendingBlobs.has(name));
  return name;
}
async function prepareImage(file) {
  const blob = await compressImage(file);
  const name = makeImageName(file.name, blob.type);
  registerPending(name, blob);
  let persisted = true;
  try { await idbPut(name, blob); } catch (e) { persisted = false; }
  return { name, persisted, kb: Math.max(1, Math.round(blob.size / 1024)) };
}

/* ----- admin: the "Question image" control used by Add and Edit ----- */
function imagePickerHtml(p) {
  return `<div class="field"><label class="lbl">Question image (optional)</label>
    <input type="file" id="${p}File" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
    <div class="btnrow"><button type="button" class="btn secondary" id="${p}Pick">Choose image</button>
    <button type="button" class="btn secondary" id="${p}Clear" style="display:none">Remove image</button></div>
    <div id="${p}Prev" class="imgprev"></div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">JPG, PNG, WebP or GIF up to 10 MB. It is resized and saved as WebP. When you publish, upload it to the ${esc(FOLDER + "/" + IMG_FOLDER)} folder.</p></div>`;
}
function bindImagePicker(p, initial) {
  let name = initial || "", busy = false;
  const prev = $("#" + p + "Prev"), clr = $("#" + p + "Clear"), pick = $("#" + p + "Pick"), file = $("#" + p + "File");
  const draw = () => {
    prev.innerHTML = name ? imgHtml(name, "Question image preview", { zoom: true }) + `<div class="muted" style="font-size:12px">${esc(name)}</div>` : "";
    clr.style.display = name ? "" : "none";
  };
  pick.onclick = () => { if (!busy) file.click(); };
  clr.onclick = () => { name = ""; draw(); };
  file.onchange = async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f || busy) return;
    busy = true; pick.disabled = true;
    const label = pick.textContent; pick.textContent = "Processing…";
    try {
      const r = await prepareImage(f);
      name = r.name; draw();
      toast(r.persisted ? `Picture ready (${r.kb} KB).` : `Picture ready (${r.kb} KB), but it could not be saved for later. Download it before closing this page.`, r.persisted ? "success" : "warn");
    } catch (err) { toast(errText(err), "error"); }
    finally { busy = false; pick.disabled = false; pick.textContent = label; }
  };
  draw();
  return { get: () => name, set: n => { name = n || ""; draw(); }, reset: () => { name = ""; draw(); }, busy: () => busy };
}

/* ----- admin: pictures that still have to be uploaded to GitHub (shown on the Publish page) ----- */
const imageNamesOf = q => {
  const s = new Set();
  [q.image, q.passageImage].forEach(n => { if (n) s.add(n); });
  if (q.optionImages) Object.values(q.optionImages).forEach(n => { if (n) s.add(n); });
  return s;
};
function pendingInUse() {
  const used = new Set();
  questions.forEach(q => imageNamesOf(q).forEach(n => used.add(n)));
  return [...used].filter(n => pendingBlobs.has(n));
}
function pendingImagesHtml() {
  if (!pendingBlobs.size) return "";
  const used = pendingInUse().length, extra = pendingBlobs.size - used;
  return `<h3>Images to upload</h3>
    <p class="muted" style="margin-top:0">${used} picture(s) used by your working copy${extra > 0 ? ` (${extra} more saved but not used)` : ""}.
    Upload them to the <b>${esc(FOLDER + "/" + IMG_FOLDER)}</b> folder of your GitHub repo, next to the JSON file.</p>
    <div class="btnrow"><button class="btn" id="pbImgDown" ${used ? "" : "disabled"}>Download images</button>
    <button class="btn danger" id="pbImgClear">Clear saved images</button></div>`;
}
async function downloadPendingImages() {
  const names = pendingInUse();
  if (!names.length) { toast("There are no new pictures to download.", "info"); return; }
  for (const n of names) {
    const blob = pendingBlobs.get(n);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = n;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    await new Promise(r => setTimeout(r, 400));          // gives the browser time between downloads
  }
  toast(`Downloaded ${names.length} picture(s). Upload them to ${FOLDER}/${IMG_FOLDER}/ on GitHub.`, "success");
}
function bindPendingImages() {
  const d = $("#pbImgDown"), c = $("#pbImgClear");
  if (d) d.onclick = async () => { d.disabled = true; try { await downloadPendingImages(); } finally { d.disabled = false; } };
  if (c) c.onclick = async e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again (only after uploading them)"; return; }
    await clearPendingImages();
    toast("Saved pictures cleared.", "success");
    render();
  };
}

/* ───────── Rich text for passages and questions (NEW) ─────────
   Plain lines become paragraphs. Lines that start with "|" become a table, e.g.
       | List-I        | List-II          |
       |---------------|------------------|
       | A. SDG 5      | 2. Gender Equality |
   Everything is escaped, so the JSON can never inject HTML. */
const hasTable = t => /^\s*\|/m.test(String(t));
function richText(text) {
  const isSep = r => r.every(c => /^:?-{2,}:?$/.test(c));
  let out = "", para = [], rows = [];
  const flushPara = () => { if (para.length) { out += `<p>${esc(para.join("\n"))}</p>`; para = []; } };
  const flushRows = () => {
    if (!rows.length) return;
    const head = rows.length > 1 && isSep(rows[1]);
    const body = rows.filter(r => !isSep(r));
    out += `<div class="tscroll"><table class="ptable">` + body.map((r, i) =>
      `<tr>${r.map(c => i === 0 && head ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join("")}</tr>`).join("") + `</table></div>`;
    rows = [];
  };
  String(text).replace(/\r/g, "").split("\n").forEach(line => {
    const t = line.trim();
    if (t.startsWith("|")) { flushPara(); rows.push(t.replace(/^\||\|$/g, "").split("|").map(c => c.trim())); }
    else { flushRows(); if (t === "") flushPara(); else para.push(line); }
  });
  flushPara(); flushRows();
  return out;
}
/* Question text: unchanged markup for plain questions, table-aware only when a "|" row is present */
const questionHtml = t => hasTable(t)
  ? `<div class="qbig qrich rich">${richText(t)}</div>`
  : `<p class="qbig">${esc(t)}</p>`;

function qcard(q, showAnswer = true) {
  const opts = LETTERS.map(l => {
    const ok = showAnswer && l === q.answer;
    const oi = q.optionImages && q.optionImages[l] ? imgHtml(q.optionImages[l], "Option " + l, { small: true, zoom: true }) : "";
    return `<div class="${ok ? "correct" : ""}">${l}. ${esc(q.options[l])}${ok ? "  ✓" : ""}${oi}</div>`;
  }).join("");
  return `<div class="card qcard">
    <div class="qtop"><span class="qid">ID #${q.id}${q.group ? ` · Set ${esc(q.group)}` : ""}</span>${showAnswer ? `<span class="badge">Answer: ${q.answer}</span>` : ""}</div>
    ${hasTable(q.question) ? `<div class="qtext qrich rich">${richText(q.question)}</div>` : `<div class="qtext">${esc(q.question)}</div>`}
    ${figure(q.image, q.imageAlt, { zoom: true })}
    ${(q.passage || q.passageImage) ? `<details class="qpassage"><summary>Show passage</summary>${q.passage ? `<div class="rich">${richText(q.passage)}</div>` : ""}${figure(q.passageImage, "Passage image", { zoom: true })}</details>` : ""}
    <div class="qopts">${opts}</div></div>`;
}

const metric = (v, c, color) => `<div class="metric"><div class="v" style="color:${color}">${esc(v)}</div><div class="c">${esc(c)}</div></div>`;
const idOptions = () => sortById(questions).map(q => `<option value="${q.id}">ID ${q.id}</option>`).join("");
const optionInputs = (prefix, starred) => LETTERS.map(l =>
  `<div class="cell"><small>${l}${starred ? " *" : ""}</small><input type="text" id="${prefix}${l}" autocomplete="off"></div>`).join("");


/* ───────── Validation ───────── */
function normalize(data) {
  normalizeWarnings = [];
  if (!Array.isArray(data) && data && Array.isArray(data.questions)) data = data.questions;
  if (!Array.isArray(data)) throw new Error("The file must contain a list of questions.");

  /* Step 1 (NEW) – flatten passage sets.
     A set looks like  { "passage": "...", "title": "...", "questions": [ {question, options, answer}, ... ] }
     and becomes several ordinary questions that share the same `group` id and `passage`.
     Ordinary questions pass through untouched, so the old format keeps working. */
  const flat = [];
  data.forEach((item, i) => {
    const n = i + 1;
    if (item && typeof item === "object" && Array.isArray(item.questions)) {
      if (typeof item.passage !== "string" || !item.passage.trim()) throw new Error(`Item ${n} is a passage set, so it needs "passage" text.`);
      if (!item.questions.length) throw new Error(`Item ${n} is a passage set with no questions inside it.`);
      const group = String(item.group !== undefined ? item.group : "set" + n);
      item.questions.forEach((sub, j) => {
        const extra = { group, passage: item.passage };
        const setImg = item.passageImage !== undefined ? item.passageImage : item.image;   // NEW: picture for the passage panel
        if (setImg !== undefined && setImg !== null && setImg !== "") extra.passageImage = setImg;
        if (typeof item.title === "string" && item.title.trim()) extra.passageTitle = item.title;
        flat.push({ label: `Item ${n} (question ${j + 1} of the set)`, q: (sub && typeof sub === "object") ? { ...sub, ...extra } : sub });
      });
    } else flat.push({ label: `Item ${n}`, q: item });
  });

  /* Step 2 – the original checks. Missing ids are filled in without clashing with explicit ones. */
  const used = new Set(flat.filter(f => f.q && f.q.id !== undefined).map(f => Number(f.q.id)));
  const list = flat.map(({ label, q }, k) => {
    if (!q || typeof q !== "object") throw new Error(`${label} is not a question object.`);
    if (typeof q.question !== "string" || !q.question.trim()) throw new Error(`${label} has no "question" text.`);
    if (!q.options || LETTERS.some(l => typeof q.options[l] !== "string")) throw new Error(`${label} needs options A, B, C and D.`);
    if (!LETTERS.includes(q.answer)) throw new Error(`${label} needs an "answer" of A, B, C or D.`);
    if (q.passage !== undefined && typeof q.passage !== "string") throw new Error(`${label} has a "passage" that is not text.`);
    let id;
    if (q.id !== undefined) id = Number(q.id);
    else { id = k + 1; while (used.has(id)) id++; used.add(id); }
    const out = { ...q, id };
    cleanImages(out, label);   // NEW: bad pictures are dropped with a warning instead of breaking the quiz
    if (out.group !== undefined && out.group !== null && String(out.group) !== "") out.group = String(out.group);
    else delete out.group;
    return out;
  });

  /* Step 3 (NEW) – flat files may repeat `group` and give the passage only once: share it with the whole group. */
  const info = new Map();
  list.forEach(q => { if (q.group && (q.passage || q.passageImage) && !info.has(q.group)) info.set(q.group, { passage: q.passage, title: q.passageTitle, image: q.passageImage }); });
  list.forEach(q => {
    const g = q.group && info.get(q.group);
    if (!g) return;
    if (!q.passage && g.passage) q.passage = g.passage;
    if ((q.passage || "") === (g.passage || "") && !q.passageTitle && g.title) q.passageTitle = g.title;
    if ((q.passage || "") === (g.passage || "") && !q.passageImage && g.image) q.passageImage = g.image;
  });
  return list;
}


/* Shown on pages that need questions when none are available */
function bankProblem() {
  if (loadState === "loading") return notice("Loading the question bank…", "info");
  if (loadState === "error") return notice("Could not load the question bank. " + loadError, "error");
  if (loadState === "nodb") return notice("The blog data is not available in this view. Open the blog page, or load a file from the sidebar.", "warn");
  return notice(isAdmin
    ? "No questions are live on the blog yet. Add some, then use Publish to Blog."
    : "No questions have been published yet. Please check back soon.", "info");
}

/* ───────── Draft storage (admin only) ───────── */
function getDraft() { try { const s = localStorage.getItem(draftKey()); return s ? normalize(JSON.parse(s)) : null; } catch (e) { return null; } }
function setDraft(list) { try { localStorage.setItem(draftKey(), JSON.stringify(list)); } catch (e) {} }
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function applyWorking() { questions = (isAdmin && draft) ? draft : blogList; }

/* ───────── Load the live list from the blog ───────── */
function blogBase() {
  if (CFG.blog) return CFG.blog;
  try { const o = window.parent.location.origin; if (o && /^https?:/.test(o)) return o; } catch (e) {}
  return "";
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "__mcq_cb" + Date.now();
    const s = document.createElement("script");
    const done = () => { clearTimeout(timer); delete window[cb]; s.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error("The blog did not respond in time.")); }, 15000);
    window[cb] = d => { done(); resolve(d); };
    s.onerror = () => { done(); reject(new Error("Could not reach the blog feed.")); };
    s.src = url + "&callback=" + cb;
    document.head.appendChild(s);
  });
}

/* Work out where this site lives on GitHub: returns a list of {owner, repo, path} guesses */
const sub = base => [base, FOLDER].filter(Boolean).join("/");   // adds the qp folder to a path
function ghCandidates() {
  if (GH.owner && GH.repo) return [{ owner: GH.owner, repo: GH.repo, path: sub(GH.path || "") }];
  const host = location.hostname.toLowerCase();
  if (!host.endsWith(".github.io")) return [];
  const owner = host.split(".")[0];
  const seg = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (seg.length && seg[seg.length - 1].includes(".")) seg.pop();          // drop index.html
  const list = [];
  if (seg.length) list.push({ owner, repo: seg[0], path: sub(seg.slice(1).join("/")) });   // project site
  list.push({ owner, repo: owner + ".github.io", path: sub(seg.join("/")) });              // user site
  return list;
}

/* Download a file from GitHub and keep a copy on the phone.
   Order: 1) GitHub (latest)  2) the copy saved last time  3) the copy bundled inside the app.
   Returns { data, source } where source is "online", "saved" or "bundled". */
async function loadJSON(path) {
  const key = CACHE_PREFIX + path;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);          // give up after 8 seconds
    const res = await fetch(RAW_BASE + path.split("/").map(encodeURIComponent).join("/") + "?t=" + Date.now(),
                            { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const data = JSON.parse(text);                                // make sure it is valid JSON
    try { localStorage.setItem(key, text); } catch (e) { /* storage full: still use the fresh data */ }
    return { data, source: "online" };
  } catch (err) {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return { data: JSON.parse(saved), source: "saved" };
    } catch (e) {}
    const res = await fetch(path.split("/").map(encodeURIComponent).join("/"));   // file bundled in the app
    if (!res.ok) throw new Error("HTTP " + res.status);
    return { data: await res.json(), source: "bundled" };
  }
}

async function listFromGitHub() {
  for (const c of ghCandidates()) {
    const cacheKey = "mcq_gh_" + [c.owner, c.repo, c.path, GH.branch].join("/");
    try {
      const hit = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.list;       // keeps GitHub's hourly limit safe
    } catch (e) {}
    try {
      const url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${c.path.split("/").map(encodeURIComponent).join("/")}` +
                  (GH.branch ? `?ref=${encodeURIComponent(GH.branch)}` : "");
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items)) continue;
      const list = items.filter(i => i.type === "file").map(i => i.name);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), list })); } catch (e) {}
      try { localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(list)); } catch (e) {}   // keep for offline use
      return list;
    } catch (e) { /* try the next guess */ }
  }
  return [];
}

async function listFromManifest() {
  try {
    const res = await fetch(FOLDER + "/" + MANIFEST_URL + "?t=" + Date.now());
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data && Array.isArray(data.files) ? data.files : []);
  } catch (e) { return []; }
}

/* Find every quiz file in the folder */
async function discoverFiles() {
  let list = await listFromGitHub();
  if (!list.some(n => /\.json$/i.test(n))) {          // offline or GitHub unreachable: use the list saved last time
    try { list = JSON.parse(localStorage.getItem(LIST_CACHE_KEY) || "[]"); } catch (e) { list = []; }
  }
  if (!list.some(n => /\.json$/i.test(n))) list = await listFromManifest();   // bundled list (first launch, offline)
  list = [...new Set(list.filter(n => typeof n === "string" && /\.json$/i.test(n) &&
    !SKIP_FILES.includes(n.toLowerCase()) && !/[\/\\]/.test(n)))]
    .sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }));
  return list.length ? list : [FALLBACK_FILE];
}

async function loadBlog() {
  loadState = "loading";
  blogList = []; draft = null; fileWarnings = []; applyWorking();
  render();   // show loading state

  if (!availableFiles.length) availableFiles = await discoverFiles();
  if (!availableFiles.includes(currentFile)) {
    let saved = "";
    try { saved = localStorage.getItem(LAST_FILE_KEY) || ""; } catch (e) {}
    currentFile = availableFiles.includes(saved) ? saved : availableFiles[0];
  }
  draft = getDraft();   // the admin's unpublished copy belongs to this file only

  try {
    const { data, source } = await loadJSON(FOLDER + "/" + currentFile);   // online -> saved copy -> bundled copy
    blogList = normalize(data);
    fileWarnings = normalizeWarnings.slice();
    bankInfo = { updated: null, count: blogList.length, name: currentFile, source };
    loadState = blogList.length ? "ready" : "empty";
  } catch (err) {
    blogList = [];
    bankInfo = null;
    loadState = "error";
    loadError = errText(err) + " — Make sure " + currentFile + " is inside the " + FOLDER + " folder next to index.html and is valid JSON.";
  }

  // Clear draft if it matches the live data
  if (draft && blogList.length && same(draft, blogList)) {
    draft = null;
    clearDraft();
  }

  applyWorking();
  render();
}

/* Called when the person picks another file in the drop-down */
function selectFile(name) {
  if (!availableFiles.includes(name) || name === currentFile) return;
  if (quiz.active && !quiz.results && !confirm("Switching files will pause the quiz. Your progress is saved and you can resume it later. Continue?")) { updateSide(); return; }
  saveQuiz();   // NEW: make sure the paused quiz is stored under the file it belongs to
  currentFile = name;
  try { localStorage.setItem(LAST_FILE_KEY, name); } catch (e) {}
  quiz = freshQuiz(); pending = null;
  loadBlog();
}

/* ───────── Admin login ───────── */
function login(user, pass) {
  if (user !== CFG.user || pass !== CFG.pass) return false;
  isAdmin = true;
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) {}
  buildNav(); applyWorking();
  return true;
}
function logout() {
  isAdmin = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  quiz = freshQuiz(); pending = null;
  buildNav(); applyWorking(); go("dashboard");
}

/* Edits made by the admin are kept as a working copy until published */
async function commit(list, okMsg) {
  questions = list;
  draft = list;
  setDraft(list);
  updateSide();
  toast(okMsg + " (not live yet — use Publish to Blog)", "success");
  return true;
}

/* ───────── Sidebar / nav ───────── */
function buildNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  (isAdmin ? NAV_ADMIN : NAV_USER).forEach(([label, key]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.page = key;
    b.onclick = () => go(key);
    nav.appendChild(b);
  });
}

function updateSide() {
  let h = isAdmin ? `<span class="role">Admin</span><br>` : "";
  if (availableFiles.length) {
    h += `<label class="lbl" for="fileSel" style="font-size:12px">Question file</label>
      <select id="fileSel" style="width:100%;min-width:0;margin-bottom:10px">${availableFiles.map(f =>
        `<option value="${esc(f)}"${f === currentFile ? " selected" : ""}>${esc(f)}</option>`).join("")}</select>`;
  }
  if (loadState === "nodb") {
    h += `Blog data not available here.${bankInfo && bankInfo.name ? `<br>Using <b>${esc(bankInfo.name)}</b>` : ""}<button class="btn secondary" id="localBtn">Open local JSON file</button>`;
  } else if (bankInfo) {
    h += `<b>${bankInfo.count}</b> question(s) in this file${bankInfo.updated ? `<br>Updated ${esc(fmtDate(bankInfo.updated))}` : ""}`;
  } else if (loadState === "loading") {
    h += "Loading questions…";
  } else {
    h += "No questions published yet.";
  }
  if (isAdmin && draft) h += `<br><b style="color:#fcd34d">Unpublished changes</b>`;
  $("#bankBox").innerHTML = h;
  const fs = $("#fileSel");
  if (fs) fs.onchange = () => selectFile(fs.value);
  const lb = $("#localBtn");
  if (lb) lb.onclick = () => $("#localInput").click();
  $("#authBtn").textContent = isAdmin ? "Log out" : "Admin login";
  $("#total").textContent = `Total Questions: ${questions.length}`;
}

function go(name) { current = name; render(); window.scrollTo(0, 0); }

function render() {
  closeLightbox();
  const allowed = (isAdmin ? NAV_ADMIN : NAV_USER).map(n => n[1]);
  if (!isAdmin) allowed.push("login");
  if (!allowed.includes(current)) current = "dashboard";
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.page === current));
  page.classList.remove("wide");   // NEW: only passage questions use the wide two-column layout (quizActive turns it on)
  PAGES[current]();
  updateSide();
}

/* ───────── Pages ───────── */
const PAGES = {
  dashboard() {
    let h = header("MCQ Practice Software", "Practice with randomized quizzes");
    h += `<div class="metrics">${metric(questions.length, "Questions", "var(--accent)")}${metric("∞", "Practice Mode", "#ffffff")}${metric("✓", "Retest Support", "var(--green)")}</div>`;
    h += resumeCard();
    h += `<h3 style="margin-top:0">Quick Actions</h3><div class="actions">
      <button class="btn" id="qaStart" ${questions.length ? "" : "disabled"}>Start Quiz</button>
      <button class="btn secondary" id="qaView">View Bank</button>
      ${isAdmin ? `<button class="btn secondary" id="qaPub">Publish to Blog</button><button class="btn secondary" id="qaAdd">Add New Question</button>` : ""}</div>`;
    if (isAdmin && draft) h += notice("You have unpublished changes. Open Publish to Blog to make them live for everyone.", "warn");
    if (isAdmin && fileWarnings.length) h += notice(`${fileWarnings.length} picture problem(s) in this file. ${fileWarnings[0]}`, "warn");
    if (!questions.length) h += bankProblem();
    else h += `<h3>Recent Questions</h3>` + sortById(questions).reverse().slice(0, 3).map(q => qcard(q, false)).join("");
    page.innerHTML = h;
    $("#qaStart").onclick = startFullQuiz;
    bindResume();
    $("#qaView").onclick = () => go("view");
    if (isAdmin) { $("#qaPub").onclick = () => go("publish"); $("#qaAdd").onclick = () => go("add"); }
  },

  login() {
    page.innerHTML = header("Admin Login", "For the site owner only") + `
      <div class="field"><label class="lbl" for="lUser">Username</label><input type="text" id="lUser" autocomplete="username"></div>
      <div class="field"><label class="lbl" for="lPass">Password</label><input type="password" id="lPass" autocomplete="current-password"></div>
      <button class="btn block" id="lGo">Log in</button>`;
    const attempt = () => {
      if (login($("#lUser").value.trim(), $("#lPass").value)) { toast("Logged in as admin.", "success"); go("dashboard"); }
      else toast("Wrong username or password.", "error");
    };
    $("#lGo").onclick = attempt;
    $("#lPass").onkeydown = e => { if (e.key === "Enter") attempt(); };
    $("#lUser").onkeydown = e => { if (e.key === "Enter") $("#lPass").focus(); };
  },

  publish() {
    let h = header("Publish to Blog", "Make your changes live for everyone");
    h += `<div class="card infocard"><dl>
      <dt>Live on the blog</dt><dd>${blogList.length ? blogList.length + " question(s)" : "nothing yet"}</dd>
      <dt>Your working copy</dt><dd>${questions.length} question(s)</dd>
      <dt>Unpublished changes</dt><dd>${draft ? "Yes" : "No"}</dd></dl></div>
      <h3>1. Load a JSON file (optional)</h3>
      <p class="muted" style="margin-top:0">Start from a JSON file on this device. It becomes your working copy; nothing goes live yet.</p>
      <input type="file" id="pbFile" accept=".json,application/json" hidden>
      <button class="btn secondary" id="pbPick">Choose JSON file</button><div id="pbPrev"></div>
      <h3>2. Copy the JSON</h3>
      <p class="muted" style="margin-top:0">This copies your working copy in a form that is safe to paste into Blogger.</p>
      <div class="btnrow"><button class="btn" id="pbCopy" ${questions.length ? "" : "disabled"}>Copy JSON for Blogger</button>
      <button class="btn secondary" id="pbDown" ${questions.length ? "" : "disabled"}>Download JSON</button></div>
      ${pendingImagesHtml()}
      <h3>3. Paste it into your blog</h3>
      <ol class="steps">
        <li>In Blogger, go to <b>Pages</b> and open the page titled <b>${esc(CFG.title)}</b>. Create it the first time, and do not add it to your menu.</li>
        <li>Switch to <b>HTML view</b> (the &lt;&gt; button, never Compose view). Select everything, delete it, and paste.</li>
        <li>Click <b>Publish</b> or <b>Update</b>. Visitors get the new questions within a few minutes.</li>
      </ol>`;
    if (draft) h += `<h3>Discard changes</h3><p class="muted" style="margin-top:0">Go back to what is live on the blog.</p><button class="btn danger" id="pbDiscard">Discard unpublished changes</button>`;
    page.innerHTML = h;

    $("#pbPick").onclick = () => $("#pbFile").click();
    $("#pbFile").onchange = async e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const list = normalize(JSON.parse(await f.text()));
        if (!list.length) throw new Error("The file has no questions.");
        pending = { name: f.name, list, warnings: normalizeWarnings.slice() };
      } catch (err) {
        pending = null;
        $("#pbPrev").innerHTML = notice("This file cannot be used. " + (err instanceof SyntaxError ? "It is not valid JSON." : errText(err)), "error");
        return;
      }
      showPending();
    };
    if (pending) showPending();
    $("#pbCopy").onclick = async () => {
      const ok = await copyText(blogSafeJson(questions));
      toast(ok ? "Copied. Now paste it into the blog page (HTML view)." : "Could not copy. Use Download JSON instead.", ok ? "success" : "error");
    };
    $("#pbDown").onclick = downloadJson;
    bindPendingImages();
    if (draft) $("#pbDiscard").onclick = e => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to confirm"; return; }
      draft = null; clearDraft(); applyWorking(); toast("Unpublished changes discarded.", "success"); render();
    };
  },

  add() {
    if (loadState === "loading" || loadState === "error") { page.innerHTML = header("Add New Question") + bankProblem(); return; }
    page.innerHTML = header("Add New Question", "Create a new MCQ entry") + `
      <div class="field"><label class="lbl" for="aQ">Question *</label><textarea id="aQ"></textarea></div>
      ${imagePickerHtml("aImg")}
      <div class="field"><label class="lbl">Options</label><div class="grid2">${optionInputs("aO", true)}</div></div>
      <div class="field"><label class="lbl" for="aAns">Correct Answer *</label>
        <select id="aAns">${LETTERS.map(l => `<option>${l}</option>`).join("")}</select></div>
      <button class="btn block" id="aSave">Save Question</button>`;
    const aImg = bindImagePicker("aImg", "");
    $("#aSave").onclick = async () => {
      if (aImg.busy()) { toast("Please wait, the picture is still being processed.", "warn"); return; }
      const question = $("#aQ").value.trim();
      const opts = {};
      LETTERS.forEach(l => { opts[l] = $("#aO" + l).value.trim(); });
      if (!question || !LETTERS.every(l => opts[l])) { toast("Please fill in the question and all four options.", "error"); return; }
      const id = nextId();
      const nq = { id, question, options: opts, answer: $("#aAns").value };
      if (aImg.get()) nq.image = aImg.get();
      const list = [...questions, nq];
      if (await commit(list, `Question added successfully! (ID: ${id})`)) {
        $("#aQ").value = "";
        LETTERS.forEach(l => { $("#aO" + l).value = ""; });
        $("#aAns").selectedIndex = 0;
        aImg.reset();
        updateSide();
      }
    };
  },

  edit() {
    let h = header("Edit Question", "Update an existing MCQ");
    if (!questions.length) { page.innerHTML = h + (bankProblem() || notice("No questions available to edit.", "warn")); return; }
    h += `<div class="field"><label class="lbl" for="eSel">Select Question ID</label><select id="eSel">${idOptions()}</select></div>
      <div class="field"><label class="lbl" for="eQ">Question</label><textarea id="eQ"></textarea></div>
      ${imagePickerHtml("eImg")}
      <div class="field"><label class="lbl">Options</label><div class="grid2">${optionInputs("eO", false)}</div></div>
      <div class="field"><label class="lbl" for="eAns">Correct Answer</label>
        <select id="eAns">${LETTERS.map(l => `<option>${l}</option>`).join("")}</select></div>
      <button class="btn block" id="eSave">Update Question</button>`;
    page.innerHTML = h;
    const eImg = bindImagePicker("eImg", "");
    const load = () => {
      const q = findQ(Number($("#eSel").value));
      if (!q) return;
      $("#eQ").value = q.question;
      LETTERS.forEach(l => { $("#eO" + l).value = q.options[l]; });
      $("#eAns").value = q.answer;
      eImg.set(q.image || "");
    };
    $("#eSel").onchange = load;
    load();
    $("#eSave").onclick = async () => {
      const id = Number($("#eSel").value);
      const nq = $("#eQ").value.trim();
      const opts = {};
      LETTERS.forEach(l => { opts[l] = $("#eO" + l).value.trim(); });
      if (eImg.busy()) { toast("Please wait, the picture is still being processed.", "warn"); return; }
      const cur = findQ(id);
      if (!cur) { toast("That question no longer exists.", "error"); return; }
      const hasOptImg = l => !!(cur.optionImages && cur.optionImages[l]);   // an option may be a picture only
      if (!nq || !LETTERS.every(l => opts[l] || hasOptImg(l))) { toast("The question and all four options must be filled in.", "error"); return; }
      const list = questions.map(q => {
        if (q.id !== id) return q;
        const u = { ...q, question: nq, options: opts, answer: $("#eAns").value };
        if (eImg.get()) u.image = eImg.get(); else delete u.image;
        return u;
      });
      await commit(list, "Question updated successfully!");
    };
  },

  delete() {
    let h = header("Delete Question", "Permanently remove a question");
    if (!questions.length) { page.innerHTML = h + (bankProblem() || notice("No questions available to delete.", "warn")); return; }
    h += `<div class="field"><label class="lbl" for="dSel">Select Question ID to delete</label><select id="dSel">${idOptions()}</select></div>
      <h3 style="margin-top:0">Preview</h3><div id="dPrev"></div>
      ${notice("This action cannot be undone. It changes the file for every user.", "warn")}
      <label class="check" style="margin:8px 0 12px"><input type="checkbox" id="dConf"><span id="dConfText"></span></label>
      <button class="btn danger block" id="dBtn" disabled>Delete Permanently</button>`;
    page.innerHTML = h;
    const refresh = () => {
      const id = Number($("#dSel").value);
      const q = findQ(id);
      $("#dPrev").innerHTML = q ? qcard(q) : "";
      $("#dConfText").textContent = `I confirm I want to delete Question ID ${id}`;
      $("#dConf").checked = false;
      $("#dBtn").disabled = true;
    };
    $("#dSel").onchange = refresh;
    $("#dConf").onchange = e => { $("#dBtn").disabled = !e.target.checked; };
    $("#dBtn").onclick = async () => {
      const id = Number($("#dSel").value);
      if (await commit(questions.filter(q => q.id !== id), `Question ID ${id} deleted.`)) go("delete");
    };
    refresh();
  },

  view() {
    let h = header("Question Bank", `${questions.length} question(s) stored`);
    if (!questions.length) { page.innerHTML = h + (bankProblem() || notice("No questions yet.", "info")); return; }
    h += `<div class="field"><label class="lbl" for="vSearch">Search questions</label><input type="text" id="vSearch" autocomplete="off"></div>
      <label class="check"><input type="checkbox" id="vAns" checked><span>Show correct answers</span></label>
      <p class="muted" id="vCount" style="margin:8px 0 12px;font-size:13px"></p><div id="vList"></div>`;
    page.innerHTML = h;
    const draw = () => {
      const term = $("#vSearch").value.trim().toLowerCase();
      const list = term ? questions.filter(q => q.question.toLowerCase().includes(term) ||
        LETTERS.some(l => q.options[l].toLowerCase().includes(term))) : questions;
      $("#vCount").textContent = `Showing ${list.length} of ${questions.length}`;
      const show = $("#vAns").checked;
      $("#vList").innerHTML = sortById(list).map(q => qcard(q, show)).join("");
    };
    let t;
    $("#vSearch").oninput = () => { clearTimeout(t); t = setTimeout(draw, 200); };
    $("#vAns").onchange = draw;
    draw();
  },

  quiz() {
    if (!quiz.active && !quiz.results) quizMenu();
    else if (quiz.active && !quiz.results) quizActive();
    else quizResults();
  },
};

/* Admin: preview of a chosen file */
function showPending() {
  if (!pending) return;
  $("#pbPrev").innerHTML = notice(`${pending.name} is valid: ${pending.list.length} question(s) found.`, "success") +
    (pending.warnings || []).slice(0, 5).map(w => notice(w, "warn")).join("") +
    `<p class="muted" style="margin:10px 0 6px;font-size:13px">First question in the file:</p>${qcard(pending.list[0])}
     <div class="btnrow"><button class="btn" id="pbUse">Use as working copy</button><button class="btn secondary" id="pbCancel">Cancel</button></div>`;
  $("#pbCancel").onclick = () => { pending = null; $("#pbPrev").innerHTML = ""; };
  $("#pbUse").onclick = async () => {
    const p = pending; pending = null;
    await commit(p.list, `${p.name} loaded`);
    render();
  };
}

/* HTML-safe JSON, so it survives being pasted into Blogger's HTML view */
function blogSafeJson(list) {
  return JSON.stringify(list, null, 1).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
    return ok;
  }
}
function downloadJson() {
  const blob = new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = currentFile || FALLBACK_FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ═════════════════════════════════════════════════════════════════════
   SAVED QUIZ PROGRESS (NEW)
   After every step the quiz is stored in localStorage (one save per question file).
   Only question ids, the position, the score and the option order are stored, so the save is
   small and the questions themselves are always taken fresh from the file when resuming.
   ═════════════════════════════════════════════════════════════════════ */
const quizSaveKey = () => QUIZ_SAVE_PREFIX + currentFile;
let saveWarned = false;
const validOrder = o => Array.isArray(o) && o.length === LETTERS.length && LETTERS.every(l => o.includes(l));

/* order = original letters in the order they are shown, e.g. ["C","A","D","B"] */
function buildOpts(q, order) {
  const options = {}, images = {}, map = {};
  order.forEach((orig, i) => {
    const L = LETTERS[i];
    options[L] = q.options[orig];
    if (q.optionImages && q.optionImages[orig]) images[L] = q.optionImages[orig];
    map[orig] = L;
  });
  return { options, images, correct: map[q.answer], order: order.slice() };
}

const makeDetail = (q, yourAnswer, correctAnswer) => ({
  id: q.id, question: q.question, passage: q.passage || "", image: q.image || "", passageImage: q.passageImage || "",
  yourAnswer, correctAnswer,
});

function saveQuiz() {
  if (!currentFile || !(quiz.active || quiz.results) || !Array.isArray(quiz.list) || !quiz.list.length) return;
  try {
    localStorage.setItem(quizSaveKey(), JSON.stringify({
      v: 1, t: Date.now(), active: !!quiz.active, results: !!quiz.results, retest: !!quiz.retest,
      ids: quiz.list.map(q => q.id), idx: quiz.idx, score: quiz.score,
      wrong: quiz.wrong.map(q => q.id),
      details: quiz.details.map(d => ({ id: d.id, yourAnswer: d.yourAnswer, correctAnswer: d.correctAnswer })),
      answered: !!quiz.answered, chosen: quiz.chosen || "",
      order: quiz.opts && validOrder(quiz.opts.order) ? quiz.opts.order : null,
    }));
  } catch (e) {
    if (!saveWarned) { saveWarned = true; toast("Could not save quiz progress on this device.", "warn"); }
  }
}
function clearSavedQuiz() { try { localStorage.removeItem(quizSaveKey()); } catch (e) { /* ignore */ } }

/* Rebuilds a quiz from the save, or returns null when there is nothing usable. Never throws. */
function readSavedQuiz() {
  if (!currentFile || !questions.length) return null;
  const key = quizSaveKey();
  let s = null;
  try { s = JSON.parse(localStorage.getItem(key) || "null"); }
  catch (e) { try { localStorage.removeItem(key); } catch (e2) { /* ignore */ } return null; }   // damaged save
  try {
    if (!s || s.v !== 1 || !Array.isArray(s.ids) || !s.ids.length || !(s.active || s.results)) return null;
    if (!(Date.now() - Number(s.t) < QUIZ_MAX_AGE)) { localStorage.removeItem(key); return null; }   // too old (or no date)

    const byId = new Map(questions.map(q => [q.id, q]));
    const found = s.ids.map(id => byId.get(id) || null);      // a question deleted since the save becomes null
    const list = found.filter(Boolean);
    if (!list.length) return null;

    const wrong = (Array.isArray(s.wrong) ? s.wrong : []).map(id => byId.get(id)).filter(Boolean);
    const details = (Array.isArray(s.details) ? s.details : []).map(d => {
      const q = d && byId.get(d.id);
      return q ? makeDetail(q, String(d.yourAnswer), String(d.correctAnswer)) : null;
    }).filter(Boolean);
    const st = { ...freshQuiz(), list, retest: !!s.retest, wrong, details,
                 score: Math.max(0, Math.min(list.length, Number(s.score) || 0)) };

    if (s.results && !s.active) { st.results = true; return { quiz: st, t: s.t }; }

    const idx = Number.isInteger(s.idx) ? s.idx : -1;
    if (idx < 0 || idx >= s.ids.length) return null;
    const newIdx = found.slice(0, idx).filter(Boolean).length;     // position after removing deleted questions
    if (newIdx >= list.length) { st.results = true; return { quiz: st, t: s.t }; }   // nothing left to answer
    st.active = true;
    st.idx = newIdx;
    if (found[idx] && validOrder(s.order)) {                       // current question unchanged: restore option order and answer
      st.opts = buildOpts(list[newIdx], s.order);
      if (s.answered && LETTERS.includes(s.chosen)) { st.answered = true; st.chosen = s.chosen; }
    }
    return { quiz: st, t: s.t };
  } catch (e) { return null; }
}

function resumeCard() {
  if (quiz.active || quiz.results) return "";
  const s = readSavedQuiz();
  if (!s) return "";
  const st = s.quiz, total = st.list.length;
  const title = st.results ? "Last quiz results saved" : "Unfinished quiz found";
  const line = st.results ? `Finished: ${st.score} of ${total} correct.` : `Question ${st.idx + 1} of ${total} · ${st.score} correct so far.`;
  return `<div class="card resumecard"><div class="rtitle">${esc(title)}</div>
    <div class="muted" style="font-size:13px;margin-bottom:10px">${esc(line)}${s.t ? `<br>Saved ${esc(fmtDate(s.t))}` : ""}</div>
    <div class="btnrow"><button class="btn" id="qResume">${st.results ? "View Results" : "Resume Quiz"}</button>
    <button class="btn secondary" id="qDiscard">Discard</button></div></div>`;
}
function bindResume() {
  const r = $("#qResume"), d = $("#qDiscard");
  if (r) r.onclick = resumeSavedQuiz;
  if (d) d.onclick = e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to discard"; return; }
    clearSavedQuiz();
    toast("Saved quiz discarded.", "success");
    render();
  };
}
function resumeSavedQuiz() {
  const s = readSavedQuiz();
  if (!s) { toast("The saved quiz could not be restored.", "error"); render(); return; }
  quiz = s.quiz; pending = null;
  go("quiz");
}

/* ───────── Quiz ───────── */
function startQuiz(list, retest) {
  quiz = freshQuiz();
  quiz.active = true;
  quiz.retest = retest;
  quiz.list = shuffleKeepingSets(list);
}

/* NEW: questions of one passage set stay together and in their original order;
   standalone questions and whole sets are shuffled as units (old behaviour for plain questions). */
function shuffleKeepingSets(list) {
  const units = [], byGroup = new Map();
  list.forEach(q => {
    if (!q.group) { units.push([q]); return; }
    if (!byGroup.has(q.group)) { const u = []; byGroup.set(q.group, u); units.push(u); }
    byGroup.get(q.group).push(q);
  });
  return shuffle(units).flat();
}
function startFullQuiz() {
  /* NEW: never silently throw away a quiz that is in progress or saved */
  if ((quiz.active && !quiz.results) || (!quiz.active && !quiz.results && readSavedQuiz())) {
    toast("You have a quiz in progress. Resume it, or start a new one from the Take Quiz page.", "warn");
    go("quiz");
    return;
  }
  startQuiz(questions, false); go("quiz");
}

function quizMenu() {
  let h = header("Take Quiz", "Randomized questions with shuffled options");
  if (!questions.length) { page.innerHTML = h + (bankProblem() || notice("No questions available.", "warn")); return; }
  const sets = new Set(questions.filter(q => q.group).map(q => q.group)).size;   // NEW
  h += notice(`${questions.length} questions ready. Options will be shuffled every time.${sets ? ` ${sets} passage set(s) are kept together.` : ""}`, "info");
  const saved = readSavedQuiz();
  h += resumeCard();
  h += `<button class="btn ${saved ? "secondary " : ""}block" id="qStart" style="margin-top:10px">${saved ? "Start New Full Quiz" : "Start Full Quiz"}</button>`;
  page.innerHTML = h;
  bindResume();
  $("#qStart").onclick = e => {
    const b = e.currentTarget;
    if (saved && !b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again: this replaces your saved quiz"; return; }
    startQuiz(questions, false); go("quiz");
  };
}

function shuffleOptions(q) { return buildOpts(q, shuffle(LETTERS)); }

function quizActive() {
  const total = quiz.list.length;
  const q = quiz.list[quiz.idx];
  if (!q) { quiz = freshQuiz(); quizMenu(); return; }          // NEW: safety net, never crash on a bad position
  if (!quiz.opts || !quiz.opts.options) quiz.opts = shuffleOptions(q);
  const { options, correct, images } = quiz.opts;
  const done = quiz.answered;

  /* NEW – passage sets: the passage stays visible next to (or above, on phones) every sub-question of its set */
  const hasPassage = !!((q.passage && q.passage.trim()) || q.passageImage);
  let setBadge = "";
  if (q.group) {
    const members = quiz.list.filter(x => x.group === q.group);
    if (members.length > 1) setBadge = `<span class="setbadge">Passage set · part ${members.indexOf(q) + 1} of ${members.length}</span>`;
  }
  /* keep the passage scroll position when Submit / Next re-draw the page inside the same set */
  const oldPanel = page.querySelector(".passage");
  const keepScroll = (hasPassage && oldPanel && oldPanel.dataset.group === String(q.group)) ? oldPanel.scrollTop : 0;

  let h = header("Take Quiz");
  h += `<div class="bar"><div style="width:${total ? (quiz.idx / total) * 100 : 0}%"></div></div>`;

  let body = `<div style="font-weight:bold">Question ${quiz.idx + 1} of ${total}</div>
    <div class="muted" style="font-size:13px;margin-bottom:16px">${quiz.retest ? "Retest mode" : "Full quiz"} &nbsp;•&nbsp; Score so far: ${quiz.score}</div>
    ${setBadge}
    ${questionHtml(q.question)}
    ${figure(q.image, q.imageAlt, { zoom: true })}
    <div class="muted" style="font-size:12px;margin:2px 0 14px">ID: ${q.id}</div>`;

  body += Object.entries(options).map(([l, text]) => {
    let cls = "";
    if (done) cls = l === correct ? " good" : (l === quiz.chosen ? " bad" : "");
    return `<label class="opt${done ? " locked" : ""}${cls}">
      <input type="radio" name="opt" value="${l}" ${done ? "disabled" : ""} ${done && l === quiz.chosen ? "checked" : ""}>
      <span>${l}.&nbsp; ${esc(text)}${images && images[l] ? imgHtml(images[l], "Option " + l, { small: true }) : ""}</span></label>`;
  }).join("");

  body += `<div id="qAction" style="margin-top:14px">`;
  if (!done) {
    body += `<button class="btn block" id="qSubmit">Submit Answer</button>`;
  } else {
    if (quiz.chosen === correct) body += notice(`Correct! The answer is ${correct}. ${options[correct]}`, "success");
    else body += notice(`Wrong. You chose ${quiz.chosen}. ${options[quiz.chosen]}`, "error") +
              notice(`Correct answer: ${correct}. ${options[correct]}`, "info");
    body += quiz.idx + 1 < total
      ? `<button class="btn block" id="qNext" style="margin-top:8px">Next Question  →</button>`
      : `<button class="btn block" id="qFinish" style="margin-top:8px">Finish Quiz</button>`;
  }
  body += `</div>`;

  if (hasPassage) {
    h += `<div class="qlayout">
      <aside class="passage" data-group="${esc(q.group)}" aria-label="Passage">
        <h4>${esc(q.passageTitle || "Passage")}</h4><div class="rich">${richText(q.passage || "")}</div>${figure(q.passageImage, "Passage image", { zoom: true })}
      </aside>
      <div class="qcol">${body}</div></div>`;
  } else {
    h += body;   // plain question: exactly the same markup as before
  }
  page.classList.toggle("wide", hasPassage);
  page.innerHTML = h;
  if (keepScroll) { const np = page.querySelector(".passage"); if (np) np.scrollTop = keepScroll; }

  if (!done) {
    $("#qSubmit").onclick = () => {
      const picked = page.querySelector('input[name="opt"]:checked');
      if (!picked) { toast("Please choose an option first.", "warn"); return; }
      const user = picked.value;
      quiz.answered = true;
      quiz.chosen = user;
      if (user === correct) quiz.score++;
      else {
        quiz.wrong.push(q);
        quiz.details.push(makeDetail(q, `${user}. ${options[user]}`, `${correct}. ${options[correct]}`));
      }
      quizActive();
    };
  } else if ($("#qNext")) {
    $("#qNext").onclick = () => { quiz.idx++; quiz.answered = false; quiz.chosen = ""; quiz.opts = null; render(); window.scrollTo(0, 0); };
  } else {
    $("#qFinish").onclick = () => { quiz.active = false; quiz.results = true; render(); window.scrollTo(0, 0); };
  }
  saveQuiz();   // NEW: remember exactly where the person is (also runs after Submit and after Next)
}

function quizResults() {
  saveQuiz();   // NEW: results survive a reload too, so the wrong answers can still be reviewed and retested
  const total = quiz.list.length, score = quiz.score;
  const pct = total ? (score / total) * 100 : 0;
  let h = header("Take Quiz", "Quiz Results" + (quiz.retest ? " (Retest)" : ""));
  h += `<div class="metrics">${metric(total, "Total", "var(--accent)")}${metric(score, "Correct", "var(--green)")}${metric(total - score, "Wrong", "var(--red)")}${metric(pct.toFixed(1) + "%", "Score", "var(--purple)")}</div>`;
  if (pct === 100) h += notice("Perfect! All correct!", "success");
  else if (pct >= 80) h += notice("Excellent work!", "success");
  else if (pct >= 60) h += notice("Good job! Keep practicing.", "info");
  else h += notice("Keep practicing. You'll improve!", "warn");

  if (quiz.details.length) {
    h += `<h3>Review Wrong Answers</h3>` + quiz.details.map((w, i) => `
      <div class="card wrong-card"><div class="q">${i + 1}. [ID: ${w.id}] ${esc(w.question)}</div>${figure(w.image, "Question image", { zoom: true })}
      <div class="y">Your answer: ${esc(w.yourAnswer)}</div><div class="a">Correct: ${esc(w.correctAnswer)}</div>${(w.passage || w.passageImage) ? `<details class="qpassage"><summary>Show passage</summary>${w.passage ? `<div class="rich">${richText(w.passage)}</div>` : ""}${figure(w.passageImage, "Passage image", { zoom: true })}</details>` : ""}</div>`).join("");
    h += `<h3 style="margin-bottom:0">Retest Wrong Questions</h3>
      <p class="muted" style="margin:0 0 8px;font-size:13px">${quiz.wrong.length} question(s) left to master</p>
      <button class="btn block" id="qRetest">Retest Only Wrong Ones</button>`;
  } else if (quiz.retest) {
    h += notice("Congratulations! You corrected all previously wrong questions!", "success");
  }
  h += `<button class="btn secondary block" id="qBack" style="margin-top:14px">Back to Quiz Menu</button>`;
  page.innerHTML = h;

  if ($("#qRetest")) $("#qRetest").onclick = () => { startQuiz(quiz.wrong, true); go("quiz"); };
  $("#qBack").onclick = () => { quiz = freshQuiz(); clearSavedQuiz(); go("quiz"); };
}

/* ═════════════════════════════════════════════════════════════════════
   KEYBOARD NAVIGATION FOR THE QUIZ  (new code – nothing above this line was changed)

   Keys (only while a question is on screen):
     A / B / C / D  → select that option (case-insensitive)
     ↑ / ↓          → move the highlight (also selects, wraps around)
     Enter / Space  → submit the highlighted option
                      (after answering: go to Next Question / Finish)

   How it hooks into the existing code (no existing function is modified):
     • quiz / current / page ........ existing state + the #page container
     • LETTERS ...................... maps keys to the option letters
     • label.opt (not .locked) ...... the option rows built by quizActive()
     • input[name="opt"] ............ the radio inputs; qSubmit reads :checked
     • #qSubmit / #qNext / #qFinish . existing buttons – we simply .click() them,
                                      so scoring and rendering stay untouched
   ═════════════════════════════════════════════════════════════════════ */
const KB_CLASS = "quiz-option-focused";
let kbAbort = null;   // lets us remove every listener in one call

/* 1) Highlight style, injected once so no .css file needs editing */
function injectKbStyles() {
  if (document.getElementById("quiz-kb-style")) return;
  const st = document.createElement("style");
  st.id = "quiz-kb-style";
  st.textContent = `
    label.opt.${KB_CLASS} {
      outline: 3px solid var(--accent, #38bdf8);
      outline-offset: 2px;
      background: rgba(56, 189, 248, 0.16);
      box-shadow: 0 0 0 5px rgba(56, 189, 248, 0.22), 0 4px 14px rgba(0, 0, 0, 0.25);
      transform: translateX(4px);
      transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
    }
    label.opt.${KB_CLASS} span { font-weight: 600; }
  `;
  document.head.appendChild(st);
}

/* 2) Helpers – the highlight lives only in the DOM, so when quizActive()
      rebuilds the page for the next question it is cleared automatically
      (no stale index, no leftover state). */
const kbOptions = () => [...page.querySelectorAll("label.opt:not(.locked)")];
const kbRadio = label => label.querySelector('input[name="opt"]');

function kbCurrentIndex(labels) {
  let i = labels.findIndex(l => l.classList.contains(KB_CLASS));
  if (i < 0) i = labels.findIndex(l => kbRadio(l) && kbRadio(l).checked);   // e.g. picked with the mouse
  return i;
}

function kbSetFocus(labels, i) {
  labels.forEach((l, n) => l.classList.toggle(KB_CLASS, n === i));
  const label = labels[i];
  if (!label) return;
  const radio = kbRadio(label);
  if (radio) radio.checked = true;            // so the existing #qSubmit handler sees it
  label.scrollIntoView({ block: "nearest" });
}

/* 3) The single key handler */
function onQuizKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.getElementById("imgbox")) { closeLightbox(); e.preventDefault(); return; }   // NEW: any key closes a zoomed picture
  if (current !== "quiz" || !quiz.active || quiz.results) return;   // quiz screen only

  // Leave typing fields and real buttons/links alone (they handle Enter/Space natively)
  const t = e.target;
  if (t && t.closest && t.closest("textarea, select, button, a, [contenteditable='true'], input:not([type='radio'])")) return;

  const key = e.key;
  const isConfirm = key === "Enter" || key === " " || key === "Spacebar";

  /* Question answered → Enter/Space moves on */
  if (quiz.answered) {
    if (!isConfirm) return;
    e.preventDefault();
    if (e.repeat) return;                       // holding the key must not skip questions
    const next = $("#qNext") || $("#qFinish");
    if (next) next.click();
    return;
  }

  const labels = kbOptions();
  if (!labels.length) return;

  /* A–D */
  if (key.length === 1 && LETTERS.includes(key.toUpperCase())) {
    const i = labels.findIndex(l => kbRadio(l) && kbRadio(l).value === key.toUpperCase());
    if (i >= 0) { e.preventDefault(); kbSetFocus(labels, i); }
    return;
  }

  /* ↑ / ↓ */
  if (key === "ArrowDown" || key === "ArrowUp") {
    e.preventDefault();
    const cur = kbCurrentIndex(labels);
    const step = key === "ArrowDown" ? 1 : -1;
    const next = cur < 0 ? (step === 1 ? 0 : labels.length - 1)
                         : (cur + step + labels.length) % labels.length;
    kbSetFocus(labels, next);
    return;
  }

  /* Enter / Space → reuse the existing Submit button (it shows its own
     "Please choose an option first." toast if nothing is selected) */
  if (isConfirm) {
    e.preventDefault();
    if (e.repeat) return;
    const btn = $("#qSubmit");
    if (btn) btn.click();
  }
}

/* Keep the highlight in sync when the user clicks an option with the mouse */
function onQuizChange(e) {
  if (!e.target || e.target.name !== "opt") return;
  kbOptions().forEach(l => l.classList.toggle(KB_CLASS, l.contains(e.target)));
}

/* 4) Install once; calling it again first removes the old listeners (no duplicates/leaks) */
function installQuizKeyboard() {
  if (kbAbort) kbAbort.abort();
  kbAbort = new AbortController();
  const { signal } = kbAbort;
  injectKbStyles();
  document.addEventListener("keydown", onQuizKey, { signal });
  page.addEventListener("change", onQuizChange, { signal });   // #page is permanent; its children are replaced
  window.addEventListener("pagehide", () => kbAbort && kbAbort.abort(), { once: true, signal });
}

/* ───────── Init ───────── */
/* Local-file fallback: only used when the page cannot reach a blog (e.g. opened as a plain file for testing) */
$("#localInput").onchange = async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    blogList = normalize(JSON.parse(await f.text()));
    bankInfo = { updated: null, count: blogList.length, name: f.name };
    applyWorking();
    quiz = freshQuiz();
    toast(`Loaded ${blogList.length} question(s) from ${f.name}`, "success");
    go("dashboard");
  } catch (err) { toast("Could not load file: " + errText(err), "error"); }
};
$("#authBtn").onclick = () => { if (isAdmin) logout(); else go("login"); };

try { isAdmin = sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) {}
buildNav();
applyWorking();
installQuizKeyboard();   // keyboard navigation (see block above)
injectImgStyles();       // picture styles (see PICTURES block)
window.addEventListener("pagehide", saveQuiz);                                             // last-chance save when the page closes
document.addEventListener("visibilitychange", () => { if (document.hidden) saveQuiz(); });  // and when the app goes to the background
render();
loadBlog();
loadPendingImages();     // admin: pictures chosen earlier that are not uploaded yet
