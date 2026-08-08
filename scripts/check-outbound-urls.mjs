#!/usr/bin/env node
// 部署 gate：掃**腳本裡會被主動送出去的站內網址**，確認一律帶尾斜線。
//
// 為什麼要有這支（2026-07-28 建，尾斜線問題第三次復發後）：
//   `check-canonical-links.mjs` 已經在守「dist 產物裡的內部網址」，做得很好——所以站台輸出
//   （nav/canonical/og:url/JSON-LD/sitemap）長期是乾淨的。但它有一塊盲區：
//   **腳本主動送給搜尋引擎的網址不經過 dist**，於是完全沒人守。
//   結果 `pnpm notify` 的高槓桿集 `CORE` 九個裡有八個不帶尾斜線（`/almanac`、`/poems`…），
//   每次部署後都在對 Google Indexing API 與 IndexNow 送 301 網址——GSC 因此累積出
//   「頁面會重新導向 2,304」且來源標成**網站**（＝我們自己提交的）。
//
//   同一個根因（尾斜線）修了三次：2026-07-08 修站內內鏈、2026-07-28 修 notify 的 CORE，
//   中間還漏了幾支退役腳本。每次都是「人眼抓到一處、修一處」。這支就是把它變成不可能再犯。
//
// 兩條規則（皆掃原始碼，不需 build，故排在 build 之前）：
//   R1 完整網址字面值 `https://folk.tw/<path>` → 必須以 `/` 結尾（有副檔名者除外）。
//   R2 站內路徑清單：同一個陣列字面值裡有 ≥2 個以 `/` 開頭的字串 → 每個元素都必須以 `/` 結尾。
//      （`CORE = ['/', '/almanac', …]` 就是這個形態；用「≥2 個」當啟發式，避免誤抓一般字串。）
//
// 還有一層 runtime 保底：index-ping.mjs／indexnow-ping.mjs 送出前會 normalizeUrl()，
// 把任何來源（命令列參數、sitemap）漏掉的尾斜線補上並印警告。gate 擋靜態、normalize 擋動態。
//
// 用法：`pnpm check:outbound-urls`（CI 已串進 deploy.yml）。發現即 exit 1 → 不部署。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'https://folk.tw';
const ROOTS = ['scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** 有副檔名的視為檔案（/robots.txt、/sitemap-0.xml、/key.txt），本就不該有尾斜線。 */
const isFile = (p) => /\.[a-z0-9]{2,5}$/i.test(p);
/** 帶 query／fragment 的不是可收錄網址（如 /search/?q={…}）。 */
const hasQuery = (p) => p.includes('?') || p.includes('#');

const needsSlash = (path) => path !== '/' && !path.endsWith('/') && !isFile(path) && !hasQuery(path);

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* jsFiles(p);
    else if (/\.(mjs|js|ts)$/.test(name)) yield p;
  }
}

const problems = [];
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// 掃自己會被檔頭註解裡的示例網址誤觸（那些是說明用的反例，不是真的會送出去）。
const SELF = 'check-outbound-urls.mjs';

for (const file of ROOTS.flatMap((r) => [...jsFiles(r)])) {
  if (file.endsWith(SELF)) continue;
  const src = readFileSync(file, 'utf8');

  // ── R1：完整網址字面值 ────────────────────────────────────────────────
  for (const m of src.matchAll(new RegExp(`['"\`]${ORIGIN}(/[^'"\`\\s]*)['"\`]`, 'g'))) {
    if (needsSlash(m[1])) {
      problems.push({ file, line: lineOf(src, m.index), rule: 'R1', found: ORIGIN + m[1], want: ORIGIN + m[1] + '/' });
    }
  }

  // ── R2：站內路徑清單（陣列字面值裡 ≥2 個以 / 開頭的字串）────────────────
  for (const arr of src.matchAll(/\[([^[\]]*)\]/g)) {
    const items = [...arr[1].matchAll(/['"](\/[^'"]*)['"]/g)].map((x) => x[1]);
    if (items.length < 2) continue;                       // 單一字串不當成路徑清單，避免誤抓
    if (items.some((p) => /[\\^$*+?()|]/.test(p))) continue; // 看起來是正則片段，跳過
    // 🔴 檔案系統路徑不是站台網址（2026-08-08 加）：`JSON_DIRS = ['/root/.config/…', '/root/.config/…']`
    //    這種陣列剛好符合「≥2 個 / 開頭的字串」的啟發式，被誤報成「該補尾斜線的站內網址」。
    //    誤判比漏判更糟：它會逼人為了讓 gate 閉嘴而去改一段本來正確的程式碼。
    //    這幾個前綴在 folk.tw 的網址空間裡不存在，出現就必然是磁碟路徑。
    if (items.some((p) => /^\/(root|etc|opt|var|tmp|home|usr|proc|sys|dev)\//.test(p))) continue;
    for (const p of items) {
      if (needsSlash(p)) {
        problems.push({ file, line: lineOf(src, arr.index), rule: 'R2', found: p, want: p + '/' });
      }
    }
  }
}

if (problems.length) {
  console.error(`✗ 發現 ${problems.length} 個「會被送出去卻不帶尾斜線」的站內網址：\n`);
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  [${p.rule}]  ${p.found}`);
    console.error(`     → 應為 ${p.want}`);
  }
  console.error('\n本站是 GitHub Pages，不帶尾斜線的網址一律 301。把它送給 Google／IndexNow');
  console.error('等於主動請搜尋引擎收錄一個會重新導向的網址，浪費爬取預算也髒了索引報告。');
  console.error('（頁面內鏈由 check-canonical-links.mjs 守；這支守的是腳本送出去的網址。）');
  process.exit(1);
}

const scanned = ROOTS.flatMap((r) => [...jsFiles(r)]).length;
console.log(`✓ 送出網址檢查通過（掃 ${scanned} 個腳本，站內網址全部帶尾斜線）`);
