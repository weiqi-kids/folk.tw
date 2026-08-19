// 匯入器寫入資料集的**唯一入口**。六支 `scripts/import-*.mjs` 一律走這裡，別再各寫一份。
//
// 為什麼要這支（2026-08-19 抽出。與 lib/temple-owner.mjs 同一個理由：
// 「多一份就多一個會漂的真實來源」，那條規矩對檔案成立，對程式碼一樣成立）：
// 抽出前六支匯入器各自重新實作了同一件事，且已經漂開了——
//   ・`--write` 判定：4 支讀 `args`、2 支讀 `process.argv`（同一支檔案裡兩種混用的也有）
//   ・JSON 序列化：三種寫法（模板字串／字串相加／不同縮排），沒有一支是原子寫入
//   ・`&nbsp;` 這段 entity 解碼：同一段複製四次，其中三份**沒有**數值型 entity 的解碼，
//     而數值型正是 2026-08-07 讓 308 間廟中招、最後被 check:rendered 擋下的那個 bug
//   ・合併鍵正規化 `norm`：四份，方向與空白處理三種
//   ・輸出路徑寫死在模組層 → 無法指向 fixture，六支都沒有辦法寫測試
// 漂開的成本不是「不好看」，是**下一次修 bug 只會修到六分之一**。
//
// ── 決策與理由（改這些之前先讀完） ──────────────────────────────────────────
//
// ① **輸出路徑一律由參數傳入**（`commitDataset({ path })`），匯入器把字面值留成自己的
//    模組常數當預設。這是本次抽出的**主要目的**：路徑不再寫死在寫檔那一行，
//    才有可能把它指到 fixture 目錄跑測試。加新匯入器時不要走回頭路。
//
// ② **原子寫入（tmp + rename）**，作法照 `scripts/intake-ingest.mjs` 的上位段
//    （同目錄暫存檔 → `renameSync`，同檔案系統的 rename 是原子操作）。
//    理由同那裡：`src/data/temples.json` 有 6 MB、被 astro build 與多支 cron 讀，
//    寫到一半被讀到就是半個 JSON。抽出前六支**沒有一支**做這件事。
//
// ③ **內容相同就不重寫**（同 intake-ingest 的 `unchanged` 分支）。
//    匯入器是 idempotent、設計上就會被重複執行，每次重寫只會製造無意義的 mtime 變動。
//
// ④ **縮排沿用各檔現況：資料集 2、sidecar（照片候選清單）1。**
//    ⚠️ 這裡刻意**不統一**：`src/data/*.json` 與 `docs/*-photo-candidates.json` 已經在 repo 裡，
//    改縮排會讓下一次 `--write` 產生一份「整檔重排」的假 diff，把真正的資料變動埋掉。
//    要統一得另開一次「只改格式、不改內容」的 commit，不能夾帶在資料更新裡。
//
// ⑤ **來源標註**：形狀固定為 `{ type: 'gov', ref, note }`，推進節點的 `sources[]`。
//    去重判準有兩種，因為 `ref` 的穩定度本來就不同：
//      ・`ref` 是**固定字串**（慶典、觀光署）→ 預設的 ref 完全相同即視為已存在
//      ・`ref` **內含每筆各異的識別碼**（`cid=N`、`UploadFileID=N&IndexID=k`、照片頁網址）
//        → 傳 `dedupeBy` 給那段穩定片段，只比片段
//    抽出前是 1 支用完全比對、4 支用子字串比對，差異沒人審過；這裡把「什麼時候該用哪種」
//    變成呼叫端必須明講的一件事，而不是各自默默選一種。
//
// ⑥ 🔴 **`local-celebrations.json` 的單數 `source` 不是要修的分歧，別「順手統一」成 `sources[]`。**
//    那是**資料集層級**的來源信封（整份檔案同一個來源），與其他五支寫的**節點層級**
//    `sources[]`（一間廟／一尊神各自掛各自的源）是兩種不同的東西。
//    它有兩個現役消費端：`src/pages/festivals/local/index.astro`（`lc.source`）與
//    `scripts/check-integrity.ts`（`localCelebrations.source?.ref`）。改形狀會同時弄壞頁面與 gate。
//
// ⑦ **寫入差異量**（新增／更新／未變／移除）由本模組算並印出，匯入器不必自己數。
//    乾跑時它回答的正是「這次跑下去會動到幾筆」——那是決定要不要加 `--write` 的依據。
//    比對以 `idKey`（預設 `id`）配對、逐筆 `JSON.stringify` 比值。
//
// ⑧ 匯入器只負責「解析來源、提出候選紀錄」，**寫不寫由本模組依 `write` 決定**。
//    ⚠️ 所以匯入器內部不要再出現 `if (WRITE) t.foo = ...`——那會讓乾跑看到的物件與
//    實際寫入的物件不是同一個，差異量就永遠是 0。`import-tourism.mjs` 原本正是這樣。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

