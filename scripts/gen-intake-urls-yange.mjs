#!/usr/bin/env node
// 產生 `docs/intake-urls-yange.json`＝沿革／建築特色／參拜流程的 `url_list` 清單檔。
//
// 資料流（四段，別跳步）：
//   ① `religion-foundation-list`（paginate）收宗教團體查詢結果頁 → inbox/recon-service/foundation-list/
//   ② **本檔**：從那些頁解析 `<a class='other' main='<UploadFileID>' idx='<IndexID>'>` → 清單檔
//   ③ `religion-yange`（url_list）逐項抓 `GetUploadFile` → inbox/religion-yange/
//   ④ `scripts/import-temple-history.mjs` 匯入 temples.json
//
// 🔴 為什麼非得先跑①：那些 `UploadFileID` **不在任何開放資料集裡**——
//    2026-08-06 實查 `temple.xml`（8203）只有編號／名稱／地址／主祀／教別／登記別／電話／負責人／座標。
//    全站唯一列出它們的地方就是查詢結果頁。沒有①就產不出清單，這不是可以繞過的順序。
//
// IndexID 對照（2026-08-05 台灣端取樣確認）：
//   2 = 歷史沿革（`Comment` 是沿革全文）
//   3 = 建築特色（⚠️ 取樣那筆的 `Comment` 就是廟名本身＝佔位值，比例待實測）
//   4 = 參拜流程
//
// 🔴 **個資防線**：查詢結果頁的每一列都帶電話與負責人。本檔**只取 UploadFileID 與 IndexID**，
//    產出的清單只有 `key`／`url`（＋`_` 開頭的註記），不得帶任何個資進 public repo。
//
// 用法：
//   node scripts/gen-intake-urls-yange.mjs                 # 乾跑（預設）
//   node scripts/gen-intake-urls-yange.mjs --idx 2,4       # 只收沿革與參拜流程（預設 2,3,4）
//   node scripts/gen-intake-urls-yange.mjs --write
//   node scripts/gen-intake-urls-yange.mjs --include-offsite   # 連站上沒有的廟也收（見下）
//
// 🔴 **預設只收站上有頁面的廟**（2026-08-07 起）。理由是實測：已到貨的 1,362 項裡有 462 項
//    （34%）的廟站上根本沒有頁面，抓回來只能丟掉。照這比例，沿革＋參拜流程 5,153 項與
//    建築特色 3,623 項合計會有近三千個請求是白打在政府站台上。濾掉不只是省時間，
//    是不該為了不會發佈的內容去敲人家的站。
//    ⚠️ 濾網用的是 import-temple-history.mjs 那套三段消歧（廟名唯一→行政區→完整地址），
//    共用 scripts/lib/temple-owner.mjs。兩邊必須是同一套判斷，否則會濾掉匯入器其實對得上的項目。
//    要收全量（例如剛擴完母體、想重新評估）才加 --include-offsite。

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
// 對映與消歧的唯一實作（與 import-temple-history.mjs 共用，別在這裡重寫一套）。
import { buildOwnerMap, makeResolver } from './lib/temple-owner.mjs';

const DIR = '/root/.config/folk-tw/intake/inbox/recon-service/foundation-list';
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
// --out：另存一份清單（抽樣用），不覆蓋主清單。
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/intake-urls-yange.json';
// --sample N：只取前 N 項。用途是**先評估再決定要不要整批收**——
// 建築特色（idx=3）實測有 3,623 項，但取樣顯示佔位值很多（內容就是廟名本身），
// 整批收下來會被 isPlaceholder 擋掉＝白抓 3,623 個請求。
// ⚠️ 取樣要**均勻散佈**，不能取前 N 項：清單是照 UploadFileID 排序的，
// 前 N 項會集中在同一批建檔時期／同一批廟，佔位比例會失真。
const SAMPLE = args.includes('--sample') ? Number(args[args.indexOf('--sample') + 1]) : 0;
// ⚠️ 必須先 includes 再取值：`indexOf` 找不到回 **-1**，而 `args[-1 + 1]` ＝ `args[0]`——
// 沒帶 --idx 卻帶了 --write 時，IDX 會變成 ['--write'] → 過濾後為空 → 一項都解不出來。
// 2026-08-06 實測踩到：乾跑（無參數）正常、加 --write 就「解析結果為空」。
const IDX = (args.includes('--idx') ? args[args.indexOf('--idx') + 1] : '2,3,4')
  .split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
if (!IDX.length) {
  console.error('✗ --idx 參數無效（要像 --idx 2,4）。');
  process.exit(1);
}

