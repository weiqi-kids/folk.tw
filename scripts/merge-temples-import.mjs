#!/usr/bin/env node
// temples.import.json → temples.json 的 **append-only** 併入器（乾跑預設）。
//
// 用途：import-temples.ts 會把整份 MOI 開放資料轉成 temples.import.json，但 temples.json
// 早已被其他匯入器加過 history／intro／open_time／festivals／座標／image，**絕不可整份覆蓋**。
// 這支只做一件事：把「站上還沒有、且主祀對得上神明節點」的廟**附加**進去。
//
// 用法：
//   node scripts/merge-temples-import.mjs            # 乾跑，只印報表
//   node scripts/merge-temples-import.mjs --write    # 實際寫回 src/data/temples.json
//
// 🔴 不變量（改這支之前先讀，每一條都是實測踩出來的）：
//
// 1. **append-only**：既有條目一個欄位都不改。2026-08-07 實測，光是在 deities.json 補別名就
//    會讓 11 間既有廟的 main_deity_ref 在重跑時變動（多為「瑤池金母,道濟古佛」這種複合主祀，
//    命中順序改變所致），另有 2 筆是 MOI 來源自己改了主祀欄。擴母體不該順手改動線上頁面的
//    主祀神——要改是另一件事，要單獨評估。
//
// 2. **排除與手工廟同名者**：站上有 28 間非 moi_ 的手工策展廟（dajia_zhenlan 這種）。
//    2026-08-07 實測有 7 間會從 MOI 長出完全同名的第二頁（西港玉勅慶安宮、艋舺青山宮、
//    內門紫竹寺、台北霞海城隍廟、北港武德宮、麻豆代天府、正統鹿耳門聖母廟）。
//    比對用「正規化後完全同名」，**不可用子字串**——保安宮／龍山寺／代天府這類通名
//    會把幾十間不相干的廟誤判成重複。
//
// 3. **只收 main_deity_ref 有值者**：主祀對不上站上神明節點的（釋迦牟尼佛、明明上帝、
//    慚愧祖師…）不收，那是母體定位決策，不是這支的事。
//
// 4. **idempotent**：以 id 為準跳過既有者，重跑不會產生第二份。
//
// ⚠️ 已知的既有重複（**不是本支造成的，也不要試圖在這裡修**）：北港朝天宮、台灣府城隍廟、
//    南鯤鯓代天府 三間，站上同時有手工頁與 moi_ 頁。slug 是永久承諾，兩邊都不能刪，
//    要處理得走 canonical／合併，另案。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CUR = join(root, 'src/data/temples.json');
const IMP = join(root, 'src/data/temples.import.json');

const write = process.argv.includes('--write');
const cur = JSON.parse(readFileSync(CUR, 'utf8'));
const imp = JSON.parse(readFileSync(IMP, 'utf8'));

/** 廟名正規化：臺→台、去法人前綴與空白。只用於「完全同名」比對（見不變量 2）。 */
const norm = (s) => (s ?? '').replace(/臺/g, '台').replace(/財團法人|社團法人|\s/g, '');

const curIds = new Set(cur.map((t) => t.id));
const handmadeNames = new Set(cur.filter((t) => !/^moi_/.test(t.id)).map((t) => norm(t.name)));

const stat = { total: imp.length, noDeity: 0, already: 0, handmadeDup: 0, added: 0 };
const dupped = [];
const add = [];

for (const t of imp) {
  if (!t.main_deity_ref) { stat.noDeity++; continue; }
  if (curIds.has(t.id)) { stat.already++; continue; }
  if (handmadeNames.has(norm(t.name))) { stat.handmadeDup++; dupped.push(t.name); continue; }
  add.push(t);
  stat.added++;
}

console.log('=== temples.import.json → temples.json（append-only）===');
console.log(`  來源 ${stat.total} 筆`);
console.log(`  跳過：主祀無對映 ${stat.noDeity}｜站上已有 ${stat.already}｜與手工廟同名 ${stat.handmadeDup}`);
if (dupped.length) console.log(`    └ ${dupped.join('、')}`);
console.log(`  可新增 ${stat.added} 間　（站上 ${cur.length} → ${cur.length + stat.added}）`);

const byDeity = {};
for (const t of add) byDeity[t.main_deity_ref] = (byDeity[t.main_deity_ref] ?? 0) + 1;
const top = Object.entries(byDeity).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`  新增廟的主祀分布（前 12／共 ${Object.keys(byDeity).length} 尊）：`);
console.log('    ' + top.map(([k, v]) => `${k} ${v}`).join('｜'));
console.log(`  有座標者 ${add.filter((t) => t.lat && t.lng).length}/${stat.added}`);

if (!write) {
  console.log('\n（乾跑，未寫檔。加 --write 才寫回 src/data/temples.json。）');
  process.exit(0);
}

writeFileSync(CUR, JSON.stringify([...cur, ...add], null, 2) + '\n', 'utf8');
console.log(`\n✓ 已寫回 ${CUR}：${cur.length} → ${cur.length + stat.added} 間`);