// ── 合併鍵正規化 ────────────────────────────────────────────────────────────
/**
 * 廟名／神名／行政區在拿去比對之前的正規化。**這是唯一的一份**（抽出前有四份）。
 *
 * 🔴 這次統一**沒有改變任何一支的配對結果**——2026-08-19 對 `src/data/temples.json` 全量實跑，
 *    把四支各自的 `norm` 逐一換成本函式後重跑乾跑，四支輸出與換之前**逐字元相同**：
 *      ・import-festivals（臺→台、只 trim）      → 無差異
 *      ・import-local-celebrations（台→臺、不 trim）→ 無差異
 *      ・import-knowledge-deities（台→臺、刪全空白）→ 無差異
 *      ・import-temple-history（經 lib/temple-owner）→ 無差異
 *    這是**收斂沒人審過的寫法**，不是在修一個現行 bug（原本每支都是自己建索引自己查，
 *    同一份 norm 用在兩端，所以跨腳本對不上的情況本來就不會發生）。
 *
 * 兩個選擇各自的理由：
 *   ・**方向取「臺→台」**：兩個方向對比對而言是**可證明等價**的——它們是同一個字元等價類的
 *     兩種代表元，而逐字元代換保長度，所以「相等」與「子字串」兩種關係都不受方向影響
 *     （local-celebrations 用的正是子字串比對，已實測確認）。既然等價，就跟渲染層對齊：
 *     `src/lib/temple-region.ts` 推導縣市時做的是 `.replace(/臺/g, '台')`。
 *   ・**空白全刪（不是 trim）**：來源的廟名與地址欄夾雜全形／半形空白與 tab，
 *     只 trim 擋不掉字中間的。全刪是四份裡最嚴格的一份，且實測不會多配到任何一筆。
 *
 * ⚠️ 本函式的輸出**只當比對鍵，永遠不落地**。要寫進 JSON 的字串請用原文
 *    （或 `decodeEntities` 的結果），不要寫 norm 過的版本。
 */
export const norm = (s) => String(s ?? '').replace(/臺/g, '台').replace(/\s+/g, '');

// ── HTML entity 還原 ────────────────────────────────────────────────────────
/**
 * HTML entity 解碼（數值型 + 具名）。**這是唯一的一份**（抽出前有四份具名版 + 一份完整版）。
 *
 * 🔴 數值型那兩條不可拿掉（2026-08-07 實測）：內政部的 `Comment` 直接帶 `&#63886;`
 *    這類 CJK 相容字，不解就整串存進 `history`，**308 間廟中招**；而 entity 結尾的分號
 *    會與後面的標點連成「;、」，最後被 check:rendered 的連續標點不變量擋下（CI 紅燈）。
 *    解碼是**還原來源本字，不是改寫**——「逐字引用」的前提就是先正確解碼。
 * ⚠️ `&amp;` 必須放最後，否則 `&amp;#39;` 會被兩段式誤解成 `'`。
 *
 * 2026-08-19 把另外四支的具名版換成本函式（等於替它們補上數值型解碼），
 * 四支乾跑輸出**逐字元相同**——那些來源的名稱欄本來就沒有數值型 entity，
 * 補上是把同一個 bug 的其餘四個入口一起堵掉，不是改語意。
 */
export const decodeEntities = (s) => String(s ?? '')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

// ── CLI 旗標 ────────────────────────────────────────────────────────────────
/**
 * 匯入器的旗標解析。**一律從 `process.argv.slice(2)` 讀**——抽出前有 4 支讀切好的 `args`、
 * 2 支直接讀 `process.argv`，而且同一支檔案裡兩種混用（`--write` 讀 args、`--json` 讀 argv），
 * 於是「這支到底吃不吃某個旗標」要逐行看才知道。
 *
 * @param {string[]} [argv] 覆寫用（測試時可直接餵陣列）
 * @returns {{ has(name: string): boolean, value(name: string): string|null,
 *             write: boolean, verbose: boolean, json: boolean, photos: boolean }}
 */
export function cliFlags(argv = process.argv.slice(2)) {
  const has = (name) => argv.includes(name);
  const value = (name) => {
    const i = argv.indexOf(name);
    return i > -1 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  return {
    has,
    value,
    write: has('--write'),
    verbose: has('--verbose'),
    json: has('--json'),
    photos: has('--photos'),
  };
}

// ── 來源標註 ────────────────────────────────────────────────────────────────
/**
 * 把一筆來源掛到節點的 `sources[]`（不存在就建）。重複執行不會重複加。
 *
 * @param {object} node 廟／神明節點
 * @param {{ type?: string, ref: string, note?: string }} source
 * @param {{ dedupeBy?: string }} [opts] `dedupeBy` 給定時只比對 `ref` 是否含這段片段；
 *        省略時比對 `ref` 完全相同。判準怎麼選見本檔頭 ⑤。
 * @returns {boolean} 這次是否真的新增了一筆
 */
export function attachSource(node, { type = 'gov', ref, note }, { dedupeBy } = {}) {
  node.sources = node.sources ?? [];
  const hit = dedupeBy
    ? node.sources.some((s) => String(s?.ref ?? '').includes(dedupeBy))
    : node.sources.some((s) => s?.ref === ref);
  if (hit) return false;
  node.sources.push({ type, ref, ...(note === undefined ? {} : { note }) });
  return true;
}

// ── 寫入差異 ────────────────────────────────────────────────────────────────
const pickItems = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return null;
};

