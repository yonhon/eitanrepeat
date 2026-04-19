// Minimal vocab test app (Vanilla JS) - v0.8.2
const APP_VERSION = "0.8.2";
const $ = (id) => document.getElementById(id);

const DB_KEY = "vocab_app_db_v1";
const DB_SCHEMA_VERSION = 1;
const ACCESS_API_PATH = "/api/access";
const CSV_BASE_PATH = "csv/";
const PUBLIC_MODE = true;

// Wordbook (単語集) config
const BOOKS = [
  { key: "A1",  label: "中学2年生レベル（1,165語）", wordsFile: "words_A1.csv", examplesFile: "examples_A1.csv", isPublic: true },
  { key: "A2",  label: "高校1年生レベル（1,411語）", wordsFile: "words_A2.csv", examplesFile: "examples_A2.csv", isPublic: true },
  { key: "B1",  label: "高校3年生レベル（2,444語）", wordsFile: "words_B1.csv", examplesFile: "examples_B1.csv", isPublic: true },
  { key: "B2",  label: "大学中上級レベル（2,779語）", wordsFile: "words_B2.csv", examplesFile: "examples_B2.csv", isPublic: true },
];

const DEFAULT_BOOK_KEY = "A2";

function getAvailableBooks(){
  return PUBLIC_MODE ? BOOKS.filter((b) => b.isPublic !== false) : BOOKS.slice();
}

function getBookConfig(key){
  const available = getAvailableBooks();
  const k = String(key || "");
  return available.find((b) => b.key === k)
    || available.find((b) => b.key === DEFAULT_BOOK_KEY)
    || available[0]
    || BOOKS[0];
}

function getSelectedBook(){
  const db = loadDB();
  const k = db?.selectedBook ? String(db.selectedBook) : "";
  return getBookConfig(k).key;
}

function setSelectedBook(key){
  const db = loadDB();
  db.selectedBook = getBookConfig(key).key;
  saveDB(db); // Keep schemaVersion = 1 and append field in existing localStorage
}

function renderBookSelectOptions(){
  const bookSel = $("bookSelect");
  if (!bookSel) return;
  const available = getAvailableBooks();
  bookSel.innerHTML = "";
  for (const book of available){
    const option = document.createElement("option");
    option.value = book.key;
    option.textContent = book.label;
    bookSel.appendChild(option);
  }
}


function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [] };
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== DB_SCHEMA_VERSION) return { schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [] };
    obj.weakIds = Array.isArray(obj.weakIds) ? obj.weakIds.map(String) : [];
    obj.masteredIds = Array.isArray(obj.masteredIds) ? obj.masteredIds.map(String) : [];
    obj.correctIds = Array.isArray(obj.correctIds) ? obj.correctIds.map(String) : [];
    return obj;
  }catch(e){
    return { schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [] };
  }
}

function saveDB(db){
  try{
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }catch(e){}
}

function createClientId(){
  try{
    if (window.crypto && typeof window.crypto.randomUUID === "function"){
      return window.crypto.randomUUID();
    }
  }catch(e){}
  const rand = Math.random().toString(36).slice(2, 10);
  return `c-${Date.now().toString(36)}-${rand}`;
}

function ensureClientId(){
  const db = loadDB();
  const current = String(db.clientId || "").trim();
  if (current) return current;
  const clientId = createClientId();
  db.clientId = clientId;
  saveDB(db);
  return clientId;
}

