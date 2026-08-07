#!/usr/bin/env node
// 產生 `docs/intake-urls-photos.json`＝照片的 `url_list` 清單檔（**二進位檔**）。
//
// 授權：2026-08-06 用戶取得內政部同意，**明確含照片**，條件＝標示資料來源連結。
// 內政部的照片還多一層：圖說裡寫了**攝影者姓名**（如「（廖吟梅攝）」），
// 🔴 那是著作人格權的姓名表示，**每一張都必須把攝影者印在頁面上**，不是可選的。
//    匯入器會把 photographer 存進資料，渲染層必須顯示，gate 會驗。
//
// 兩個來源：
//   ① 宗教知識+ 條目的神明照 → scripts/import-knowledge-deities.mjs --photos
//      → docs/knowledge-photo-candidates.json
//   ② GetUploadFile 的廟宇照（AttachType==='pic'） → scripts/import-temple-history.mjs --photos
//      → docs/temple-photo-candidates.json
// 本檔把兩份候選合併成一份清單檔。
//
// ⚠️ **只收站上還沒有圖的對象**（候選檔產生時就已過濾）：67 尊神明已有 Commons 授權圖，
//    那些授權更明確、也已在 /about 標示，不要拿官方照去蓋掉。
//
// 🔴 清單檔進 public repo，只准 `key`／`url`（`_` 開頭的註記除外）。
//    ⚠️ **不要把攝影者寫進清單檔**——清單是抓取設定，攝影者屬於資料，
//    它的唯一真實來源是候選檔／匯入後的 JSON，寫兩份必然漂移。
//
// 用法：
//   node scripts/gen-intake-urls-photos.mjs           # 乾跑
//   node scripts/gen-intake-urls-photos.mjs --write

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = [
  { file: 'docs/knowledge-photo-candidates.json', prefix: 'deity', idField: 'deity_id' },
  { file: 'docs/temple-photo-candidates.json', prefix: 'temple', idField: 'temple_id' },
];
const OUT = 'docs/intake-urls-photos.json';
const WRITE = process.argv.includes('--write');

const BASE = 'https://religion.moi.gov.tw';
// key 只准 [A-Za-z0-9._-]，所以不能拿廟名／神名（中文）當 key；用來源自己的識別碼。
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');

// 🔴 `/ReligionSys/FileStore/<GUID>.<EXT>` 這一族**來源本身就 404**（646 B 的 IIS 錯誤頁）。
// 那個 URL 不是我們拼的，是 GetUploadFile 回的 JSON 自己的 `URL` 欄位給的絕對網址——
// 也就是說**沒有「正確網址」可以改**，重產也產不出別的。2026-08-07 台灣端兩次複驗（22:05／22:12）
// 都是 404，非暫時性；同輪 `/FileStore/CKUpload/` 一族 19/19 全部成功。
// 放進清單只會讓台灣端每輪各重試一次、job 永遠不標完成，所以在這裡就濾掉。
// ⚠️ 沿革／參拜流程全量到齊後，這一族的候選會從 3 筆長到數百筆——濾在這裡才擋得住整批。
// 之後若確認來源修好，把這段拿掉即可（候選檔本身仍完整保留這些筆，沒有資料被丟棄）。
const DEAD_PATH = /\/ReligionSys\/FileStore\//i;

const items = [];
const seen = new Set();
let read = 0;
let dead = 0;
for (const s of SRC) {
  if (!existsSync(s.file)) continue;
  const rows = JSON.parse(readFileSync(s.file, 'utf8'));
  read += rows.length;
  for (const r of rows) {
    if (!r.src) continue;
    // src 形如 `/WebCtrl/FileStore/CKUpload/xxx.JPG` 或 `/FileStore/...`，一律補站台前綴。
    const url = /^https?:\/\//.test(r.src) ? r.src : `${BASE}${r.src.startsWith('/') ? '' : '/'}${r.src}`;
    if (DEAD_PATH.test(url)) { dead++; continue; }
    const ext = (url.match(/\.([A-Za-z0-9]{2,5})(?:\?|$)/)?.[1] ?? 'jpg').toLowerCase();
    const key = `${s.prefix}-${safe(r[s.idField] ?? r.key)}.${ext}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ key, url, _for: r[s.idField] ?? r.key, _alt: r.alt ?? '' });
  }
}

if (!items.length) {
  console.log('尚無照片候選。');
  console.log('  先跑：node scripts/import-knowledge-deities.mjs --photos');
  console.log('    與：node scripts/import-temple-history.mjs --photos');
  console.log('  （兩者都要有對應的 inbox 資料才產得出候選，跑 node scripts/intake-status.mjs 看進度。）');
  process.exit(0);
}

const bad = [];
for (const it of items) {
  if (!/^[A-Za-z0-9._-]+$/.test(it.key)) bad.push(`key 含非法字元：${it.key}`);
  if (!/^https?:\/\//.test(it.url)) bad.push(`url 非 http(s)：${it.url}`);
}
if (bad.length) {
  console.error(`✗ 清單不合規 ${bad.length} 處，不寫檔：`);
  for (const b of bad.slice(0, 8)) console.error(`   ${b}`);
  process.exit(1);
}

console.log(`\n照片清單：候選 ${read} 筆 → 去重後 ${items.length} 項`);
if (dead) console.log(`  濾掉 ${dead} 筆：來源 /ReligionSys/FileStore/ 一族 404（見檔頭，不是我們拼錯網址）`);
console.log(`  樣本：${items.slice(0, 3).map((x) => x.key).join('、')}`);
if (!WRITE) {
  console.log('\n（乾跑，未寫檔。加 --write 才寫入。）');
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify(items, null, 1) + '\n');
console.log(`\n✓ 已寫入 ${OUT}（${items.length} 項）`);
console.log('  ⚠️ 這批是二進位檔，manifest 的 expect_per_item 不可用 `contains`（那是文字比對），');
console.log('     用 http_status ＋ min_bytes 即可。');
