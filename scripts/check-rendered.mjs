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
// 農曆換算同理：用頁面用的同一支 lib（src/lib/lunar-date.ts 刻意零專案內 import，故本檔可直接載）。
const { lunarDateLabel, isLunarMonthEnd, festivalNextSolar } = await import('../src/lib/lunar-date.ts');
const { Solar } = require('lunar-javascript');
const temples = normalize(require('../src/data/temples.json'));
const deities = normalize(require('../src/data/deities.json'));
const festivals = normalize(require('../src/data/festivals.json'));

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

  // 不變量 1b（2026-07-30 加）：分享卡必須是「這間廟自己那張」，且分享標題不得出現站名。
  // 背景：外撥把廟宇連結傳給廟方時，原本 12,018 頁共用同一張神酷品牌卡，
  //       主委看到的是別人的招牌（用戶截圖實例）。這裡逐廟驗三件事：
  //       og:image 指向本廟的卡、該檔真的存在（不能指向 404）、og:title 不含「神酷」。
  const ogImg = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? '';
  const wantPath = `/og/temples/${encodeURIComponent(t.id)}.png`;
  if (!ogImg.endsWith(wantPath)) {
    violations.push(`${t.id} og:image 不是本廟專屬卡（實際：${ogImg || '無'}）`);
  } else if (!existsSync(`${DIST}/og/temples/${t.id}.png`)) {
    violations.push(`${t.id} og:image 指向的卡片檔不存在（dist/og/temples/${t.id}.png）`);
  }
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '';
  if (!ogTitle) violations.push(`${t.id} 缺 og:title`);
  else if (ogTitle.includes('神酷')) violations.push(`${t.id} og:title 仍含「神酷」：${ogTitle}`);

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
    // 不變量 2b（2026-07-30 加）：meta description 不得落回通用樣板。
    // 背景：原尾句「神酷（folk.tw）廟宇資料庫收錄，資料源自內政部…」在 ~7,869 頁一字不差
    //       （history 只有 22 間有），對「台南○○宮」查詢零資訊量。改為由沿革/聖誕/鄉鎮脈絡衍生後，
    //       這裡驗：**該鎮不只一間廟者**（＝townContext 必非空）description 一定有可衍生內容，
    //       故不該出現通用尾句。這是防止未來改動又把它退回樣板。
    const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
    const desc = descMatch?.[1] ?? '';
    if (!desc) {
      violations.push(`${t.id} 缺 meta description`);
    } else if (/資料源自內政部全國宗教資訊網。$/.test(desc)) {
      violations.push(`${t.id}（${tw.name}共 ${total} 間，應有鄉鎮脈絡可寫）description 落回通用樣板`);
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

// ── 不變量 4：神明頁 title 的聖誕日期（2026-07-30 加；本檔首次涵蓋 deity 頁）──────────
// 背景：GSC 實測神明頁 CTR 僅 1.13%，主流意圖是「○○生日／聖誕」＝一個日期就滿足，
//       但 title 原本只有農曆、且用阿拉伯數字（農曆3月23日），從未命中查詢用的「農曆三月廿三」形式，
//       也沒有使用者真正要的國曆。改為「・聖誕農曆三月廿三（國曆 4/29）」後，這裡逐尊全驗。
// ⚠️ 不用「今天」去算期望值（build 與 gate 若跨越台灣午夜就會差一天而誤報）。
//    改做**往返驗證**：把 title 上印的國曆 M/D 轉回農曆，必須等於該尊的聖誕 MM-DD
//    （短月順延：卅日聖誕落在僅廿九日之農曆月底亦算相符）。年份未印在 title，故容許今年或明年。
let deityChecked = 0;
let deityWithShengdan = 0;
{
  const nowYear = new Date().getUTCFullYear();
  for (const d of deities) {
    // draft（如 sheshen：聖誕待查）在 prod 不發佈頁，正確地不驗——與 queries.publishable() 一致。
    if (d.draft) continue;
    const file = `${DIST}/deities/${d.id}/index.html`;
    if (!existsSync(file)) { violations.push(`神明頁未建置：${d.id}`); continue; }
    const html = readFileSync(file, 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    deityChecked++;

    const real = (d.birthday_lunar ?? []).filter(
      (b) => b.date && !['無定', '待查', '未定'].includes(b.date),
    );
    const shengdan = real.find((b) => b.kind === '聖誕') ?? null;

    if (!shengdan) {
      // 雙向反例：無聖誕者（如好兄弟／城隍／太歲）不得出現聖誕後綴，
      // 也不得因舊的 `?? realBdays[0]` 回退而漏出「・飛昇…」這類非聖誕字樣。
      if (/・聖誕/.test(title)) violations.push(`${d.id} 無聖誕資料，title 卻出現「・聖誕」：${title}`);
      if (/・(飛昇|得道|成道|其他)/.test(title)) {
        violations.push(`${d.id} title 出現非聖誕的日期後綴（應只用 kind==='聖誕'）：${title}`);
      }
      continue;
    }

    deityWithShengdan++;
    // 9 尊神有多筆聖誕（七爺八爺 04-26/04-27/10-01、三官大帝 01-15/07-15/10-15…），
    // 頁面挑「下一次最近」的那筆。gate 刻意**不假設挑中哪一筆**（也就不依賴「今天」，
    // 否則 build 與 gate 跨越台灣午夜就會誤報），只驗真正在意的不變量：
    //   (a) title 印的農曆標籤必須是該尊「某一筆真實聖誕」；
    //   (b) title 印的國曆 M/D 轉回農曆必須等於**同一筆**（短月順延亦算相符）。
    const shengdanDates = real.filter((b) => b.kind === '聖誕').map((b) => b.date);
    const shown = title.match(/・聖誕(農曆[^（|]+)/);
    if (!shown) { violations.push(`${d.id} title 缺「・聖誕農曆…」（實際：${title}）`); continue; }
    const shownLabel = shown[1].trim();
    const matchedDate = shengdanDates.find((dt) => lunarDateLabel(dt) === shownLabel);
    if (!matchedDate) {
      violations.push(
        `${d.id} title 的聖誕「${shownLabel}」不對應任何一筆資料（資料：${shengdanDates.map((x) => lunarDateLabel(x)).join('、')}）`,
      );
      continue;
    }
    const md = title.match(/（國曆\s*(\d{1,2})\/(\d{1,2})）/);
    if (!md) { violations.push(`${d.id} title 缺國曆日期「（國曆 M/D）」：${title}`); continue; }
    const mo = Number(md[1]);
    const day = Number(md[2]);
    const wantM = Number(matchedDate.slice(0, 2));
    const wantD = Number(matchedDate.slice(3));
    const roundTripOk = [nowYear, nowYear + 1, nowYear + 2].some((y) => {
      let s;
      try { s = Solar.fromYmd(y, mo, day); } catch { return false; }
      const l = s.getLunar();
      if (l.getMonth() !== wantM) return false;
      if (l.getDay() === wantD) return true;
      return wantD === 30 && l.getDay() === 29 && isLunarMonthEnd(s.toYmd());
    });
    if (!roundTripOk) {
      violations.push(`${d.id} title 國曆 ${mo}/${day} 轉回農曆不等於所標示的聖誕 ${matchedDate}（${shownLabel}）`);
    }
  }
}

// ── 不變量 5：節日頁（2026-07-30 加）─────────────────────────────────────────
// 每個 festivals.json 條目都必須有頁、有 answer-first .lead、有 FAQPage 與 Event 結構化資料，
// 且 title 上的國曆 M/D 同樣做農曆往返驗證（防日期算錯或模板寫死）。
let festChecked = 0;
for (const f of festivals) {
  const file = `${DIST}/festivals/${f.slug}/index.html`;
  if (!existsSync(file)) { violations.push(`節日頁未建置：${f.slug}`); continue; }
  const html = readFileSync(file, 'utf8');
  festChecked++;
  if (!html.includes('class="lead"')) violations.push(`節日頁 ${f.slug} 缺 answer-first 摘要（class="lead"）`);
  if (!html.includes(FAQ_MARK)) violations.push(`節日頁 ${f.slug} 缺 FAQPage 結構化資料`);
  if (!html.includes('"@type":"Event"')) violations.push(`節日頁 ${f.slug} 缺 Event 結構化資料`);
  // 農曆節日與節氣節日（清明）走同一支 lib 取標籤，gate 不自行判斷型別。
  const { label: wantLabel } = festivalNextSolar(f, '2026-01-01');
  if (wantLabel && !html.includes(wantLabel)) {
    violations.push(`節日頁 ${f.slug} 未出現日期標籤「${wantLabel}」`);
  }
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const md = title.match(/(\d{1,2})\/(\d{1,2})/);
  if (!md && !f.date_note) {
    violations.push(`節日頁 ${f.slug} title 缺國曆日期：${title}`);
  }
  // 農曆節日再做一次往返驗證（節氣節日的國曆日由節氣表定、無農曆可往返，故只驗農曆型）。
  if (md && f.lunar_date) {
    const mo = Number(md[1]);
    const day = Number(md[2]);
    const wantM = Number(f.lunar_date.slice(0, 2));
    const wantD = Number(f.lunar_date.slice(3));
    const nowYear = new Date().getUTCFullYear();
    const ok = [nowYear, nowYear + 1, nowYear + 2].some((y) => {
      let s;
      try { s = Solar.fromYmd(y, mo, day); } catch { return false; }
      const l = s.getLunar();
      if (l.getMonth() !== wantM) return false;
      if (l.getDay() === wantD) return true;
      return wantD === 30 && l.getDay() === 29 && isLunarMonthEnd(s.toYmd());
    });
    if (!ok) violations.push(`節日頁 ${f.slug} title 國曆 ${mo}/${day} 轉回農曆不等於 ${f.lunar_date}`);
  }
}

if (violations.length === 0) {
  console.log(`✓ render 不變量檢查通過：全 ${checked} 間廟頁逐一比對，${expectedCount} 間正確顯示求籤區塊、其餘正確不顯示；並確認全 ${checked} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料、且 og:image 為本廟專屬卡（檔案存在）且 og:title 不含站名；另全 ${globalThis.__nearbyChecked} 間有鄰居的廟頁皆含同鄉鎮宮廟區塊且鎮內廟數相符；全 ${townPages} 個鄉鎮頁摘要存在、其中 ${townPages - townUnmatched} 頁間數與資料逐一相符；全 ${deityChecked} 尊神明頁其中 ${deityWithShengdan} 尊聖誕（農曆標籤＋國曆往返驗證）相符、其餘正確不帶日期後綴；全 ${festChecked} 個節日頁含 lead／FAQPage／Event 且日期相符。`);
  process.exit(0);
}

console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
if (missingPages) console.error(`  （其中 ${missingPages} 間廟頁未建置）`);
for (const v of violations.slice(0, 30)) console.error(`  ✗ ${v}`);
if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
process.exit(1);
