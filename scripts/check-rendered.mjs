#!/usr/bin/env node
// 部署 gate：對「渲染輸出」逐頁比對資料的不變量檢查（非抽驗，全量）。
// 目前涵蓋：廟宇頁「求籤 · 主祀神靈籤」區塊——資料上主祀神有籤系(divination_systems)者
//           必須渲染該區塊且連到每個 /systems/<id>/；否則必須不渲染。跨全部 7891 間廟逐一驗。
// 背景：feature 正確性不能靠人工抽驗幾間廟；此檢查跑在 build 後，發現不符即 exit 1
//       → deploy.yml build job 失敗 → 不部署。新 render 不變量可續加進本檔。
// 用法：pnpm build 後 `node scripts/check-rendered.mjs`（CI 已串在 build 之後）。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const DIST = 'dist';
// 地區解析一律用頁面同一支 lib，不在本檔重寫規則（初版自寫正則，12 處對不上）。
const { templeCounty, templeTownship } = await import('../src/lib/temple-region.ts');
const temples = normalize(require('../src/data/temples.json'));
const deities = normalize(require('../src/data/deities.json'));

function normalize(j) {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.temples)) return j.temples;
  if (Array.isArray(j.deities)) return j.deities;
  return Object.values(j);
}

const deityById = new Map(deities.map((d) => [d.id, d]));

// 與 src/pages/temples/[id].astro 同一套判定：main_deity_ref 需對映到真實神明節點、
// 該神明有 divination_systems 才顯示求籤區塊，連向其每個籤系。
function expectedSystems(t) {
  if (!t.main_deity_ref || !deityById.has(t.main_deity_ref)) return [];
  return deityById.get(t.main_deity_ref).divination_systems ?? [];
}

const SECTION_MARK = 'class="temple-lingqian"';
// answer-first 摘要（全體廟頁必有，speakable 抓取對象）與 FAQPage 結構化資料（全體廟頁必有，
// 因「在哪裡」一題恆有答＝全站 100% 具 district）。兩者皆為模板層改動、7891 頁一次生效，逐頁全驗。
const SUMMARY_MARK = 'class="summary"';
const FAQ_MARK = '"@type":"FAQPage"';
const violations = [];
let checked = 0;
let missingPages = 0;
let expectedCount = 0;

for (const t of temples) {
  const file = `${DIST}/temples/${t.id}/index.html`;
  if (!existsSync(file)) { missingPages++; violations.push(`廟頁未建置：${t.id}（temples.json 有此廟但 dist 無頁）`); continue; }
  const html = readFileSync(file, 'utf8');
  const hasSection = html.includes(SECTION_MARK);
  const systems = expectedSystems(t);
  checked++;

  // 不變量（全體廟頁）：頁首 answer-first 摘要 + FAQPage 結構化資料，缺一即違規。
  if (!html.includes(SUMMARY_MARK)) violations.push(`${t.id} 缺少 answer-first 摘要元素（${SUMMARY_MARK}）`);
  if (!html.includes(FAQ_MARK)) violations.push(`${t.id} 缺少 FAQPage 結構化資料（${FAQ_MARK}）`);

  if (systems.length > 0) {
    expectedCount++;
    if (!hasSection) {
      violations.push(`${t.id}（主祀 ${t.main_deity_ref} 有籤系 ${systems.join('/')}）應顯示求籤區塊，實際缺少`);
      continue;
    }
    for (const sid of systems) {
      if (!html.includes(`/systems/${sid}/`)) {
        violations.push(`${t.id} 求籤區塊缺少連結 /systems/${sid}/`);
      }
    }
  } else if (hasSection) {
    violations.push(`${t.id}（主祀 ${t.main_deity_ref ?? '無對映'} 無籤系）不應顯示求籤區塊，實際卻有`);
  }
}

