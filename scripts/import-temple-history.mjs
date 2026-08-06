#!/usr/bin/env node
// 內政部 `GetUploadFile` → `temples.json` 的沿革／建築特色／參拜流程（＋照片候選）。
//
// 授權（2026-08-06 用戶取得內政部同意）：範圍全開、**含照片**，唯一條件＝**標示資料來源連結**。
// 落實方式＝每一筆掛回自己的 `GetUploadFile?UploadFileID=<N>&IndexID=<2|3|4>`。
// 🔴 別再去要公文文號（見 docs/taiwan-intake-status.md §2026-08-06）。
//
// 🔴 **ReligionID 對不到我們的廟**。GetUploadFile 的回應帶 `ReligionID`（如 513652），
//    但 `temples.json` 的 id 是 `moi_<陣列索引>_<名稱>`，兩者沒有任何關係，
//    `temple.xml` 也沒有 ReligionID 欄。所以對映**只能靠廟名＋地址**，而那兩樣
//    在查詢結果頁（`recon-service/foundation-list/page-*.html`）的同一列裡——
//    本檔因此同時讀兩個來源：結果頁建 `UploadFileID → 廟名/地址`，JSON 給內容。
//    ⚠️ 這也是為什麼**不另外產一個對映檔進 repo**：多一份就多一個會漂的真實來源。
//
// 🔴 個資：結果頁每一列都有電話與負責人。本檔**只讀廟名與地址兩欄**，
//    其餘欄位連解析都不解析，絕不寫進 repo（本 repo 為 public）。
//
// 對映策略（三段，零猜測；對不上就不寫，寧缺勿假。同 import-festivals 的精神）：
//   1. 廟名在 temples.json 唯一 → 命中
//   2. 同名 → 用「縣市＋鄉鎮」消歧，唯一才採用
//   3. 仍同名 → **完整地址完全相符**（結果頁有地址，比慶典那批的電話橋更直接）
//
// 三種內容各自的坑：
//   · idx=2 歷史沿革 → `history`。**不覆寫既有**（那 22 間是逐間查證的敘述句）。
//   · idx=3 建築特色 → `architecture`。⚠️ **佔位值很多**：2026-08-05 取樣那筆的 `Comment`
//     就是廟名本身（「紫雲觀」）。故擋掉「Comment 等於 FileTitle／等於廟名／過短」者。
//   · idx=4 參拜流程 → `worship_flow`。
//   · `AttachType === 'pic'` → 照片候選，另存清單給 gen-intake-urls-photos.mjs。
//
// ⚠️ `intro`（觀光署）與 `history` **不得並存**（check:integrity 硬擋）。
//    預設**跳過已有 intro 的廟**，不動它們；要改用沿革取代觀光文案請加 `--replace-intro`
//    （那會一併移除 intro，但保留 open_time 與觀光署來源標註）。
//
// 用法：
//   node scripts/import-temple-history.mjs              # 乾跑（預設）
//   node scripts/import-temple-history.mjs --verbose
//   node scripts/import-temple-history.mjs --write
//   node scripts/import-temple-history.mjs --write --replace-intro
//   node scripts/import-temple-history.mjs --photos     # 另寫 docs/temple-photo-candidates.json

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const LIST_DIR = '/root/.config/folk-tw/intake/inbox/recon-service/foundation-list';
const JSON_DIR = '/root/.config/folk-tw/intake/inbox/religion-yange';
const TEMPLES = 'src/data/temples.json';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const VERBOSE = args.includes('--verbose');
const PHOTOS = args.includes('--photos');
const REPLACE_INTRO = args.includes('--replace-intro');

const FIELD = { 2: 'history', 3: 'architecture', 4: 'worship_flow' };
const KIND = { 2: '歷史沿革', 3: '建築特色', 4: '參拜流程' };

const unescapeHtml = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const norm = (s) => String(s ?? '').replace(/台/g, '臺').replace(/\s+/g, '').trim();

const listFiles = existsSync(LIST_DIR) ? readdirSync(LIST_DIR).filter((f) => /^page-\d+\.html$/.test(f)) : [];
const jsonFiles = existsSync(JSON_DIR) ? readdirSync(JSON_DIR).filter((f) => /^\d+-\d+\.json$/.test(f)) : [];