function trackStart(){
  const clientId = ensureClientId();
  const payload = {
    clientId,
    eventType: "start",
    appVersion: APP_VERSION,
    occurredAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  try{
    if (navigator.sendBeacon){
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ACCESS_API_PATH, blob);
      return;
    }
  }catch(e){}

  try{
    fetch(ACCESS_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }catch(e){}
}

function getWeakSet(){
  const db = loadDB();
  return new Set((db.weakIds || []).map(String));
}

function setWeakSet(weakSet){
  const db = loadDB();
  db.weakIds = Array.from(weakSet).map(String);
  saveDB(db);
}

function getMasteredSet(){
  const db = loadDB();
  return new Set((db.masteredIds || []).map(String));
}

function getCorrectSet(){
  const db = loadDB();
  return new Set((db.correctIds || []).map(String));
}

function setCorrectSet(correctSet){
  const db = loadDB();
  db.correctIds = Array.from(correctSet).map(String);
  saveDB(db);
}

function setMasteredSet(masteredSet){
  const db = loadDB();
  db.masteredIds = Array.from(masteredSet).map(String);
  saveDB(db);
}

function exportDB(){
  const db = loadDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vocab-db-${APP_VERSION}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importDBFromFile(file){
  const text = await file.text();
  const obj = JSON.parse(text);
  if (!obj || obj.schemaVersion !== DB_SCHEMA_VERSION) throw new Error("unsupported schemaVersion");
  if (!Array.isArray(obj.weakIds) || !Array.isArray(obj.masteredIds)) throw new Error("invalid format");
  const correctIds = Array.isArray(obj.correctIds) ? obj.correctIds.map(String) : [];
  saveDB({ schemaVersion: DB_SCHEMA_VERSION, weakIds: obj.weakIds.map(String), masteredIds: obj.masteredIds.map(String), correctIds });
}

function clearDB(){
  const clientId = ensureClientId();
  saveDB({ schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [], clientId });
}

async function updateHomeStats(){
  // Stats should reflect the currently selected wordbook only.
  try{
    await ensureBookWords(getSelectedBook());
  }catch(e){}

  const ids = state.bookWordIds; // Set of ids in the current wordbook (may be undefined on fetch error)

  const countIn = (set) => {
    if (!ids || !(ids instanceof Set)) return set.size;
    let c = 0;
    for (const id of set){
      if (ids.has(String(id))) c += 1;
    }
    return c;
  };

  const weak = getWeakSet();
  const mastered = getMasteredSet();
  const correct = getCorrectSet();

  const weakEl = $("weakCount");
  if (weakEl) weakEl.textContent = String(countIn(weak));
  const masteredEl = $("masteredCount");
  if (masteredEl) masteredEl.textContent = String(countIn(mastered));
  const correctEl = $("homeCorrectCount");
  if (correctEl) correctEl.textContent = String(countIn(correct));
}

const state = {
  settings: { count: 10, buttonAlign: "left", mode: "normal" },
  session: null,
  recognizer: null,
  speechActive: false,
};

function setEndBtnVisible(on){
  const b = $("endBtn");
  if (!b) return;
  b.classList.toggle("hidden", !on);
}

function setScreen(name){
  ["Home","Test","Result","WordList"].forEach((n) => $("screen"+n).classList.add("hidden"));
  setEndBtnVisible(name === "Test");
  $("screen"+name).classList.remove("hidden");  const bs = $("bookSelect");
  if (bs) bs.disabled = (name !== "Home");
}


function applyButtonAlign(){
  // Policy:
  // - Standard (left edge): Submit and Speak are placed on LEFT edge.
  // - Right edge mode: Submit and Speak are placed on RIGHT edge.
  // Implementation:
  // - Alignment is controlled by CSS classes align-left/align-right.
  // - Visual ORDER is controlled by DOM reordering (no flex-direction tricks).
  const alignRight = (state.settings.buttonAlign === "right"); // right edge = left-handed mode
  const rows = document.querySelectorAll(".btnRow, .speechControls");
  rows.forEach((el) => {
    el.classList.toggle("align-left", !alignRight);
    el.classList.toggle("align-right", alignRight);
  });

  // Reorder main buttons
  const btnRow = document.querySelector(".btnRow");
  if (btnRow){
    const submit = document.getElementById("submitBtn");
    const next = document.getElementById("nextBtn");
    const skip = document.getElementById("skipBtn");
    if (submit && next && skip){
      if (alignRight){
        // Left-to-right: スキップ / 次へ / 送信
        btnRow.replaceChildren(skip, next, submit);
      } else {
        // Left-to-right: 送信 / 次へ / スキップ
        btnRow.replaceChildren(submit, next, skip);
      }
    }
  }

  // Reorder speech buttons (keep hint span at end)
  const sc = document.getElementById("speechControls");
  if (sc){
    const done = document.getElementById("speechDoneBtn");
    const mic = document.getElementById("micBtn");
    const hint = document.getElementById("speechHint");
    if (done && mic && hint){
      if (alignRight){
        // Left-to-right: 確定 / 話す
        sc.replaceChildren(done, mic, hint);
      } else {
        // Left-to-right: 話す / 確定
        sc.replaceChildren(mic, done, hint);
      }
    }
  }
}

function updateNetStatus(){
  const el = $("netStatus");
  const online = navigator.onLine;
  el.textContent = (online ? "オンライン" : "オフライン") + "\n" + "v" + APP_VERSION;
}
window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

function normalizeJa(s){
  if (!s) return "";
  let t = String(s).trim();

  // 1) Normalize spaces
  t = t.replace(/[\u3000\s]+/g, "");

  // 2) Remove bracketed content for ALL bracket types (A policy)
  const bracketPairs = [
    ["\\(", "\\)"], ["（", "）"],
    ["\\[", "\\]"], ["［", "］"],
    ["<", ">"], ["＜", "＞"],
    ["〈", "〉"], ["《", "》"],
  ];
  for (const [l,r] of bracketPairs){
    const re1 = new RegExp(l + "[^" + r + "]*" + r, "g");
    t = t.replace(re1, "");
  }

  // 3) Remove remaining bracket chars
  t = t.replace(/[()\[\]<>（）［］＜＞〈〉《》]/g, "");

  // 4) Remove placeholders
  t = t.replace(/[～〜]/g, "");
  t = t.replace(/(何々|なになに|〇〇|○○|△△|□□)/g, "");

  // 5) Remove punctuation
  t = t.replace(/[、。・,./／:;!?「」『』【】{}]/g, "");

  // 6) Katakana -> Hiragana
  t = t.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );

  // 7) Full-width ASCII -> half-width
  t = t.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );

  // 8) Light polite ending removal
  t = t.replace(/(です|ます)$/g, "");

  return t;
}