const IDX_NAME = { 2: '歷史沿革', 3: '建築特色', 4: '參拜流程' };
const ONLY_ONSITE = !args.includes('--include-offsite');

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^page-\d+\.html$/.test(f)) : [];
if (!files.length) {
  console.log('尚未收到任何查詢結果頁。');
  console.log(`  預期落點：${DIR}/page-<N>.html`);
  console.log('  由 manifest 的 religion-foundation-list（paginate 型）抓取，台灣端每日 04:17 台北自動跑。');
  console.log('  跑 `node scripts/intake-status.mjs` 看進度。');
  process.exit(0);
}

// 🔴 屬性用的是**單引號**（`main='74678' t='0'`），而 idx 有時是雙引號——
//    2026-08-06 實測：只寫雙引號版會命中 0 筆。兩種都吃。
const A_TAG = /<a[^>]*main=['"](\d+)['"][^>]*>/g;
const pairs = new Map(); // `${uploadFileId}-${idx}` → true

let pagesRead = 0;
const perIdx = {};
for (const f of files.sort()) {
  const html = readFileSync(`${DIR}/${f}`, 'utf8');
  pagesRead++;
  A_TAG.lastIndex = 0;
  let m;
  while ((m = A_TAG.exec(html))) {
    const tag = m[0];
    const id = m[1];
    const idx = tag.match(/idx=['"](\d+)['"]/)?.[1];
    if (!idx || !IDX.includes(idx)) continue;
    pairs.set(`${id}-${idx}`, true);
    perIdx[idx] = (perIdx[idx] ?? 0) + 1;
  }
}

let allKeys = [...pairs.keys()].sort();

// ── 濾網：只留站上有頁面的廟（預設開，見檔頭 🔴）──────────────────────────
let filtered = 0;
if (ONLY_ONSITE) {
  const { owner } = buildOwnerMap(DIR, (idx) => IDX.includes(idx));
  const temples = JSON.parse(readFileSync('src/data/temples.json', 'utf8'));
  const { resolve } = makeResolver(owner, temples);
  const before = allKeys.length;
  allKeys = allKeys.filter((k) => resolve(k) !== null);
  filtered = before - allKeys.length;
}
// 均勻抽樣：每隔 step 取一項，涵蓋整個 id 值域。
const sampled = SAMPLE > 0 && SAMPLE < allKeys.length
  ? Array.from({ length: SAMPLE }, (_, i) => allKeys[Math.floor((i * allKeys.length) / SAMPLE)])
  : allKeys;
const items = sampled.map((k) => {
  const [id, idx] = k.split('-');
  return {
    key: k,
    url: `https://religion.moi.gov.tw/Religion/GetUploadFile?UploadFileID=${id}&IndexID=${idx}&_t=0`,
    _kind: IDX_NAME[idx] ?? idx,
  };
});

// 合規閘：清單只要有一處不合規，台灣端整個 job 停下、一個請求都不發（URLLIST-SPEC）。
const bad = [];
const seen = new Set();
for (const it of items) {
  if (!/^[A-Za-z0-9._-]+$/.test(it.key)) bad.push(`key 含非法字元：${it.key}`);
  if (seen.has(it.key)) bad.push(`key 重複：${it.key}`);
  seen.add(it.key);
  if (!/^https?:\/\//.test(it.url)) bad.push(`url 非 http(s)：${it.url}`);
}
if (!items.length) bad.push('解析結果為空——查詢結果頁的結構可能變了（先確認 main=/idx= 屬性還在）');
if (bad.length) {
  console.error(`✗ 清單不合規 ${bad.length} 處，不寫檔：`);
  for (const b of bad.slice(0, 8)) console.error(`   ${b}`);
  process.exit(1);
}

console.log(`\n查詢結果頁 ${pagesRead} 頁 → 附件連結：`);
for (const idx of IDX) console.log(`  IndexID=${idx}（${IDX_NAME[idx] ?? '?'}）　${perIdx[idx] ?? 0} 筆`);
if (ONLY_ONSITE) console.log(`  濾掉站上無頁面的廟 ${filtered} 項（要全量加 --include-offsite）`);
console.log(`  去重後合計 ${allKeys.length} 項` + (SAMPLE ? ` → 均勻抽樣 ${items.length} 項` : ''));
console.log(`  樣本：${items.slice(0, 3).map((x) => `${x.key}(${x._kind})`).join('、')}`);

if (!WRITE) {
  console.log('\n（乾跑，未寫檔。加 --write 才寫入。）');
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify(items, null, 1) + '\n');
console.log(`\n✓ 已寫入 ${OUT}（${items.length} 項）`);
console.log('  台灣端取用網址：https://raw.githubusercontent.com/weiqi-kids/folk.tw/main/' + OUT);
console.log('  ⚠️ 清單檔 push 之後，manifest 的 religion-yange job 才抓得到（它讀的是 main 分支的 raw）。');
