#!/usr/bin/env node
// 部署 gate：掃 build 產物 dist/**/*.html，確認「所有內部網址皆為帶斜線 canonical」。
// 背景：本站 build format 為 directory、canonical/sitemap 皆帶尾斜線；不帶斜線的內部網址
//       會被 GitHub Pages 301 轉向帶斜線版 → 內鏈權重卡在 301 來源、爬蟲多繞一跳。
//       此檢查阻擋任何非斜線內部網址（導航 href/src、JSON-LD url/@id/item/target/urlTemplate、
//       canonical、og:url）再度上線。發現即 exit 1 → deploy.yml 的 build job 失敗 → 不部署。
// 用法：pnpm build 後 `node scripts/check-canonical-links.mjs`（CI 已串在 build 之後）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ORIGIN = 'https://folk.tw';

// 逐檔掃 dist 下所有 .html
function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

// 擷取三類內部網址：導航屬性、JSON-LD 欄位、canonical/og。
// 只掃屬性/JSON-LD 內容，不掃自由文字，避免內文出現的示例網址造成誤報。
const PATTERNS = [
  { kind: 'link', re: /(?:href|src)=(["'])(\/[^"'#?]*?)\1/g, group: 2 }, // 站內相對
  { kind: 'link', re: /(?:href|content)=(["'])(https:\/\/folk\.tw\/[^"'#?]*?)\1/g, group: 2 }, // canonical/og 絕對
  { kind: 'jsonld', re: /"(?:url|@id|item|target|urlTemplate)"\s*:\s*"(https:\/\/folk\.tw\/[^"]*?)"/g, group: 1 },
];

// 判定某網址是否「內部頁面卻缺斜線」＝違規。資產檔（末段含 . 如 .png/.css/.js）與根路徑 / 放行。
function isViolation(raw) {
  let path = raw.startsWith(ORIGIN) ? raw.slice(ORIGIN.length) : raw;
  path = path.replace(/[?#].*$/, ''); // 去查詢字串/錨點後再判斜線
  if (path === '' || path === '/') return false;
  if (path.startsWith('//')) return false; // 協定相對外部連結
  if (path.endsWith('/')) return false; // 已帶斜線
  const last = path.split('/').pop();
  if (last.includes('.')) return false; // 資產檔
  return true;
}

const violations = new Map(); // url → Set(檔案)
let scanned = 0;

try {
  statSync(DIST);
} catch {
  console.error(`[check-canonical-links] 找不到 ${DIST}/，請先 pnpm build。`);
  process.exit(2);
}

for (const file of htmlFiles(DIST)) {
  scanned++;
  const html = readFileSync(file, 'utf8');
  for (const { re, group } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[group];
      if (isViolation(url)) {
        const norm = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url;
        if (!violations.has(norm)) violations.set(norm, new Set());
        if (violations.get(norm).size < 3) violations.get(norm).add(file.replace(`${DIST}/`, ''));
      }
    }
  }
}

if (violations.size === 0) {
  console.log(`✓ canonical 連結檢查通過：掃 ${scanned} 頁，所有內部網址皆帶尾斜線（無 301 內鏈）。`);
  process.exit(0);
}

console.error(`✗ canonical 連結檢查失敗：發現 ${violations.size} 個不帶斜線的內部網址（會被 301、內鏈權重外洩）。`);
console.error('  修法：內鏈/schema 的內部網址一律補尾斜線（詳情頁 /x/${id}/、樞紐 /x/）。');
for (const [url, files] of [...violations].sort()) {
  console.error(`  ✗ ${url}   ← 例：${[...files].join(', ')}`);
}
process.exit(1);