function expandAnswerPatterns(answerRaw){
  const raw = String(answerRaw || "");
  const patterns = new Set();

  const a = normalizeJa(raw);
  if (a) patterns.add(a);

  let b = raw.trim();
  b = b.replace(/[\u3000\s]+/g, "");
  b = b.replace(/[()\[\]<>（）［］＜＞〈〉《》]/g, "");
  b = b.replace(/[～〜]/g, "");
  b = b.replace(/(何々|なになに|〇〇|○○|△△|□□)/g, "");
  b = b.replace(/[、。・,./／:;!?「」『』【】{}]/g, "");
  b = b.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  b = b.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  b = b.replace(/(です|ます)$/g, "");
  b = b.trim();
  if (b) patterns.add(b);

  return patterns;
}

function isVerbLike(norm){
  return /(する|した|して|しない|します|しました|してる|している)$/.test(norm);
}

function levenshtein(a,b){
  const m=a.length,n=b.length;
  if (m===0) return n;
  if (n===0) return m;
  const dp = Array.from({length:m+1}, () => new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + cost
      );
    }
  }
  return dp[m][n];
}

function suggestAnswers(entry, userNorm){
  const norms = entry.answers.map(normalizeJa).filter(Boolean);
  const partial = norms
    .map((n, idx) => ({n, idx}))
    .filter(o => o.n && userNorm && (o.n.includes(userNorm) || userNorm.includes(o.n)))
    .slice(0,2)
    .map(o => entry.answers[o.idx]);
  if (partial.length) return partial;

  const scored = norms.map((n, idx) => ({idx, d: levenshtein(userNorm, n)}))
    .sort((x,y) => x.d - y.d);
  return scored.slice(0,2).map(s => entry.answers[s.idx]);
}

function judge(entry, userRaw){
  const userNorm = normalizeJa(userRaw);
  const ansNorms = entry.answers.map(normalizeJa).filter(Boolean);

  const correct = ansNorms.includes(userNorm);
  if (!correct && entry.expectedPos === "v"){
    if (!isVerbLike(userNorm)){
      return { result: "wrong", userNorm, suggestions: suggestAnswers(entry, userNorm) };
    }
  }
  return { result: correct ? "correct" : "wrong", userNorm, suggestions: correct ? [] : suggestAnswers(entry, userNorm) };
}

function parseCSVRows(text){
  const out = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"'){
      if (inQuotes && next === '"'){
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ","){
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")){
      row.push(field);
      out.push(row);
      row = [];
      field = "";
      if (ch === "\r" && next === "\n") i += 1;
      continue;
    }

    field += ch;
  }

  row.push(field);
  out.push(row);
  return out.filter((r) => r.some((col) => String(col || "").trim().length > 0));
}