if (!listFiles.length || !jsonFiles.length) {
  console.log('資料還沒到齊，無法匯入：');
  console.log(`  查詢結果頁 ${listFiles.length} 個（${LIST_DIR}）　← religion-foundation-list job`);
  console.log(`  內容 JSON  ${jsonFiles.length} 個（${JSON_DIR}）　← religion-yange job`);
  console.log('  兩者都要有才對得起來（結果頁給廟名/地址，JSON 給內容）。');
  console.log('  跑 `node scripts/intake-status.mjs` 看進度。');
  process.exit(0);
}

// ── ① 從結果頁建 UploadFileID → { name, district } ──────────────────────────
// 🔴 **欄位順序不固定，不可用位置索引**（2026-08-06 實測換來的）：
//   有的列是 [廟名, 主管機關, 縣市鄉鎮, 地址, 電話, …]
//   有的列是 [廟名, 主管機關, **主祀神**, 縣市鄉鎮, 地址, …]  ← 多一欄，整排錯位
//   初版寫死 cells[2]+cells[3]，第二種列就把「主祀神＋縣市鄉鎮」當成地址，對映必然失敗。
//   改成**認形狀不認位置**：找出長得像「○○縣/市○○鄉/鎮/市/區」的那一格，它的下一格才是地址。
// 🔴 個資：電話與負責人在後面幾格，本檔連碰都不碰——只取廟名與這兩格。
const TOWN_CELL = /^..[縣市].{1,4}?[鄉鎮市區]$/;
const owner = new Map();
for (const f of listFiles.sort()) {
  const html = readFileSync(`${LIST_DIR}/${f}`, 'utf8');
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    if (!/main=['"]\d+['"]/.test(row)) continue;
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map((c) =>
      unescapeHtml(c.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
    );
    const name = cells.find((c) => c) ?? '';
    const ti = cells.findIndex((c) => TOWN_CELL.test(norm(c)));
    const district = ti >= 0 ? `${cells[ti]}${cells[ti + 1] ?? ''}`.replace(/\s+/g, '') : '';
    if (!name) continue;
    for (const m of row.matchAll(/<a[^>]*main=['"](\d+)['"][^>]*>/g)) {
      const idx = m[0].match(/idx=['"](\d+)['"]/)?.[1];
      if (!idx || !FIELD[idx]) continue;
      owner.set(`${m[1]}-${idx}`, { name, district });
    }
  }
}

// ── ② 三段消歧 ──────────────────────────────────────────────────────────────
const temples = JSON.parse(readFileSync(TEMPLES, 'utf8'));
const byName = new Map();
const byAddr = new Map();
for (const t of temples) {
  const n = norm(t.name);
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(t);
  const a = norm(t.district);
  if (!byAddr.has(a)) byAddr.set(a, []);
  byAddr.get(a).push(t);
}
/** 縣市＋鄉鎮（地址前綴），用來消歧。 */
const regionKey = (d) => norm(d).match(/^..[縣市].{1,4}?[鄉鎮市區]/)?.[0] ?? '';

const stat = {
  json: 0, noOwner: 0, notInDb: 0, byUnique: 0, byRegion: 0, byAddr: 0, unresolved: 0,
  written: {}, skippedExisting: 0, skippedPlaceholder: 0, skippedIntro: 0, photos: 0,
};
const photoList = [];

function resolveTemple(key) {
  const o = owner.get(key);
  if (!o) { stat.noOwner++; return null; }
  const cands = byName.get(norm(o.name)) ?? [];
  if (cands.length === 0) { stat.notInDb++; return null; }
  if (cands.length === 1) { stat.byUnique++; return cands[0]; }
  const want = regionKey(o.district);
  const narrowed = want ? cands.filter((t) => regionKey(t.district) === want) : [];
  if (narrowed.length === 1) { stat.byRegion++; return narrowed[0]; }
  const exact = (byAddr.get(norm(o.district)) ?? []).filter((t) => norm(t.name) === norm(o.name));
  if (exact.length === 1) { stat.byAddr++; return exact[0]; }
  // 「全台有同名廟，但**該鄉鎮一間都沒有**」＝我們根本沒收錄這一間，不是消歧失敗。
  // 分開計數才看得出真正需要處理的量：查詢涵蓋 12,419 個法人／寺廟，站上只有 8203 的那批。
  if (want && narrowed.length === 0) { stat.notInDb++; return null; }
  stat.unresolved++;
  return null;
}

/** 建築特色的佔位值：`Comment` 就是廟名／標題本身，或短到沒有資訊量。 */
const isPlaceholder = (comment, fileTitle, templeName) => {
  const c = norm(comment);
  return !c || c.length < 20 || c === norm(fileTitle) || c === norm(templeName);
};

const SOURCE_PREFIX = '內政部全國宗教資訊網';

for (const f of jsonFiles.sort()) {
  let j;
  try { j = JSON.parse(readFileSync(`${JSON_DIR}/${f}`, 'utf8')); } catch { continue; }
  stat.json++;
  const key = f.replace(/\.json$/, '');
  const idx = key.split('-')[1];
  const field = FIELD[idx];
  if (!field) continue;
  const t = resolveTemple(key);
  if (!t) { if (VERBOSE) console.log(`  ${key} → 對不上任何廟，略過`); continue; }

  const comment = String(j.Comment ?? '').trim();
  if (isPlaceholder(comment, j.FileTitle, t.name)) {
    stat.skippedPlaceholder++;
    if (VERBOSE) console.log(`  ${key} ${KIND[idx]} → ${t.id}：佔位值（「${comment.slice(0, 12)}」），略過`);
  } else if (t[field]) {
    stat.skippedExisting++;
    if (VERBOSE) console.log(`  ${key} ${KIND[idx]} → ${t.id}：已有 ${field}，不覆寫`);
  } else if (field === 'history' && t.intro && !REPLACE_INTRO) {
    stat.skippedIntro++;
    if (VERBOSE) console.log(`  ${key} 沿革 → ${t.id}：已有觀光署 intro，預設不動（--replace-intro 可覆蓋）`);
  } else {
    if (field === 'history' && t.intro) delete t.intro; // check:integrity 硬擋兩者並存
    t[field] = comment;
    t.sources = t.sources ?? [];
    const ref = `${SOURCE_PREFIX}·${KIND[idx]} https://religion.moi.gov.tw/Religion/GetUploadFile?UploadFileID=${key.split('-')[0]}&IndexID=${idx}&_t=0`;
    if (!t.sources.some((s) => String(s.ref ?? '').includes(`UploadFileID=${key.split('-')[0]}&IndexID=${idx}`))) {
      t.sources.push({
        type: 'gov',
        ref,
        note: `${KIND[idx]}（逐字，未改寫）；2026-08-06 經內政部同意使用，條件為標示資料來源連結`,
      });
    }
    stat.written[field] = (stat.written[field] ?? 0) + 1;
  }

  // 照片候選：AttachType==='pic' 才是圖。URL 是 `~/...` 形式，頁面 JS 會把 `~` 去掉。
  if (j.AttachType === 'pic' && j.URL) {
    stat.photos++;
    photoList.push({
      temple_id: t.id,
      key,
      kind: KIND[idx],
      src: String(j.URL).replace(/^~/, ''),
      alt: `${t.name}${KIND[idx]}`,
      page: `https://religion.moi.gov.tw/Religion/GetUploadFile?UploadFileID=${key.split('-')[0]}&IndexID=${idx}&_t=0`,
    });
  }
}

console.log(`\nGetUploadFile 匯入：讀 ${stat.json} 個 JSON（結果頁 ${listFiles.length} 頁建了 ${owner.size} 筆對映）`);
console.log('  ── 對映 ──');
console.log(`  廟名唯一命中　　${stat.byUnique}｜行政區消歧 ${stat.byRegion}｜完整地址消歧 ${stat.byAddr}`);
console.log(`  同名無法消歧　　${stat.unresolved}｜站上無此廟 ${stat.notInDb}｜結果頁查無此 id ${stat.noOwner}`);
console.log('  ── 寫入 ──');
for (const [k, v] of Object.entries(stat.written)) console.log(`  ${k}　${v} 筆`);
console.log(`  已有不覆寫 ${stat.skippedExisting}｜佔位值略過 ${stat.skippedPlaceholder}｜有 intro 不動 ${stat.skippedIntro}`);
console.log(`  照片候選 ${stat.photos}`);

if (PHOTOS) {
  writeFileSync('docs/temple-photo-candidates.json', JSON.stringify(photoList, null, 1) + '\n');
  console.log(`  ✓ 照片候選已寫入 docs/temple-photo-candidates.json`);
}
if (!WRITE) {
  console.log('\n（乾跑，未寫檔。加 --write 才寫回 temples.json。）');
  process.exit(0);
}
writeFileSync(TEMPLES, JSON.stringify(temples, null, 2) + '\n');
console.log(`\n✓ 已寫回 ${TEMPLES}`);
