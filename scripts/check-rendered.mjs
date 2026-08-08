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
// 廟宇年度祭典的代表筆挑選與句子生成同理：頁面、OG 卡、本 gate 走同一支 lib。
const { pickMainFestival, festivalSentence } = await import('../src/lib/temple-festival.ts');
const TODAY = new Date().toISOString().slice(0, 10);
// 內文節點與屬性值的跳脫規則不同（屬性多跳脫引號），比對時要分開用，
// 否則哪天資料出現 &／"／< 就會 gate 誤報。目前資料無此字元，但別把它留成未來的陷阱。
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
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

// ── 不變量 1f 的資料（2026-08-05）：廟宇頁祈福區塊的反查表 ──────────────────────
// 與 src/pages/temples/[id].astro 同一套反查（scenarios 的 patrons[].deity_ref、
// concerns 的 deities[]），本檔不自行重寫對映規則。
// 🔴 必須比照頁面的 publishable() 過濾，否則 gate 與頁面看到的資料集不同＝誤報。
// 頁面走 getDeities()/getScenarios()＝`publishable(e, true)`：draft 排除，
// **且 prod 下無 sources 者也排除**（見 src/lib/queries.ts:13-20）。本檔讀的是原始 JSON，
// 不套這層就會對「頁面根本拿不到的神明」要求渲染。
// 現況只有 `sheshen`（draft、0 間廟主祀）會被濾掉，所以今天不套也不會爆——
// 但哪天有人把一尊有廟的神明標成 draft，就會冒出一整批看不懂的違規。這是預防那件事。
// ⚠️ 既有的 expectedSystems()（不變量 1）有同樣的潛在假設，本次刻意不動它（不在計畫範圍）。
const publishableEntry = (e) => !e.draft && (e.sources ?? []).length > 0;
const scenariosData = normalize(require('../src/data/scenarios.json')).filter(publishableEntry);
const concernsData = normalize(require('../src/data/concerns.json'));
const scenariosByDeity = new Map();
for (const s of scenariosData) {
  for (const p of s.patrons ?? []) {
    (scenariosByDeity.get(p.deity_ref) ?? scenariosByDeity.set(p.deity_ref, []).get(p.deity_ref)).push(s.id);
  }
}
const concernsByDeity = new Map();
for (const c of concernsData) {
  for (const d of c.deities ?? []) {
    (concernsByDeity.get(d) ?? concernsByDeity.set(d, []).get(d)).push(c.id);
  }
}
const allScenarioIds = scenariosData.map((s) => s.id);
const allConcernIds = concernsData.map((c) => c.id);

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
let festTemples = 0;
let titleWithDeity = 0;
let qifuChecked = 0;
let qifuWithOffice = 0;
let qifuWithScenario = 0;
let qifuWithConcern = 0;
let qifuIntro = 0;
let qifuOpen = 0;
let moiDetailTemples = 0;
let templePhotos = 0;
let deityPhotos = 0;

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

  // 不變量 1e（2026-08-03 加）：meta description 不得出現連續標點。
  // 背景：description 由多個「可有可無」的句子串接（沿革首句／祭典句／聖誕句／求籤句／鄉鎮脈絡），
  //       每一段自己負責結尾標點。`historyFirstSentence` 有「已自帶標點就不補」的守衛，
  //       但 2026-07-31 加的 `main_festival` 分支漏了 → 那 21 筆已查證敘述句**全部自帶句號**，
  //       再補一個就變成「…獲指定為國家重要民俗。。可線上求籤」。受影響的正是最重要的一批名廟
  //       （大甲鎮瀾宮／北港朝天宮／東港東隆宮／艋舺龍山寺／南鯤鯓代天府…），
  //       而且**從 7/31 起就這樣送進 SERP，直到 8/3 才由線上 curl 抓到**。
  // ⚠️ 這類拼接瑕疵既有的檢查一律抓不到：不變量 1c 只驗「代表祭典句與資料相符」，
  //    而那 21 間走 main_festival 分支、被 `if (!t.main_festival)` 明確排除；
  //    不變量 2b 只驗「不得落回通用樣板」。故獨立成一條，涵蓋全 7,891 頁（不設任何前置條件）。
  const descForPunct = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const dupPunct = descForPunct.match(/[。，、；：！？]{2,}/);
  if (dupPunct) {
    const at = descForPunct.indexOf(dupPunct[0]);
    violations.push(
      `${t.id} description 出現連續標點「${dupPunct[0]}」（第 ${at} 字）：…${descForPunct.slice(Math.max(0, at - 18), at + 12)}…`,
    );
  }

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

  // 不變量 1d（2026-07-31 加）：title 的長度上限與髒資料清洗。
  // 背景：title 加上「主祀○○」是為了在 Google 地圖包旁邊給出地圖沒有的資訊。
  //       但 `main_deity_raw` 是 MOI 原始欄位，有廟登記 7 尊並列、也有超長名稱——
  //       未清洗就會產生 47 全形字、被 Google 從中間截斷的標題。
  // 驗三件事（都是**上線後才看得到**的產物層事實，不能只靠 build 期單元測試）：
  //   ① 帶「主祀」子句者，全形寬（含站名）不得超過 30——超過代表退回分支失效；
  //   ② 帶「主祀」子句者，神名不得含分隔符（逗號/頓號/分號）——含了代表「取首位」失效；
  //   ③ 帶「主祀」子句者，神名不得超過 8 全形字。
  // ⚠️ 上限**只對帶主祀子句者**斷言，因為那正是程式碼保證的事（「加子句不得把標題推過 30」）。
  //   有 3 間廟光是「登記全名＋鄉鎮」就已超過 30（如「財團法人蚵子寮朝天宮天上聖母船仔媽
  //   (94年9月變動更名)・高雄市梓官區」），那是**改動前就存在**的既有狀態，且不該為了湊字數去
  //   截廟方的登記全名——廟名正是使用者搜的字，截掉比顯示被 Google 省略更糟。
  const pageTitle = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  if (!pageTitle) {
    violations.push(`${t.id} 缺 <title>`);
  } else {
    const m = pageTitle.match(/・主祀([^｜]+)｜/);
    if (m) {
      titleWithDeity++;
      const wide = [...pageTitle].reduce((n, c) => (/[\x00-\xff]/.test(c) ? n + 0.5 : n + 1), 0);
      if (wide > 30) violations.push(`${t.id} title 帶主祀子句卻超過 30 全形字（${wide}）：${pageTitle}`);
      if (/[,，、;；]/.test(m[1])) violations.push(`${t.id} title 主祀神未取首位（含分隔符）：${m[1]}`);
      if ([...m[1]].reduce((n, c) => (/[\x00-\xff]/.test(c) ? n + 0.5 : n + 1), 0) > 8) {
        violations.push(`${t.id} title 主祀神超過 8 全形字：${m[1]}`);
      }
    }
  }

  // 不變量 1c（2026-07-31 加）：年度慶(祭)典區塊。
  // 背景：內政部慶(祭)典資料匯入後 2,498 間廟有了自己登記的祭典（4,106 筆）。
  //       這是廟宇頁最實質的獨有內容，也直接餵 meta description 與 OG 分享卡，
  //       故逐頁驗**雙向**：有資料必須渲染且筆數相符、無資料必須不渲染（防模板寫死）。
  // ⚠️ 代表筆與日期字串一律取 lib 的計算結果比對，不在本檔重寫挑選規則。
  const templeFestivals = t.festivals ?? []; // 刻意不叫 festivals：模組層已有 festivals.json
  const hasFestSection = html.includes('class="temple-festivals"');
  if (templeFestivals.length > 0) {
    festTemples++;
    if (!hasFestSection) {
      violations.push(`${t.id}（有 ${templeFestivals.length} 筆年度祭典）應顯示年度祭典區塊，實際缺少`);
    } else {
      // ⚠️ 逐項計數用 class="fdate" 出現次數，**不要**寫成 `<li><span class="fdate">`：
      // Astro 會在每個元素補 data-astro-cid-* 屬性，那種寫法會恆為 0＝gate 靜默失效。
      const items = (html.match(/class="fdate"/g) ?? []).length;
      if (items !== templeFestivals.length) {
        violations.push(`${t.id} 年度祭典列出 ${items} 筆，資料為 ${templeFestivals.length} 筆`);
      }
      // 每一筆的祭典名稱都必須真的出現在頁面上（防只渲染日期、或渲染到別間廟的資料）。
      for (const f of templeFestivals) {
        if (!html.includes(escText(f.name))) {
          violations.push(`${t.id} 年度祭典缺少「${f.name}」`);
          break;
        }
      }
      // 代表筆（農曆日期最早）必須進 meta description——那是這批資料的 CTR 目的。
      // 已查證 main_festival 的 21 間走原本的敘述句，不適用本檢查。
      if (!t.main_festival) {
        const main = pickMainFestival(templeFestivals);
        const sentence = main ? festivalSentence(t.name, main, TODAY) : '';
        const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
        if (sentence && !desc.includes(escAttr(sentence))) {
          violations.push(`${t.id} meta description 未含代表祭典句：${sentence}`);
        }
      }
    }
  } else if (hasFestSection) {
    violations.push(`${t.id}（無年度祭典資料）不應顯示年度祭典區塊，實際卻有`);
  }

  // 不變量 1f（2026-08-05 加）：祈福動線區塊 `temple-qifu`。
  // 背景：廟宇頁佔全站曝光 91% 卻對 /qiugian/ 零導流（正文 0 條內鏈，8 條全在折疊 nav 裡），
  //       導致時事集氣頁近 30 天合計只有 7 次瀏覽，「依真實集氣數決定去留」無數據可用。
  //       這個區塊是全 7,891 頁的常設入口，故逐頁全驗。
  // 🔴 **一律只在區塊內比對，不用全頁 includes**：nav 每頁都渲染全部 7 個 /qiugian/<concern>/
  //    連結，全頁比對會讓「不應出現」那半邊恆為真＝gate 靜默失效（同 1c 的 fdate 教訓）。
  const qifuBlock = html.match(/<section class="temple-qifu"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  if (!qifuBlock) {
    violations.push(`${t.id} 缺少祈福區塊（class="temple-qifu"），該區塊應為全體廟頁常設`);
  } else {
    qifuChecked++;
    // (1) 收尾的集氣入口無條件存在——這是本區塊的存在理由。
    if (!qifuBlock.includes('href="/qiugian/"')) {
      violations.push(`${t.id} 祈福區塊缺少 /qiugian/ 集氣入口連結`);
    }
    // (2) 職司句須與 deities.json 的 office 逐項相符（有 office 才驗；無則須不出現該句）。
    const rawNode = t.main_deity_ref ? deityById.get(t.main_deity_ref) : null;
    const node = rawNode && publishableEntry(rawNode) ? rawNode : null; // 同頁面的 refOk
    const office = node?.office ?? [];
    if (office.length > 0 && node?.name) {
      qifuWithOffice++;
      const sentence = `${node.name}的職司是${office.join('、')}。`;
      if (!qifuBlock.includes(escText(sentence))) {
        violations.push(`${t.id} 祈福區塊職司句與 deities.json 不符，應為：${sentence}`);
      }
    } else if (qifuBlock.includes('class="qifu-office"')) {
      violations.push(`${t.id}（主祀神無 office 資料）不應顯示職司句，實際卻有`);
    }
    // (3)(4) 情境／煩惱籤**雙向**：該有的每一條都在、不該有的一條都不能在。
    const expectScenarios = node ? (scenariosByDeity.get(t.main_deity_ref) ?? []) : [];
    for (const sid of allScenarioIds) {
      const present = qifuBlock.includes(`/scenarios/${sid}/`);
      if (expectScenarios.includes(sid) && !present) {
        violations.push(`${t.id} 祈福區塊缺少情境連結 /scenarios/${sid}/`);
      } else if (!expectScenarios.includes(sid) && present) {
        violations.push(`${t.id} 祈福區塊多出情境連結 /scenarios/${sid}/（主祀神非該情境的 patron）`);
      }
    }
    if (expectScenarios.length > 0) qifuWithScenario++;
    const expectConcerns = node ? (concernsByDeity.get(t.main_deity_ref) ?? []) : [];
    for (const cid of allConcernIds) {
      const present = qifuBlock.includes(`/qiugian/${cid}/`);
      if (expectConcerns.includes(cid) && !present) {
        violations.push(`${t.id} 祈福區塊缺少煩惱籤連結 /qiugian/${cid}/`);
      } else if (!expectConcerns.includes(cid) && present) {
        violations.push(`${t.id} 祈福區塊多出煩惱籤連結 /qiugian/${cid}/（concerns.json 未把該神明列入）`);
      }
    }
    if (expectConcerns.length > 0) qifuWithConcern++;
  }

  // 不變量 1g（2026-08-05 加）：觀光署簡介與開放時間。
  // 背景：intro（115 間）與 history（22 間，逐間查證）是兩種東西且**互斥顯示**。
  // 🔴 條件是 `!t.history` 而非 `!hasHistory`（founded||history||main_festival）——
  //    用後者會讓「有 main_festival 但無 history」的廟連 intro 一起靜默消失。
  //    頁面已改成 `!t.history`，這裡照同一條斷言，兩邊必然一致。
  const introBlock = html.match(/<section class="temple-intro"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  const wantIntro = !t.history && !!t.intro;
  if (wantIntro) {
    qifuIntro++;
    if (!introBlock) {
      violations.push(`${t.id}（有 intro 且無 history）應顯示簡介區塊，實際缺少`);
    } else {
      if (!introBlock.includes(escText(t.intro))) violations.push(`${t.id} 簡介區塊文字與 temples.json 的 intro 不符`);
      // OGDL 1.0 要求標示出處：頁面須明寫引自何處（頁尾 Sources 之外再標一次給讀者看）。
      if (!introBlock.includes('觀光資訊資料庫')) violations.push(`${t.id} 簡介區塊未標示來源（應含「觀光資訊資料庫」）`);
    }
  } else if (introBlock) {
    violations.push(`${t.id}（${t.history ? '已有 history' : '無 intro'}）不應顯示簡介區塊，實際卻有`);
  }
  // 開放時間：雙向。有資料必須出現在基本資料表且值相符；無資料不得出現該列。
  const hasOpenRow = html.includes('>開放時間</dt>');
  if (t.open_time) {
    qifuOpen++;
    if (!hasOpenRow) violations.push(`${t.id}（open_time=${t.open_time}）應顯示開放時間，實際缺少`);
    else if (!html.includes(escText(t.open_time))) violations.push(`${t.id} 開放時間值與資料不符（應為 ${t.open_time}）`);
  } else if (hasOpenRow) {
    violations.push(`${t.id}（無 open_time 資料）不應顯示開放時間列，實際卻有`);
  }

  // 不變量 1i（2026-08-06 加）：代表圖與**出處標示**。
  // 🔴 內政部的照片有兩項義務，缺一即違規，故兩項都硬擋：
  //    ① 攝影者姓名（著作人格權的姓名表示）必須印在頁面上
  //    ② 可點的來源連結（授權條件）必須在頁面上
  //    Commons 那批沿用既有作法（出處彙整在 /about），只驗圖與檔案在。
  if (t.image?.src) {
    templePhotos++;
    if (!html.includes(escAttr(t.image.src))) violations.push(`${t.id} 有代表圖卻沒渲染（${t.image.src}）`);
    if (!existsSync(`${DIST}${t.image.src}`)) violations.push(`${t.id} 代表圖檔不存在：dist${t.image.src}`);
    if (/religion\.moi\.gov\.tw/.test(t.image.source ?? '')) {
      if (!html.includes(escText(t.image.author))) {
        violations.push(`${t.id} 內政部照片未標示攝影者「${t.image.author}」（著作人格權）`);
      }
      if (!html.includes(escAttr(t.image.source))) {
        violations.push(`${t.id} 內政部照片缺可點的來源連結（授權條件）：${t.image.source}`);
      }
    }
  }

  // 不變量 1h（2026-08-06 加）：內政部條目內容（建築特色／參拜流程）雙向。
  // 🔴 授權條件是「標示資料來源連結」，所以除了文字要逐字相符，
  //    **該筆的 GetUploadFile 網址必須真的出現在頁面上**（頁尾 Sources 會輸出）。
  //    缺連結不是排版問題，是違反授權——故與文字同級硬擋。
  // ⚠️ 這條原本漏了：2026-08-06 只在 check:integrity 驗了「資料層有沒有掛源」，
  //    但沒有任何檢查確認它**真的渲染出來**——那正是 iconography 變成死資料的同一個破口。
  {
    const moiBlock = html.match(/<section class="temple-moi-detail"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    const wantMoi = !!(t.architecture || t.worship_flow);
    if (wantMoi) {
      moiDetailTemples++;
      if (!moiBlock) {
        violations.push(`${t.id} 有建築特色／參拜流程資料，卻沒有渲染該區塊`);
      } else {
        for (const [field, label, idx] of [
          ['architecture', '建築特色', '3'],
          ['worship_flow', '參拜流程', '4'],
        ]) {
          if (!t[field]) continue;
          if (!moiBlock.includes(escText(t[field]))) violations.push(`${t.id} ${label}文字與資料不符`);
          const cited = (t.sources ?? []).some((s) => String(s.ref ?? '').includes(`IndexID=${idx}`));
          if (!cited) violations.push(`${t.id} ${label}在資料層就沒掛 GetUploadFile 來源（違反授權條件）`);
          else if (!html.includes(`IndexID=${idx}`)) {
            violations.push(`${t.id} ${label}的來源連結沒有渲染到頁面上（違反授權條件）`);
          }
        }
      }
    } else if (moiBlock) {
      violations.push(`${t.id} 無建築特色／參拜流程資料，卻渲染了該區塊`);
    }
  }

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
let deityWithIcon = 0;
let deityWithMoi = 0;
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

    // 不變量 4b（2026-08-06 加）：造型・法器區塊**雙向**。
    // 這條守的是一個具體病灶：`iconography` 在 schema 裡躺著、16 尊有值，
    // 卻**沒有任何一頁渲染它**＝死資料，而且沒有任何檢查會發現。
    // 有值必須渲染且逐項出現；無值必須不渲染（防模板寫死或印「待補」）。
    {
      const want = d.iconography ?? [];
      const has = html.includes('class="iconography"');
      if (want.length === 0) {
        if (has) violations.push(`神明頁 ${d.id} 不該有造型・法器區塊（資料為空）`);
      } else if (!has) {
        violations.push(`神明頁 ${d.id} 缺造型・法器區塊（資料有 ${want.length} 項）`);
      } else {
        deityWithIcon++;
        for (const x of want) {
          if (!html.includes(escText(x))) violations.push(`神明頁 ${d.id} 造型・法器未列出「${x}」`);
        }
      }
    }

    // 不變量 4d（2026-08-06 加）：神明代表圖與出處標示（規則同廟頁的 1i）。
    if (d.image?.src) {
      deityPhotos++;
      if (!html.includes(escAttr(d.image.src))) violations.push(`神明頁 ${d.id} 有代表圖卻沒渲染（${d.image.src}）`);
      if (!existsSync(`${DIST}${d.image.src}`)) violations.push(`神明頁 ${d.id} 代表圖檔不存在：dist${d.image.src}`);
      if (/religion\.moi\.gov\.tw/.test(d.image.source ?? '')) {
        if (!html.includes(escText(d.image.author))) {
          violations.push(`神明頁 ${d.id} 內政部照片未標示攝影者「${d.image.author}」（著作人格權）`);
        }
        if (!html.includes(escAttr(d.image.source))) {
          violations.push(`神明頁 ${d.id} 內政部照片缺可點的來源連結（授權條件）：${d.image.source}`);
        }
      }
    }

    // 不變量 4c（2026-08-06 加）：內政部「宗教知識+」條目引文。
    // 🔴 授權條件是「標示資料來源連結」——**沒有那個連結就等於違反授權**，
    //    所以這裡不只驗引文在不在，更要驗連結在不在。這條是法律義務，不是排版偏好。
    // 引文必須**逐字**出現（我們的規則是一個字都不改寫），故逐段比對。
    {
      const mk = d.moi_knowledge;
      const has = html.includes('class="moi-knowledge"');
      if (!mk) {
        if (has) violations.push(`神明頁 ${d.id} 不該有宗教知識+ 引文區塊（資料為空）`);
      } else if (!has) {
        violations.push(`神明頁 ${d.id} 缺宗教知識+ 引文區塊（資料有 ${mk.excerpt.length} 段）`);
      } else {
        deityWithMoi++;
        for (const p of mk.excerpt) {
          if (!html.includes(escText(p))) violations.push(`神明頁 ${d.id} 引文未逐字出現（段落開頭：${p.slice(0, 20)}…）`);
        }
        if (!html.includes(escAttr(mk.url))) {
          violations.push(`神明頁 ${d.id} 引文缺來源連結 ${mk.url}（授權條件，缺了就是違反授權）`);
        }
      }
    }

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
  // 不變量 5b（2026-07-31 加）：「當天有登記祭典的宮廟」名單。
  // 這一段是節日頁對 appi.news 等內容站的差異化資產（逐廟、掛源、可反查），
  // 故驗名單數量與資料完全相符——數字灌水或漏算都會被擋。
  // 判定規則與頁面同源：該廟 festivals[] 有一筆農曆日期與本節日 lunar_date 完全相同。
  // 同一農曆日期只有「festivals.json 先出現者」掛名單（07-15 給中元節不給搶孤、
  // 07-01 給鬼門開不給雞籠中元祭），否則兩頁會帶一模一樣的清單＝自製重複內容。
  // 非擁有者必須**沒有**名單，這裡一併驗，防未來改動讓它悄悄復活。
  const ownsList = festivals.find((x) => x.lunar_date === f.lunar_date)?.slug === f.slug;
  if (f.lunar_date && ownsList) {
    const want = temples.filter((t) =>
      (t.festivals ?? []).some((x) => x.calendar === 'lunar' && x.date === f.lunar_date),
    ).length;
    // 同上：不可假設是裸標籤（Astro 補 data-astro-cid-*），故先切出名單區間再數廟宇連結。
    const listHtml = html.match(/class="on-date-list"[\s\S]*?<\/ul>/)?.[0] ?? '';
    const shown = (listHtml.match(/href="\/temples\//g) ?? []).length;
    if (want > 0) {
      if (shown !== want) {
        violations.push(`節日頁 ${f.slug} 當日祭典宮廟名單列出 ${shown} 間，資料為 ${want} 間`);
      }
      if (!new RegExp(`全台共\\s*${want}\\s*間宮廟`).test(html)) {
        violations.push(`節日頁 ${f.slug} 名單間數敘述與資料不符（資料 ${want} 間）`);
      }
    } else if (shown > 0) {
      violations.push(`節日頁 ${f.slug} 無資料卻列出 ${shown} 間宮廟`);
    }
  } else if (html.includes('class="on-date-list"')) {
    // 非擁有者（搶孤／雞籠中元祭）或節氣型節日（清明）都不該有名單。
    violations.push(`節日頁 ${f.slug} 不該有當日祭典宮廟名單（同日名單歸屬於別頁，或此為節氣型節日）`);
  }
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

// ── 不變量 6（2026-07-31 加；⚠️ 原本誤編為「5」，與上面的節日頁不變量 5 撞號，
//    2026-08-06 稽核發現後改號。docs/decisions/almanac.md 引用的「不變量 5」指的是本條）──────────
// 背景：《協紀辨方書》卷十一用事的宜忌清單裡，有「平日 收日 閉日 亥日 丁日」這類**非神煞**條目，
//       原本的投票表只認神煞 id，這些條目完全落在判定之外——實測 2026-08-17 建除為「平」
//       （協紀明列嫁娶忌平日），本站卻列為「宜嫁娶」。修法見 src/lib/almanac/daytokens.ts。
// 這道 gate 守的是**上線後的產物**：把 /almanac/yiji/<事項>/ 列出的每個宜日，
//       翻到該日的 /almanac/<date>/ 頁去讀它自己印出的建除與日干支，兩邊對照。
// ⚠️ 禁忌清單**不在本檔硬編**，而是從 votes.json 讀 `jianchu_*`／`daybranch_*`／`daystem_*`
//    的忌票反推——日後為別的事項（如剃頭）加同類禁忌，這道檢查會自動涵蓋，不必改 gate。
let yijiPagesChecked = 0;
let yijiDaysChecked = 0;
{
  const votes = require('../src/lib/almanac/rules/votes.json').votes.filter((v) => v.shensha);
  const JC_NAME = { jian: '建', chu: '除', man: '滿', ping: '平', ding: '定', zhi: '執',
    po: '破', wei: '危', cheng: '成', shou: '收', kai: '開', bi: '閉' };
  const BR_NAME = { zi: '子', chou: '丑', yin: '寅', mao: '卯', chen: '辰', si: '巳',
    wu: '午', wei: '未', shen: '申', you: '酉', xu: '戌', hai: '亥' };
  const ST_NAME = { jia: '甲', yi: '乙', bing: '丙', ding: '丁', wu: '戊',
    ji: '己', geng: '庚', xin: '辛', ren: '壬', gui: '癸' };
  // affair → { jianchu:Set, branch:Set, stem:Set }
  const banned = new Map();
  for (const v of votes) {
    if (v.verdict !== '忌' || v.affair === '*') continue;
    const b = banned.get(v.affair) ?? { jianchu: new Set(), branch: new Set(), stem: new Set() };
    let m;
    if ((m = /^jianchu_(\w+)$/.exec(v.shensha)) && JC_NAME[m[1]]) b.jianchu.add(JC_NAME[m[1]]);
    else if ((m = /^daybranch_(\w+)$/.exec(v.shensha)) && BR_NAME[m[1]]) b.branch.add(BR_NAME[m[1]]);
    else if ((m = /^daystem_(\w+)$/.exec(v.shensha)) && ST_NAME[m[1]]) b.stem.add(ST_NAME[m[1]]);
    else continue;
    banned.set(v.affair, b);
  }
  const dayCache = new Map();
  const readDay = (iso) => {
    if (dayCache.has(iso)) return dayCache.get(iso);
    const f = join(DIST, 'almanac', iso, 'index.html');
    let r = null;
    if (existsSync(f)) {
      const h = readFileSync(f, 'utf8');
      r = {
        jianchu: /建除<\/dt><dd[^>]*>([建除滿平定執破危成收開閉])/.exec(h)?.[1] ?? null,
        // 干支列印為「丙午年 丙申月 癸亥日」，取「…日」那一柱
        ganzhi: /干支<\/dt><dd[^>]*>[^<]*?([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])日/.exec(h)?.slice(1) ?? null,
      };
    }
    dayCache.set(iso, r);
    return r;
  };
  // 檢查一個擇日露出面：把頁上列出的每個日期翻到該日農民曆頁，比對建除／日干／日支。
  // ⚠️ 合併多個用事的頁（/good-days/worship/＝祭祀＋祈福）取各用事禁忌的**聯集**——
  //    只要該日被其中任一用事明文所忌，就不該出現在這一頁上。
  const checkPage = (page, label, affairs) => {
    if (!existsSync(page)) { violations.push(`擇日檢查：找不到 ${label} 產物`); return; }
    const b = { jianchu: new Set(), branch: new Set(), stem: new Set() };
    for (const a of affairs) {
      const x = banned.get(a);
      if (!x) continue;
      for (const k of ['jianchu', 'branch', 'stem']) for (const v of x[k]) b[k].add(v);
    }
    if (!b.jianchu.size && !b.branch.size && !b.stem.size) return;
    yijiPagesChecked++;
    const html = readFileSync(page, 'utf8');
    const dates = [...new Set([...html.matchAll(/href="\/almanac\/(\d{4}-\d{2}-\d{2})\/"/g)].map((m) => m[1]))];
    for (const iso of dates) {
      const day = readDay(iso);
      if (!day) { violations.push(`擇日檢查：${label} 列出 ${iso}，但找不到該日產物`); continue; }
      yijiDaysChecked++;
      if (day.jianchu && b.jianchu.has(day.jianchu)) {
        violations.push(`擇日：${label} 列出 ${iso} 為宜，但該日建除為「${day.jianchu}」＝投票表明列所忌`);
      }
      if (day.ganzhi) {
        const [stem, branch] = day.ganzhi;
        if (b.branch.has(branch)) violations.push(`擇日：${label} 列出 ${iso} 為宜，但該日日支為「${branch}」＝投票表明列所忌`);
        if (b.stem.has(stem)) violations.push(`擇日：${label} 列出 ${iso} 為宜，但該日日干為「${stem}」＝投票表明列所忌`);
      }
    }
  };

  // ① 宜忌詞義頁（每頁一個用事）
  for (const [affair, b] of banned) {
    if (!b.jianchu.size && !b.branch.size && !b.stem.size) continue;
    checkPage(join(DIST, 'almanac', 'yiji', affair, 'index.html'), `/almanac/yiji/${affair}/`, [affair]);
  }
  // ② 擇日專區（一頁可對多個用事；slug→affairs 讀 good-days.json，不在此重寫對映）
  for (const it of require('../src/data/good-days.json').items) {
    checkPage(join(DIST, 'good-days', it.slug, 'index.html'), `/good-days/${it.slug}/`, it.affairs);
  }
}

// ── 不變量 7：地方宗教慶典（2026-08-06 加）─────────────────────────────────────
// 三層雙向比對，防的是「頁面漏列」與「憑空多出」兩種相反的錯：
//   ①《/festivals/local/》必須列出**每一項**的名稱，且項數敘述與資料相符
//   ② 廟宇頁：有 temple_ref 指向者必須渲染該區塊、沒有的必須不渲染（防模板寫死）
//   ③ 節日頁：農曆日期歸屬於本頁者必須列出同日的地方慶典、非擁有者必須沒有
//      （歸屬規則與頁面同源＝festivals.json 中同一 lunar_date 先出現者）
// ⚠️ 不驗「該有幾筆 temple_ref」——消歧是寧缺勿假，留空是正確行為（見匯入器）。
const localCel = require('../src/data/local-celebrations.json');
let lcChecked = 0;
let lcTempleSections = 0;
{
  const file = `${DIST}/festivals/local/index.html`;
  if (!existsSync(file)) {
    violations.push('地方宗教慶典頁未建置：/festivals/local/');
  } else {
    const html = readFileSync(file, 'utf8');
    if (!html.includes('class="lead"')) violations.push('/festivals/local/ 缺 answer-first 摘要');
    if (!html.includes(FAQ_MARK)) violations.push('/festivals/local/ 缺 FAQPage 結構化資料');
    for (const x of localCel.items) {
      // 依縣市與依月份兩份清單都渲染，故名稱至少出現一次即可（這裡驗的是「有沒有漏」）。
      if (!html.includes(escText(x.name))) violations.push(`/festivals/local/ 未列出「${x.name}」（${x.county}）`);
      else lcChecked++;
    }
    if (!new RegExp(`共\\s*${localCel.items.length}\\s*項`).test(html)) {
      violations.push(`/festivals/local/ 項數敘述與資料不符（資料 ${localCel.items.length} 項）`);
    }
    // 回曆筆刻意不換算：頁面不得替它印出任何國曆日期，否則就是杜撰。
    for (const x of localCel.items.filter((i) => i.calendar === 'hijri')) {
      if (!html.includes('國曆日期逐年不同，本站不換算')) {
        violations.push(`/festivals/local/ 回曆項「${x.name}」缺「不換算」說明（不得替它算國曆）`);
      }
    }
  }

  // ② 廟宇頁雙向
  const wantByTemple = new Map();
  for (const x of localCel.items) {
    if (!x.temple_ref) continue;
    if (!wantByTemple.has(x.temple_ref)) wantByTemple.set(x.temple_ref, []);
    wantByTemple.get(x.temple_ref).push(x);
  }
  for (const t of temples) {
    const f = `${DIST}/temples/${t.id}/index.html`;
    if (!existsSync(f)) continue;
    const html = readFileSync(f, 'utf8');
    const has = html.includes('class="local-celebration-list"');
    const want = wantByTemple.get(t.id) ?? [];
    if (want.length === 0) {
      if (has) violations.push(`廟頁 ${t.id} 不該有地方宗教慶典區塊（無資料指向它）`);
      continue;
    }
    if (!has) { violations.push(`廟頁 ${t.id} 缺地方宗教慶典區塊（資料有 ${want.length} 項）`); continue; }
    lcTempleSections++;
    for (const x of want) {
      if (!html.includes(escText(x.name))) violations.push(`廟頁 ${t.id} 地方宗教慶典未列出「${x.name}」`);
      const label = x.calendar === 'lunar' ? lunarDateLabel(x.date) : '';
      if (label && !html.includes(label)) violations.push(`廟頁 ${t.id} 地方宗教慶典「${x.name}」缺日期標籤「${label}」`);
    }
  }

  // ③ 節日頁雙向（歸屬＝同一 lunar_date 在 festivals.json 先出現者，與頁面同源）
  const owner = new Map();
  for (const f of festivals) if (f.lunar_date && !owner.has(f.lunar_date)) owner.set(f.lunar_date, f.slug);
  const wantByFest = new Map();
  for (const x of localCel.items) {
    if (x.calendar !== 'lunar') continue;
    const slug = owner.get(x.date);
    if (!slug) continue;
    if (!wantByFest.has(slug)) wantByFest.set(slug, []);
    wantByFest.get(slug).push(x);
  }
  for (const f of festivals) {
    const file2 = `${DIST}/festivals/${f.slug}/index.html`;
    if (!existsSync(file2)) continue;
    const html = readFileSync(file2, 'utf8');
    const has = html.includes('class="local-list"');
    const want = wantByFest.get(f.slug) ?? [];
    if (want.length === 0) {
      if (has) violations.push(`節日頁 ${f.slug} 不該有地方宗教慶典名單（同日名單歸屬於別頁或無資料）`);
      continue;
    }
    if (!has) { violations.push(`節日頁 ${f.slug} 缺地方宗教慶典名單（資料有 ${want.length} 項）`); continue; }
    for (const x of want) {
      if (!html.includes(escText(x.name))) violations.push(`節日頁 ${f.slug} 地方宗教慶典未列出「${x.name}」`);
    }
    if (!new RegExp(`共\\s*${want.length}\\s*項`).test(html)) {
      violations.push(`節日頁 ${f.slug} 地方宗教慶典項數敘述與資料不符（資料 ${want.length} 項）`);
    }
  }
}

// ── 不變量 11（2026-08-08 加）：籤詩／神明頁的專屬分享卡，與全站分享列 ────────────
//
// 🔴 為什麼要驗「檔案存在」而不只驗 meta 標籤：og:image 指到一個 404 的網址，
//    頁面不會壞、build 不會紅、瀏覽器不會抱怨——只有分享出去的人看到空白預覽，
//    而那正好是我們看不到的地方。廟宇卡（不變量 1e）就是為此驗檔案，這裡照同一條規則。
//    卡片是 postbuild 產的，所以本檢查必須跑在 postbuild 之後（CI 的 build job 順序已如此）。
//
// ⚠️ 分享列只驗「在」與「不該在的頁不在」，不驗按鈕行為——那是 JS，本 gate 讀的是靜態 HTML。
{
  const poems = normalize(require('../src/data/poems.json'));
  let poemCards = 0;
  let deityCards = 0;
  let shareRows = 0;

  for (const p of poems) {
    if (p.draft) continue;
    const file = `${DIST}/poems/${p.id}/index.html`;
    if (!existsSync(file)) { violations.push(`籤詩頁未建置：${p.id}`); continue; }
    const html = readFileSync(file, 'utf8');
    const want = `/og/poems/${p.id}.png`;
    if (!html.includes(escAttr(want))) violations.push(`籤詩頁 ${p.id} 的 og:image 不是自己的分享卡（應為 ${want}）`);
    else if (!existsSync(`${DIST}${want}`)) violations.push(`籤詩頁 ${p.id} 的分享卡檔不存在：dist${want}`);
    else poemCards++;
    if (!html.includes('aria-label="分享這一頁"')) violations.push(`籤詩頁 ${p.id} 缺分享列`);
    else shareRows++;
  }

  for (const d of deities) {
    if (d.draft) continue;
    const file = `${DIST}/deities/${d.id}/index.html`;
    if (!existsSync(file)) continue; // 未建置已由不變量 4 報過，不重複
    const html = readFileSync(file, 'utf8');
    const want = `/og/deities/${d.id}.png`;
    if (!html.includes(escAttr(want))) violations.push(`神明頁 ${d.id} 的 og:image 不是自己的分享卡（應為 ${want}）`);
    else if (!existsSync(`${DIST}${want}`)) violations.push(`神明頁 ${d.id} 的分享卡檔不存在：dist${want}`);
    else deityCards++;
    if (!html.includes('aria-label="分享這一頁"')) violations.push(`神明頁 ${d.id} 缺分享列`);
    else shareRows++;
  }

  // 分享列是全站鋪滿（Base.astro 預設開），所以廟宇頁抽不得——逐頁全驗。
  for (const t of temples) {
    const file = `${DIST}/temples/${t.id}/index.html`;
    if (!existsSync(file)) continue;
    if (!readFileSync(file, 'utf8').includes('aria-label="分享這一頁"')) {
      violations.push(`廟宇頁 ${t.id} 缺分享列`);
    } else shareRows++;
  }

  // 反向：404 明確傳 share={false}，不該有分享列。
  if (existsSync(`${DIST}/404.html`) && readFileSync(`${DIST}/404.html`, 'utf8').includes('aria-label="分享這一頁"')) {
    violations.push('404 頁不該有分享列（Base 的 share={false} 沒生效）');
  }

  // 🔴 分享列必須在 <main data-pagefind-body> **外面**：放進去的話
  //    「分享／Facebook／Threads」會被 Pagefind 索引進全站每一頁，站內搜尋打「分享」命中 15,000 頁。
  {
    const sample = `${DIST}/about/index.html`;
    if (existsSync(sample)) {
      const html = readFileSync(sample, 'utf8');
      const mainEnd = html.indexOf('</main>');
      const shareAt = html.indexOf('aria-label="分享這一頁"');
      if (shareAt >= 0 && mainEnd >= 0 && shareAt < mainEnd) {
        violations.push('分享列被放進了 <main data-pagefind-body> 內，會被站內搜尋索引進每一頁');
      }
    }
  }

  globalThis.__poemCards = poemCards;
  globalThis.__deityCards = deityCards;
  globalThis.__shareRows = shareRows;
}

// ── 不變量 10（2026-08-07 加）：/about/ 圖片來源段落的**全稱斷言**必須涵蓋清單裡的每一種授權 ──
//
// 🔴 這條擋的不是某一句話，是一整類錯誤：「頁面上的總結句，隨著資料變成複合來源而變成假的」。
//    2026-08-07 實際發生：/about/ 寫「代表圖皆取自 Wikimedia Commons」，
//    同日匯入 19 張內政部照片後，清單裡出現第二種授權——**每一張的標示各自都對，
//    錯的是那句總結**。逐張比對的檢查完全看不到這種錯，因為錯的不是任何一筆資料。
//    這也是 no-meta-disclaimers 那條紅線第四次以變體出現（前三次都在別的頁面），
//    所以這次不是改字，是把「引言必須跟著清單走」變成機器驗得出來的不變量。
//
// 判準：清單裡出現的每一種授權家族，其識別字都必須出現在該段引言裡。
// 家族由 image.source 判定（與 src/lib/image-credit.ts 的 isMoiImage 同一套判準，不另寫規則）。
{
  const file = `${DIST}/about/index.html`;
  if (!existsSync(file)) {
    violations.push('/about/ 未建置，無法驗圖片來源段落');
  } else {
    const html = readFileSync(file, 'utf8');
    // 引言＝<h2>圖片來源</h2> 之後、第一個 <h3> 之前那段。
    const sec = html.slice(html.indexOf('圖片來源'));
    const lead = sec.slice(0, sec.indexOf('<h3'));
    const FAMILIES = [
      { id: 'moi', mark: '內政部', test: (img) => /religion\.moi\.gov\.tw/.test(img.source ?? '') },
      { id: 'commons', mark: 'Wikimedia Commons', test: (img) => !/religion\.moi\.gov\.tw/.test(img.source ?? '') },
    ];
    const all = [...temples, ...deities].filter((x) => x.image?.src).map((x) => x.image);
    for (const fam of FAMILIES) {
      const n = all.filter(fam.test).length;
      if (n > 0 && !lead.includes(fam.mark)) {
        violations.push(
          `/about/ 圖片來源引言沒提到「${fam.mark}」，但清單裡有 ${n} 張是這個來源` +
          `（引言是清單的全稱斷言，漏一種就是錯的陳述）`
        );
      }
    }
    // 反向：引言不得對一個複合清單下「皆／全部取自單一來源」的斷言。
    const familiesPresent = FAMILIES.filter((f) => all.some(f.test)).length;
    if (familiesPresent > 1 && /(皆|全部|都)取自/.test(lead.replace(/<[^>]+>/g, ''))) {
      violations.push('/about/ 圖片來源引言用了「皆／全部取自」的全稱句，但清單是複合來源');
    }
  }
}

if (violations.length === 0) {
  console.log(`✓ render 不變量檢查通過：全 ${checked} 間廟頁逐一比對，${expectedCount} 間正確顯示求籤區塊、其餘正確不顯示；並確認全 ${checked} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料、且 og:image 為本廟專屬卡（檔案存在）且 og:title 不含站名；title 其中 ${titleWithDeity} 頁帶主祀神、神名皆已清洗且全形寬未超過 30；另全 ${globalThis.__nearbyChecked} 間有鄰居的廟頁皆含同鄉鎮宮廟區塊且鎮內廟數相符；全 ${townPages} 個鄉鎮頁摘要存在、其中 ${townPages - townUnmatched} 頁間數與資料逐一相符；全 ${deityChecked} 尊神明頁其中 ${deityWithShengdan} 尊聖誕（農曆標籤＋國曆往返驗證）相符、其餘正確不帶日期後綴，另 ${deityWithIcon} 尊造型・法器逐項相符、${deityWithMoi} 尊宗教知識+ 引文逐字相符且**來源連結在**（授權條件），兩者其餘皆正確不渲染；全 ${festChecked} 個節日頁含 lead／FAQPage／Event 且日期相符、當日祭典宮廟名單間數與資料相符；另全 ${festTemples} 間有年度祭典的廟頁筆數／名稱／代表祭典句逐一相符、其餘 ${checked - festTemples} 間正確不顯示該區塊；另 ${yijiPagesChecked} 個擇日頁共 ${yijiDaysChecked} 個「宜」日逐日翻查該日農民曆頁，建除／日干／日支皆非投票表明列所忌；另全 ${qifuChecked} 間廟頁皆含祈福區塊與 /qiugian/ 集氣入口，其中 ${qifuWithOffice} 間職司句與資料相符、${qifuWithScenario} 間列出情境、${qifuWithConcern} 間列出煩惱籤，情境與煩惱籤皆雙向比對（該有的都在、不該有的都不在）；另 ${qifuIntro} 間顯示觀光署簡介（文字相符且標示來源）、${qifuOpen} 間顯示開放時間，兩者皆雙向比對；另 ${moiDetailTemples} 間顯示內政部建築特色／參拜流程，文字逐字相符且**來源連結確實渲染在頁面上**（授權條件），其餘正確不渲染；另 ${templePhotos} 間廟頁與 ${deityPhotos} 尊神明頁的代表圖皆已渲染且檔案存在，其中內政部來源者**攝影者姓名與可點來源連結都在**；另地方宗教慶典 ${lcChecked}/${localCel.items.length} 項逐項在 /festivals/local/ 出現、項數敘述相符、回曆項未被擅自換算，${lcTempleSections} 間廟頁與相關節日頁的名單皆雙向比對（該有的都在、不該有的都不在）；另籤詩頁 ${globalThis.__poemCards} 張與神明頁 ${globalThis.__deityCards} 張專屬分享卡皆為該頁自己的卡且**檔案存在**，全站分享列逐頁驗過 ${globalThis.__shareRows} 頁、404 正確不帶、且確認分享列在 pagefind 索引區外。`);
  process.exit(0);
}

console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
if (missingPages) console.error(`  （其中 ${missingPages} 間廟頁未建置）`);
for (const v of violations.slice(0, 30)) console.error(`  ✗ ${v}`);
if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
process.exit(1);