function parseCSV(text){
  const table = parseCSVRows(String(text || ""));
  if (table.length < 2) return [];

  // Header-aware parsing (supports both legacy and id-based CSV)
  const header = table[0].map(s => String(s || "").trim().replace(/^\ufeff/, ""));
  const hasId = (header[0] || "").toLowerCase() === "id";

  const rows = [];
  for (let i=1;i<table.length;i++){
    const cols = table[i];

    let id = "";
    let word = "";
    let expectedPos = "";
    let answers = [];

    if (hasId){
      id = String((cols[0] || "")).trim().replace(/^\ufeff/, "");
      word = String((cols[1] || "")).trim();
      expectedPos = String((cols[2] || "")).trim();
      answers = cols.slice(3, 8).map(s => (s||"").trim()).filter(Boolean);
    } else {
      // Legacy: word,expectedPos,answer1..answer5
      word = String((cols[0] || "")).trim();
      expectedPos = String((cols[1] || "")).trim();
      answers = cols.slice(2, 7).map(s => (s||"").trim()).filter(Boolean);
      id = word.toLowerCase();
    }

    if (!id && word) id = word.toLowerCase();
    if (!word) continue;
    rows.push({ id, word, expectedPos, answers });
  }
  return rows;
}


async function loadExamplesCSV(examplesFile = "examples_A2.csv"){
  try{
    const res = await fetch("./" + CSV_BASE_PATH + examplesFile, { cache: "no-store" });
    const text = await res.text();
    const table = parseCSVRows(text);
    if (table.length < 2) return new Map();

    const header = table[0].map(s => String(s || "").trim().replace(/^\ufeff/, ""));
    const hasId = (header[0] || "").toLowerCase() === "id";

    const map = new Map();
    for (let i=1;i<table.length;i++){
      const cols = table[i];

      let id = "";
      let word = "";
      let en = "";
      let ja = "";

      if (hasId){
        id = String((cols[0]||"")).trim().replace(/^\ufeff/, "");
        word = String((cols[1]||"")).trim();
        en = String((cols[2]||"")).trim();
        ja = String((cols[3]||"")).trim();
      } else {
        // Legacy: word,en,ja
        word = String((cols[0]||"")).trim();
        en = String((cols[1]||"")).trim();
        ja = String((cols[2]||"")).trim();
        id = word.toLowerCase();
      }

      if (!id && word) id = word.toLowerCase();
      if (!id) continue;

      map.set(String(id), { en, ja, word });

      // Safety index by word as well
      if (word) map.set(word.toLowerCase(), { en, ja, word });
    }
    return map;
  }catch(e){
    return new Map();
  }
}


async function loadBuiltinCSV(wordsFile = "words_A2.csv"){
  const res = await fetch("./" + CSV_BASE_PATH + wordsFile, { cache: "no-store" });
  const text = await res.text();
  return parseCSV(text);
}

async function loadFromFile(file){
  const text = await file.text();
  return parseCSV(text);
}

