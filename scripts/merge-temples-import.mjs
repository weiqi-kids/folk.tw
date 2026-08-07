#!/usr/bin/env node
// temples.import.json → temples.json 的 **append-only** 併入器（乾跑預設）。
//
// 用途：import-temples.ts 會把整份 MOI 開放資料轉成 temples.import.json，但 temples.json
// 早已被其他匯入器加過 history／intro／open_time／festivals／座標／image，**絕不可整份覆蓋**。
// 這支只做一件事：把「站上還沒有、且在收錄範圍內」的廟**附加**進去
// （範圍＝漢人民間信仰；主祀對得上神明節點就掛 ref，對不上就留空，見不變量 3）。
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
// 3. **收錄範圍＝漢人民間信仰**（2026-08-07 用戶裁示改為「站上沒這尊神明的廟也要收」）：
//    不再要求 main_deity_ref 有值——那 1,597 間廟的主祀神散在 1,028 種，其中 813 種全台
//    只有一間廟，替它們各開一個神明節點既無來源可掛、也只會生出 813 個空殼頁。
//    改成：**神明對得上就掛 ref，對不上就 ref 留空、只留 main_deity_raw（政府原始欄位，有源）**。
//    🔴 但**佛教本尊與一貫道仍排除**（釋迦牟尼佛 976 間、阿彌陀佛、三寶佛、明明上帝…）：
//    那不是「還沒建節點」，是 /about/ 與 README 公開宣稱的收錄範圍——
//    「以漢人民間信仰為主（七大類），非窮盡台灣所有宗教信仰」。要收得先改那個宣稱。
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

// 定位外：佛教本尊與一貫道／新興教派。判斷用主祀神祇字樣，寧可漏收不可誤收。
const OUT_OF_SCOPE = /釋迦|阿彌陀|彌勒|藥師|三寶佛|西方三聖|華嚴三聖|如來|三聖佛|準提|達摩|普庵|毘盧|文殊|普賢|燃燈|明明上帝|無極老母|一貫|梵天|四面佛|伽藍|韋馱|一氣宗主|天德教/;

const stat = { total: imp.length, outOfScope: 0, noRaw: 0, already: 0, handmadeDup: 0, added: 0, withRef: 0 };
const dupped = [];
const add = [];

for (const t of imp) {
  if (curIds.has(t.id)) { stat.already++; continue; }
  if (!t.main_deity_raw) { stat.noRaw++; continue; }              // 主祀欄空白：無從判斷範圍，不收
  if (!t.main_deity_ref && OUT_OF_SCOPE.test(t.main_deity_raw)) { stat.outOfScope++; continue; }
  if (handmadeNames.has(norm(t.name))) { stat.handmadeDup++; dupped.push(t.name); continue; }
  add.push(t);
  stat.added++;
  if (t.main_deity_ref) stat.withRef++;
}

console.log('=== temples.import.json → temples.json（append-only）===');
console.log(`  來源 ${stat.total} 筆`);
console.log(`  跳過：站上已有 ${stat.already}｜主祀欄空白 ${stat.noRaw}｜收錄範圍外（佛教本尊／一貫道）${stat.outOfScope}｜與手工廟同名 ${stat.handmadeDup}`);
if (dupped.length) console.log(`    └ ${dupped.join('、')}`);
console.log(`  可新增 ${stat.added} 間　（站上 ${cur.length} → ${cur.length + stat.added}）`);
console.log(`    └ 其中有神明節點可掛 ${stat.withRef} 間｜主祀留 raw、ref 空 ${stat.added - stat.withRef} 間`);

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
