#!/usr/bin/env node
// 部署 gate：對「渲染輸出」逐頁比對資料的不變量檢查（非抽驗，全量）。
// 目前涵蓋：廟宇頁「求籤 · 主祀神靈籤」區塊——資料上主祀神有籤系(divination_systems)者
//           必須渲染該區塊且連到每個 /systems/<id>/；否則必須不渲染。跨全部 7891 間廟逐一驗。
// 背景：feature 正確性不能靠人工抽驗幾間廟；此檢查跑在 build 後，發現不符即 exit 1
//       → deploy.yml build job 失敗 → 不部署。新 render 不變量可續加進本檔。
// 用法：pnpm build 後 `node scripts/check-rendered.mjs`（CI 已串在 build 之後）。
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const DIST = 'dist';
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

if (violations.length === 0) {
  console.log(`✓ render 不變量檢查通過：全 ${checked} 間廟頁逐一比對，${expectedCount} 間正確顯示求籤區塊、其餘正確不顯示；並確認全 ${checked} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料。`);
  process.exit(0);
}

console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
if (missingPages) console.error(`  （其中 ${missingPages} 間廟頁未建置）`);
for (const v of violations.slice(0, 30)) console.error(`  ✗ ${v}`);
if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
process.exit(1);