/**
 * 舊資料 vs 新資料的逐筆差異。配對不到 `idKey` 就退回「整檔比對」。
 * @returns {{ added: number, updated: number, unchanged: number, removed: number,
 *             total: number, byId: boolean }}
 */
export function diffRecords(prev, next, idKey = 'id') {
  const a = pickItems(prev);
  const b = pickItems(next);
  const out = { added: 0, updated: 0, unchanged: 0, removed: 0, total: 0, byId: false };
  if (!b) return out;
  out.total = b.length;
  if (!a) {
    out.added = b.length;
    out.byId = true;
    return out;
  }
  const prevById = new Map();
  for (const r of a) if (r && r[idKey] != null) prevById.set(r[idKey], r);
  // 任何一邊缺 id 就沒得逐筆配對，退回整檔比對（不硬猜對應關係）。
  if (prevById.size !== a.length || b.some((r) => !r || r[idKey] == null)) return out;
  out.byId = true;
  const seen = new Set();
  for (const r of b) {
    seen.add(r[idKey]);
    const before = prevById.get(r[idKey]);
    if (before === undefined) out.added++;
    else if (JSON.stringify(before) === JSON.stringify(r)) out.unchanged++;
    else out.updated++;
  }
  for (const k of prevById.keys()) if (!seen.has(k)) out.removed++;
  return out;
}

// ── 提交 ────────────────────────────────────────────────────────────────────
const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};

/**
 * 把一份資料集提交到 `path`：算差異 → 印報告 → （`write` 為真時）原子寫入。
 * **六支匯入器寫檔一律走這裡**，不要自己 `writeFileSync` 資料集。
 *
 * @param {object} o
 * @param {string} o.path      輸出路徑（必填，見本檔頭 ①：不可寫死在本模組裡）
 * @param {*}      o.data      要寫的資料（陣列，或帶 `items` 陣列的信封物件）
 * @param {boolean} o.write    false ＝ 乾跑，只算差異與印報告，不碰硬碟
 * @param {number} [o.indent]  縮排，預設 2；照片候選這類 sidecar 傳 1（見本檔頭 ④）
 * @param {string} [o.idKey]   逐筆比對用的鍵，預設 `id`
 * @param {boolean} [o.reportDiff] 是否印差異行，預設 true
 * @param {string|null} [o.dryNote]  乾跑時印的整句（含括號）。null ＝ 不印
 * @param {string|null} [o.doneNote] 寫入後印的整句。null ＝ 不印（呼叫端自己印）
 * @param {(msg: string) => void} [o.log]
 * @returns {{ path: string, wrote: boolean, identical: boolean, bytes: number,
 *             added: number, updated: number, unchanged: number, removed: number, total: number }}
 */
export function commitDataset({
  path,
  data,
  write,
  indent = 2,
  idKey = 'id',
  reportDiff = true,
  dryNote = '（乾跑，未寫檔。加 --write 才實際寫入）',
  doneNote,
  log = console.log,
}) {
  if (!path) throw new Error('commitDataset：缺 path（輸出路徑必須由呼叫端傳入，見 lib/dataset-commit.mjs 檔頭 ①）');

  const serialized = `${JSON.stringify(data, null, indent)}\n`;
  const existed = existsSync(path);
  const prevRaw = existed ? readFileSync(path, 'utf8') : null;
  const identical = prevRaw === serialized;
  const d = diffRecords(existed ? readJson(path) : null, data, idKey);

  if (reportDiff) {
    // 標上檔名：import-photos.mjs 一次提交兩個資料集，不標就分不出哪行是哪個。
    const who = basename(path);
    log(
      d.byId
        ? `  寫入差異 ${who}：新增 ${d.added}｜更新 ${d.updated}｜未變 ${d.unchanged}｜移除 ${d.removed}（共 ${d.total} 筆）`
        : `  寫入差異 ${who}：${identical ? '與現有檔完全相同' : '內容有變動'}（無法逐筆配對，改以整檔比對）`,
    );
  }

  if (!write) {
    if (dryNote) log(dryNote);
    return { path, wrote: false, identical, bytes: 0, ...d };
  }

  if (identical) {
    // 匯入器是 idempotent、天天重跑，內容沒變就不要製造 mtime 變動（見本檔頭 ③）。
    if (doneNote) log(doneNote);
    return { path, wrote: false, identical: true, bytes: prevRaw.length, ...d };
  }

  mkdirSync(dirname(path), { recursive: true });
  // 原子寫入：同目錄暫存檔 → rename（見本檔頭 ②）。
  const tmp = `${path}.commit-tmp`;
  writeFileSync(tmp, serialized);
  renameSync(tmp, path);
  if (doneNote) log(doneNote);
  return { path, wrote: true, identical: false, bytes: serialized.length, ...d };
}