function sampleItems(words, count){
  const shuffled = words.slice();
  for (let i=shuffled.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function sampleItemsWithReplacement(words, count){
  if (!words.length) return [];
  const out = [];
  for (let i=0;i<count;i++){
    out.push(words[Math.floor(Math.random()*words.length)]);
  }
  return out;
}

function buildSessionItems(words, count, mode){
  const weakSet = getWeakSet();
  const weakItemsAll = words.filter(w => weakSet.has(String(w.id)));

  if (mode === "weak"){
    if (!weakItemsAll.length) return [];
    if (weakItemsAll.length >= count){
      return sampleItems(weakItemsAll, count);
    }
    return sampleItemsWithReplacement(weakItemsAll, count);
  }

  // mode === "normal": 80% from all, 20% from weak DB (no duplicates)
  const weakQuota = Math.floor(count * 0.2);
  const pickedWeak = weakQuota > 0 ? sampleItems(weakItemsAll, weakQuota) : [];
  const pickedWeakIds = new Set(pickedWeak.map(x => String(x.id)));
  const poolAll = words.filter(w => !pickedWeakIds.has(String(w.id)));
  const remaining = Math.max(0, count - pickedWeak.length);
  const pickedAll = sampleItems(poolAll, remaining);

  const mixed = pickedWeak.concat(pickedAll);
  // Shuffle final list to mix weak/all
  for (let i=mixed.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
  }
  return mixed;
}

const POS_LABELS_JA = {
  adj: "形容詞",
  adv: "副詞",
  conj: "接続詞",
  det: "限定詞（冠詞、指示形容詞など）",
  interj: "間投詞、感嘆詞",
  modal: "法助動詞",
  auxiliary: "助動詞",
  n: "名詞",
  prep: "前置詞",
  pron: "代名詞",
  v: "動詞",
};

function buildPosHint(expectedPos){
  const p = String(expectedPos || "").trim();
  if (!p) return ""; // ブランクは何も表示しない

  if (p === "v") {
    return "（動詞：回答は「〜する／〜る」など動詞形で）";
  }

  const ja = POS_LABELS_JA[p];
  return ja ? `（${ja}）` : "";
}

function updateTestUI(){
  const s = state.session;
  $("progressText").textContent = `${s.index+1}/${s.items.length}`;
  $("scoreMini").textContent = `正解 ${s.correct} / 不正解 ${s.wrong}`;

  const cur = s.items[s.index];
  $("promptWord").textContent = cur.word;
  $("posHint").textContent = buildPosHint(cur.expectedPos);

  $("answerInput").value = "";
  $("feedback").classList.add("hidden");
  $("feedback").textContent = "";
  const exb = $("exampleBox");
  if (exb){ exb.classList.add("hidden"); exb.innerHTML = ""; }
  $("nextBtn").disabled = true;
  $("submitBtn").disabled = false;
  $("skipBtn").disabled = false;

  const supported = (("webkitSpeechRecognition" in window) || ("SpeechRecognition" in window));
  $("speechHint").textContent = supported ? "" : "（この環境では音声認識が利用できない可能性があります。iPadはSafari推奨）";
  $("micBtn").disabled = !supported;
  const done = $("speechDoneBtn");
  if (done) done.disabled = true;
}

function showExampleForItem(item){
  const box = $("exampleBox");
  if (!box) return;
  const id = item?.id != null ? String(item.id) : "";
  const word = String(item?.word || "");
  const ex = state.examplesMap?.get(id) || state.examplesMap?.get(word.toLowerCase());
  if (!ex || (!ex.en && !ex.ja)){
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `<div class="en">${escapeHTML(ex.en || "")}</div><div class="ja">${escapeHTML(ex.ja || "")}</div>`;
}

function showFeedback(kind, msg){
  const fb = $("feedback");
  fb.classList.remove("hidden","ok","ng");
  fb.classList.add(kind === "correct" ? "ok" : "ng");
  fb.textContent = msg;
}

function endSession(){
  const s = state.session;
  const totalAnswered = s.correct + s.wrong;
  const rate = totalAnswered ? Math.round((s.correct / totalAnswered) * 100) : 0;

  $("scoreRate").textContent = `${rate}%`;
  // 正解数の表示（指定ルール）
  if (rate === 100){
    $("correctCount").textContent = "全問正解";
  } else {
    const r = rate / 100;
    const denom = (1 - r);
    const val = (denom > 0) ? Math.round(s.wrong * r / denom) : 0;
    $("correctCount").textContent = String(val);
  }
  $("wrongCount").textContent = String(s.wrong);
  $("skipCount").textContent = String(s.skip);

  const list = $("wrongList");
  list.innerHTML = "";
  for (const it of (s.missItems || [])){
    const div = document.createElement("div");
    div.className = "item";

    const kind = (it.type === "skip") ? "⏭ スキップ" : "❌ 不正解";
    const userLine = (it.type === "skip")
      ? `<div class="a">あなたの回答：（スキップ）</div>`
      : `<div class="a">あなたの回答：${escapeHTML(it.userRaw || "")}</div>`;

    div.innerHTML = `
      <div class="w">${escapeHTML(it.word)}</div>
      <div class="a">${kind}</div>
      ${userLine}
      <div class="a">正解候補：${escapeHTML((it.suggestions||[]).slice(0,2).join(" / "))}</div>
    `;
    list.appendChild(div);
  }
  setScreen("Result");
  applyButtonAlign();
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function startTest(){
  state.settings.count = Number($("countSelect").value);
  state.settings.mode = $("modeSelect").value;
  state.settings.buttonAlign = $("buttonAlignSelect").value;
  applyButtonAlign();
  trackStart();

  let words = [];
  const fileEl = $("csvFileInput");
  const file = (fileEl && fileEl.files && fileEl.files[0]) ? fileEl.files[0] : null;
  const cfg = getBookConfig(getSelectedBook());
  words = file ? await loadFromFile(file) : await loadBuiltinCSV(cfg.wordsFile);

  if (!words.length){
    alert("辞書が空です。CSVを確認してください。");
    return;
  }

  state.examplesMap = await loadExamplesCSV(cfg.examplesFile);

  const items = buildSessionItems(words, state.settings.count, state.settings.mode);
  if (!items.length){
    alert("弱点DBが空です。先に通常モードで学習して弱点を作ってください。");
    return;
  }
  state.session = {
    items,
    index: 0,
    correct: 0,
    wrong: 0,
    skip: 0,
    missItems: [], // wrong + skip
  };

  setupSpeech();
  setScreen("Test");
  updateTestUI();
}

function onSubmit(){
  const s = state.session;
  const cur = s.items[s.index];
  const userRaw = $("answerInput").value || "";
  const judged = judge(cur, userRaw);

  if (judged.result === "correct"){
    s.correct += 1;

    // Weak DB handling
    try{
      const id = String(cur.id);

      // Count words answered correctly at least once (even if never entered weak DB)
      const correct = getCorrectSet();
      if (!correct.has(id)) {
        correct.add(id);
        setCorrectSet(correct);
        updateHomeStats(); // await を外す
      }

      const mode = state.settings.mode || "normal";
      if (mode === "normal"){
        const weak = getWeakSet();
        if (weak.has(id)){
          weak.delete(id);
          setWeakSet(weak);
          const mastered = getMasteredSet();
  const correct = getCorrectSet();
          mastered.add(id);
          setMasteredSet(mastered);
          updateHomeStats();
        }
      }
    }catch(e){}

    // Show meaning even when correct (same style as wrong)
    const meanings = (cur.answers || []).slice(0,2).join(" / ");
    const meaningText = meanings ? `（意味：${meanings}）` : "";
    showFeedback("correct", `✅ 正解 ${meaningText}`);

    showExampleForItem(cur);
  } else {
    s.wrong += 1;
    // Add to weak DB
    try{
      const id = String(cur.id);
      const weak = getWeakSet();
      weak.add(id);
      setWeakSet(weak);
      updateHomeStats();
    }catch(e){}
    const sug = (judged.suggestions && judged.suggestions.length)
      ? `（正解候補：${judged.suggestions.slice(0,2).join(" / ")}）`
      : "";
    showFeedback("wrong", `❌ 不正解 ${sug}`);
    showExampleForItem(cur);
    s.missItems.push({ type: "wrong", id: String(cur.id), word: cur.word, userRaw, suggestions: judged.suggestions });
  }

  $("nextBtn").disabled = false;
  $("submitBtn").disabled = true;
  $("skipBtn").disabled = true;
  $("scoreMini").textContent = `正解 ${s.correct} / 不正解 ${s.wrong}`;
}

function onNext(){
  const s = state.session;
  if (s.index >= s.items.length - 1){
    endSession();
    return;
  }
  s.index += 1;
  updateTestUI();
}

function onSkip(){
  const s = state.session;
  const cur = s.items[s.index];

  s.skip += 1;

  // Record skipped items for the summary list
  // Add to weak DB
  try{
    const id = String(cur.id);
    const weak = getWeakSet();
    weak.add(id);
    setWeakSet(weak);
    updateHomeStats();
  }catch(e){}

  s.missItems.push({
    type: "skip",
    id: String(cur.id),
    word: cur.word,
    userRaw: "",
    suggestions: (cur.answers || []).slice(0,2),
  });

  // Immediately go to next question (or end)
  if (s.index >= s.items.length - 1){
    endSession();
    return;
  }
  s.index += 1;
  updateTestUI();
}

function setupSpeech(){
  state.recognizer = null;
  state.speechActive = false;

  const SpeechRec = window.webkitSpeechRecognition || window.SpeechRecognition;
  if (!SpeechRec) return;

  const rec = new SpeechRec();
  rec.lang = "ja-JP";
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    // Take the most recent result (interim or final)
    const r = event.results?.[event.results.length - 1];
    const text = r?.[0]?.transcript || "";
    if (text) $("answerInput").value = text;
    $("speechHint").textContent = "";
    // Allow user to confirm immediately without waiting for auto-stop
    const btn = $("speechDoneBtn");
    if (btn) btn.disabled = !text;
    // If we got a final result, we can auto-enable the mic button again via onend.
  };
  rec.onerror = (event) => {
    const err = event.error || "unknown";
    let msg = `音声認識エラー: ${err}`;
    if (err === "not-allowed") msg += "（マイク許可/Siri・音声入力の設定を確認）";
    if (err === "aborted") msg += "（他の音声処理が割り込んだ可能性。再度「話す」を押してください）";
    $("speechHint").textContent = msg;
  };
  rec.onend = () => {
    state.speechActive = false;
    $("micBtn").disabled = false;
    const btn = $("speechDoneBtn");
    if (btn) btn.disabled = true;
  };

  state.recognizer = rec;
}

function onSpeechDone(){
  // Stop recognition early and keep the current transcript in the textarea.
  if (!state.recognizer) return;
  try{
    state.recognizer.stop();
  }catch(e){}
}

function onMic(){
  if (!state.recognizer){
    $("speechHint").textContent = "この環境では音声認識が利用できない可能性があります。iPadはSafari推奨です。";
    return;
  }
  if (state.speechActive) return;

  try{
    state.speechActive = true;
    $("micBtn").disabled = true;
    $("speechHint").textContent = "聞き取り中…（必要なら「確定」で早めに確定できます）";
    const btn = $("speechDoneBtn");
    if (btn) btn.disabled = true;
    state.recognizer.start();
  }catch(e){
    state.speechActive = false;
    $("micBtn").disabled = false;
    const btn = $("speechDoneBtn");
    if (btn) btn.disabled = true;
    $("speechHint").textContent = "音声認識を開始できませんでした。ブラウザのマイク許可を確認してください。";
  }
}

async function disableSW(){
  // Beta: disable service worker & clear caches so updates reflect immediately.
  if (!("serviceWorker" in navigator)) return;
  try{
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  }catch(e){}
  try{
    if ("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  }catch(e){}
}

function onEnd(){
  if (!state.session) return;
  const ok = confirm("いま終了して結果画面へ移動します。よろしいですか？");
  if (!ok) return;

  // If current question has not been answered yet, count as skip
  try{
    const submitDisabled = $("submitBtn")?.disabled;
    const nextDisabled = $("nextBtn")?.disabled;
    if (submitDisabled === false && nextDisabled === true){
      const cur = state.session.items[state.session.index];
      state.session.skip += 1;
      try{
        const id = String(cur.id);
        const weak = getWeakSet();
        weak.add(id);
        setWeakSet(weak);
        updateHomeStats();
      }catch(e){}
      state.session.missItems.push({
        type: "skip",
        id: String(cur.id),
        word: cur.word,
        userRaw: "",
        suggestions: (cur.answers || []).slice(0,2),
      });
    }
  }catch(e){}
  endSession();
}


async function ensureBookWords(bookKey){
  const cfg = getBookConfig(bookKey);

  // Cache by bookKey
  if (state.bookKey === cfg.key && Array.isArray(state.bookWords) && state.bookWords.length){
    return state.bookWords;
  }

  const words = await loadBuiltinCSV(cfg.wordsFile);

  state.bookKey = cfg.key;
  state.bookWords = words;
  state.bookWordIds = new Set(words.map(w => String(w.id)));
  state.bookWordsMap = new Map(words.map(w => [String(w.id), w]));

  return words;
}

function renderWordList(kind, words){
  const titleEl = $("wordListTitle");
  const infoEl  = $("wordListInfo");
  const listEl  = $("wordList");

  const title = (kind === "correct") ? "正解した単語"
    : (kind === "weak") ? "弱点の単語"
    : "克服した単語";

  if (titleEl) titleEl.textContent = title;
  if (infoEl) infoEl.textContent = `${words.length} 語`;

  if (!listEl) return;
  listEl.innerHTML = "";

  if (!words.length){
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "該当する単語がありません。";
    listEl.appendChild(div);
    return;
  }

  // Result画面の一覧と同じ「.item / .w / .a」構造で表示
  for (const w of words){
    const div = document.createElement("div");
    div.className = "item";
    const ans = Array.isArray(w.answers) ? w.answers.filter(Boolean) : [];
    const a1 = ans[0] || "";
    const a2 = ans[1] || "";
    div.innerHTML = `
      <div class="w">${escapeHTML(w.word)}</div>
      <div class="a">${escapeHTML(a1)}</div>
      ${a2 ? `<div class="a">${escapeHTML(a2)}</div>` : ``}
    `;
    listEl.appendChild(div);
  }
}

async function openWordList(kind){
  const all = await ensureBookWords(getSelectedBook());
  const set = (kind === "correct") ? getCorrectSet()
    : (kind === "weak") ? getWeakSet()
    : getMasteredSet();

  const filtered = all.filter(w => set.has(String(w.id)));
  filtered.sort((a,b) => String(a.word).localeCompare(String(b.word), "en", { sensitivity: "base" }));
  renderWordList(kind, filtered);
  setScreen("WordList");
  applyButtonAlign();
}

function routeFromHash(){
  const h = (location.hash || "").replace(/^#/, "");
  if (!h) return false;

  const m = h.match(/^list=(correct|weak|mastered)$/);
  if (m){
    openWordList(m[1]);
    return true;
  }
  if (h === "home"){
    setScreen("Home");
    return true;
  }
  return false;
}

function wireUI(){
  $("startBtn").addEventListener("click", startTest);

  const bookSel = $("bookSelect");
  if (bookSel){
    renderBookSelectOptions();
    // Initialize select from DB (no DB write if missing)
    bookSel.value = getSelectedBook();
    setSelectedBook(bookSel.value);
    bookSel.addEventListener("change", async () => {
      const key = bookSel.value;
      setSelectedBook(key);
      // Clear cached words so stats/word list reflect the new book
      state.bookKey = null;
      state.bookWords = null;
      state.bookWordIds = null;
      state.bookWordsMap = null;
      try{ await updateHomeStats(); }catch(e){}
    });
  }

  const exportBtn = $("exportDbBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportDB());

  const importBtn = $("importDbBtn");
  const importInput = $("importDbFile");
  if (importBtn && importInput){
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const f = importInput.files?.[0];
      if (!f) return;
      try{
        await importDBFromFile(f);
        alert("DBを読み込みました。");
        updateHomeStats();
      }catch(e){
        alert("DBの読み込みに失敗しました。JSON形式を確認してください。");
      }finally{
        importInput.value = "";
      }
    });
  }

  const clearBtn = $("clearDbBtn");
  if (clearBtn){
    clearBtn.addEventListener("click", () => {
      const ok = confirm("学習DB（弱点・正解済み）を削除します。よろしいですか？");
      if (!ok) return;
      clearDB();
      alert("DBをクリアしました。");
      updateHomeStats();
    });
  }

  const printBtn = $("printQuizBtn");
  if (printBtn){
    printBtn.addEventListener("click", () => {
      // 念のため選択状態をDBへ反映（bookSelectはHomeでのみ操作可能） :contentReference[oaicite:3]{index=3}
      const bookSel = $("bookSelect");
      if (bookSel) setSelectedBook(bookSel.value);

      // 別HTMLへ遷移
      location.href = "./print.html";
    });
  }

  $("submitBtn").addEventListener("click", onSubmit);
  $("nextBtn").addEventListener("click", onNext);
  $("skipBtn").addEventListener("click", onSkip);
  $("backHomeBtn").addEventListener("click", () => { setScreen("Home"); updateHomeStats(); });
  $("micBtn").addEventListener("click", onMic);
  const done = $("speechDoneBtn");
  if (done) done.addEventListener("click", onSpeechDone);
  const endBtn = $("endBtn");
  if (endBtn) endBtn.addEventListener("click", onEnd);

  $("answerInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      if (!$("submitBtn").disabled) onSubmit();
    }
  });
}

(async function init(){
  window.addEventListener("hashchange", () => { routeFromHash(); });
  ensureClientId();
  updateNetStatus();
  updateHomeStats();
  setScreen("Home");
  applyButtonAlign();
  wireUI();
  await disableSW();
})();
