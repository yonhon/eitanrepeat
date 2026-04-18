// print.js: 印刷専用（app.js は読み込まない）

const APP_VERSION = "print-1.0";

const DB_KEY = "vocab_app_db_v1";
const DB_SCHEMA_VERSION = 1;
const CSV_BASE_PATH = "csv/";
const PUBLIC_MODE = true;

// app.js と同じ単語集定義（ここは app.js の BOOKS と同期が必要） :contentReference[oaicite:5]{index=5}
const BOOKS = [
  { key: "A1",  label: "中学2年生レベル", wordsFile: "words_A1.csv", isPublic: true },
  { key: "A2",  label: "高校1年生レベル", wordsFile: "words_A2.csv", isPublic: true },
  { key: "B1",  label: "高校3年生レベル", wordsFile: "words_B1.csv", isPublic: true },
  { key: "B2",  label: "大学中上級レベル", wordsFile: "words_B2.csv", isPublic: true },
];

const DEFAULT_BOOK_KEY = "A2";

const $ = (id) => document.getElementById(id);

function getAvailableBooks(){
  return PUBLIC_MODE ? BOOKS.filter((b) => b.isPublic !== false) : BOOKS.slice();
}

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [], selectedBook: DEFAULT_BOOK_KEY };
    const obj = JSON.parse(raw);
    if (!obj || obj.schemaVersion !== DB_SCHEMA_VERSION) {
      return { schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [], selectedBook: DEFAULT_BOOK_KEY };
    }
    return obj;
  }catch(e){
    return { schemaVersion: DB_SCHEMA_VERSION, weakIds: [], masteredIds: [], correctIds: [], selectedBook: DEFAULT_BOOK_KEY };
  }
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

async function loadBuiltinCSV(wordsFile){
  const res = await fetch("./" + CSV_BASE_PATH + wordsFile, { cache: "no-store" });
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(s => s.trim().replace(/^\ufeff/, ""));
  const hasId = (header[0] || "").toLowerCase() === "id";

  const rows = [];
  for (let i=1;i<lines.length;i++){
    const line = lines[i];
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let c=0;c<line.length;c++){
      const ch = line[c];
      if (ch === '"'){ inQ = !inQ; continue; }
      if (ch === "," && !inQ){ cols.push(cur); cur=""; continue; }
      cur += ch;
    }
    cols.push(cur);

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
      word = String((cols[0] || "")).trim();
      expectedPos = String((cols[1] || "")).trim();
      answers = cols.slice(2, 7).map(s => (s||"").trim()).filter(Boolean);
      id = word.toLowerCase();
    }

    if (!word) continue;
    rows.push({ id, word, expectedPos, answers });
  }
  return rows;
}

function sampleItems(words, count){
  const shuffled = words.slice();
  for (let i=shuffled.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function formatDateTime(d){
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildRowHTML(no, word, answerTextOrEmpty){
  const ans = answerTextOrEmpty ? `<span class="ansText">${escapeHTML(answerTextOrEmpty)}</span>` : "";
  return `
    <div class="qrow">
      <div class="idBox">${no}</div>
      <div class="mainBox">
        <div class="word">${escapeHTML(word)}</div>
        <div class="blank"></div>
        ${ans}
      </div>
    </div>
  `;
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function renderTwoCols(targetLeftId, targetRightId, items, withAnswers){
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);

  const leftHTML = left.map((it, idx) => {
    const no = idx + 1;
    const ans = withAnswers ? (it.answers || []).slice(0,2).join(" / ") : "";
    return buildRowHTML(no, it.word, ans);
  }).join("");

  const rightHTML = right.map((it, idx) => {
    const no = half + idx + 1;
    const ans = withAnswers ? (it.answers || []).slice(0,2).join(" / ") : "";
    return buildRowHTML(no, it.word, ans);
  }).join("");

  $(targetLeftId).innerHTML = leftHTML;
  $(targetRightId).innerHTML = rightHTML;
}

let currentItems = [];
let currentCfg = null;

async function generate(){
  const bookKey = getSelectedBook();
  currentCfg = getBookConfig(bookKey);

  const all = await loadBuiltinCSV(currentCfg.wordsFile);
  currentItems = sampleItems(all, 50); // 「単語集全体からランダムで50問」：重複なし、上限50

  const dt = formatDateTime(new Date());

  // ヘッダ
  $("metaQ").textContent  = `小テスト（問題）：${dt}`;
  $("metaQA").textContent = `小テスト（問題＋回答）：${dt}`;

  $("titleQ").textContent = currentCfg.label || currentCfg.key;
  $("titleQA").textContent = currentCfg.label || currentCfg.key;

  // 2面レイアウト（左列→右列に分割して流し込み）
  renderTwoCols("qLeft","qRight", currentItems, false);
  renderTwoCols("qaLeft","qaRight", currentItems, true);
}

function wire(){
  $("printBtn").addEventListener("click", () => window.print());
  $("regenBtn").addEventListener("click", () => generate());
  $("backBtn").addEventListener("click", () => { location.href = "./index.html#home"; });
}

(async function init(){
  wire();
  try{
    await generate();
  }catch(e){
    alert("印刷ページの生成に失敗しました。単語CSVの取得に失敗した可能性があります。");
  }
})();