// ── 不變量 2：廟頁的「同鄉鎮其他宮廟」區塊與脈絡句（2026-07-28 加）──────────────
// 背景：GSC 抽驗顯示廟宇頁約 12% 未索引（推估 810 頁），最單薄的一批只有 273 字、4 條內鏈。
//       補上同鄉鎮鄰近宮廟（≤5 條）與「本鎮共 N 間」脈絡句後，這裡逐頁驗：
//       該鄉鎮不只一間廟時，區塊必須存在，且句中的 N 真的等於該鄉鎮的廟數。
{
  const inTownCount = new Map(); // `${slug}/${town}` → 廟數
  for (const t of temples) {
    const c = templeCounty(t.district), tw = templeTownship(t.district);
    if (!c || !tw) continue;
    const key = `${c.slug}/${tw.name}`;
    inTownCount.set(key, (inTownCount.get(key) ?? 0) + 1);
  }
  let checkedNearby = 0;
  for (const t of temples) {
    const c = templeCounty(t.district), tw = templeTownship(t.district);
    if (!c || !tw) continue;
    const total = inTownCount.get(`${c.slug}/${tw.name}`) ?? 0;
    if (total <= 1) continue; // 全鎮只有這一間 → 不該有鄰近區塊，正確地不驗
    const file = `${DIST}/temples/${t.id}/index.html`;
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    checkedNearby++;
    if (!html.includes('class="nearby"')) {
      violations.push(`${t.id}（${tw.name}共 ${total} 間）應有「同鄉鎮其他宮廟」區塊，實際缺少`);
      continue;
    }
    if (!new RegExp(`登記在案的宮廟共\\s*${total}\\s*間`).test(html)) {
      violations.push(`${t.id} 在地脈絡句的鄉鎮廟數與資料不符（資料 ${total} 間）`);
    }
  }
  globalThis.__nearbyChecked = checkedNearby;
}

// ── 不變量 3：鄉鎮頁的 answer-first 摘要（2026-07-28 加）───────────────────────
// 背景：鄉鎮頁原本只有「共 N 間」＋一長串清單＝薄列表頁，GSC 實測收錄率 23/40（57%），
//       全站最低。補上由資料衍生的摘要（間數／主祀神分布／全縣排名）後，這裡逐頁驗
//       「摘要存在，且裡面那個間數真的等於該鄉鎮的廟數」——防的是模板句寫死或統計算錯。
// 由 district 反推「縣市名＋鄉鎮名」→ 廟數。配對鍵刻意用頁面 h1 的文字（`${縣市}${鄉鎮}廟宇`），
// 這樣不必在本檔複製一份 slug↔縣市名對照；若頁面把地區寫錯，也會因查無此鍵而被抓出來。
// ⚠️ 地區解析**直接 import 頁面用的那支 lib**，絕不在本檔重寫一份規則——
// 重寫就是新的漂移來源（本檔初版自行寫了正則，立刻在桃園區／麻豆區等 12 處對不上，
// 因為 lib 的規則依縣市別區分後綴：市轄「區」、縣轄「鄉/鎮/市」，且先做臺→台正規化）。

const normTw = (s) => String(s ?? '').replace(/臺/g, '台');
const townCounts = new Map();
for (const t of temples) {
  const c = templeCounty(t.district), tw = templeTownship(t.district);
  if (!c || !tw) continue;
  const key = c.name + tw.name;
  townCounts.set(key, (townCounts.get(key) ?? 0) + 1);
}

function* townPageFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* townPageFiles(p);
    else if (name === 'index.html' && p.split('/').length === 6) yield p; // dist/temples/region/<slug>/<town>/index.html
  }
}

let townPages = 0, townUnmatched = 0;
for (const file of townPageFiles(join(DIST, 'temples', 'region'))) {
  const html = readFileSync(file, 'utf8');
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim();
  const key = h1 ? normTw(h1).replace(/廟宇$/, '') : undefined;
  townPages++;
  if (!html.includes('class="lead"')) {
    violations.push(`鄉鎮頁 ${file} 缺 answer-first 摘要（class="lead"）`);
    continue;
  }
  const count = key ? townCounts.get(key) : undefined;
  if (count === undefined) { townUnmatched++; continue; } // 地區名解析規則差異，不當違規（見上）
  if (!new RegExp(`收錄\\s*${count}\\s*間廟宇`).test(html)) {
    violations.push(`鄉鎮頁 ${key} 摘要間數與資料不符（資料 ${count} 間）`);
  }
}

if (violations.length === 0) {
  console.log(`✓ render 不變量檢查通過：全 ${checked} 間廟頁逐一比對，${expectedCount} 間正確顯示求籤區塊、其餘正確不顯示；並確認全 ${checked} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料；另全 ${globalThis.__nearbyChecked} 間有鄰居的廟頁皆含同鄉鎮宮廟區塊且鎮內廟數相符；全 ${townPages} 個鄉鎮頁摘要存在、其中 ${townPages - townUnmatched} 頁間數與資料逐一相符。`);
  process.exit(0);
}

console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
if (missingPages) console.error(`  （其中 ${missingPages} 間廟頁未建置）`);
for (const v of violations.slice(0, 30)) console.error(`  ✗ ${v}`);
if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
process.exit(1);
