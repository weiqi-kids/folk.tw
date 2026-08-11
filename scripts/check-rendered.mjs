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
// 千分位與頁面共用同一支（src/lib/format.ts）：頁面上的「收錄 10,704 間廟宇」與這裡的
// 期望字串必須永遠一致，複製一份規則過來的話遲早會漂。本檔跑在 --experimental-strip-types
// 底下，讀得動 .ts。
import { num } from '../src/lib/format.ts';
import { commonTempleName } from '../src/lib/temple-name.ts';
import { seasonalCampaigns } from '../src/lib/seasonal-campaigns.ts';
import { FESTIVAL_OG_SLUGS } from '../src/lib/festival-og.ts';
import { excerptAtBoundary, stripOuterParens, withoutTerminalPunctuation } from '../src/lib/text.ts';
const require = createRequire(import.meta.url);

const DIST = 'dist';
// 地區解析一律用頁面同一支 lib，不在本檔重寫規則（初版自寫正則，12 處對不上）。
const { templeCounty, templeTownship } = await import('../src/lib/temple-region.ts');
// 農曆換算同理：用頁面用的同一支 lib（src/lib/lunar-date.ts 刻意零專案內 import，故本檔可直接載）。
const { lunarDateLabel, isLunarMonthEnd, lunarToNextOccurrence, festivalNextSolar } = await import('../src/lib/lunar-date.ts');
// 廟宇年度祭典的代表筆挑選與句子生成同理：頁面、OG 卡、本 gate 走同一支 lib。
const { pickMainFestival, festivalSentence } = await import('../src/lib/temple-festival.ts');
const TODAY = new Date().toISOString().slice(0, 10);
// 內文節點與屬性值的跳脫規則不同（屬性多跳脫引號），比對時要分開用，
// 否則哪天資料出現 &／"／< 就會 gate 誤報。目前資料無此字元，但別把它留成未來的陷阱。
// 🔴 escText 必須跳脫 `"`（2026-08-08 修）：Astro 在**文字節點**也把 `"` 輸出成 `&quot;`，
//    但這裡原本只跳脫 & < >，於是任何含半形雙引號的資料都會被誤判成「文字與資料不符」。
//    實例：內政部參拜流程有 3 筆的 Comment 自帶 `"`（來源的引號殘留），
//    526 筆匯入後就這 3 筆紅燈——**渲染是對的，錯的是這個檢查**。
//    ⚠️ 這不是把 escText 併成 escAttr：屬性值還要處理更多情形，兩者維持分開。
// 🔴 這裡必須**完整對齊 Astro 的 escapeHTML 集合**：`& < > " '`，一個都不能少。
//    2026-08-08 分兩次栽在同一件事上：先補了 `"`（3 筆參拜流程紅燈），
//    當時沒想到 `'`，隔一個匯入批次又被 `Dynasty's` 咬（Astro 輸出 `&#39;`）。
//    **逐字元補是錯的做法**——來源是政府資料，什麼字元都可能出現。
//    改任何一邊都要同時想另一邊：這支的職責就是「重現 Astro 會輸出什麼」。
const ASTRO_ESCAPE = [[/&/g, '&amp;'], [/</g, '&lt;'], [/>/g, '&gt;'], [/"/g, '&quot;'], [/'/g, '&#39;']];
const escText = (s) => ASTRO_ESCAPE.reduce((acc, [re, to]) => acc.replace(re, to), String(s));
const escAttr = (s) => escText(s);
const { Solar } = require('lunar-javascript');
const temples = normalize(require('../src/data/temples.json'));
const deities = normalize(require('../src/data/deities.json'));
const divinationSystems = normalize(require('../src/data/divination-systems.json'));
const festivals = normalize(require('../src/data/festivals.json'));
const imagePriority = require('../src/data/image-priority.json');
// 不變量 5d 用：判斷某套儀式的主場節日是哪一頁（practices.json 的 home_festival）。
const practices = normalize(require('../src/data/practices.json'));
// 不變量 5e 用：民俗活動的文資登錄明細該印在哪一頁（events.json 的 heritage.home_festival）。
const events = normalize(require('../src/data/events.json'));

function normalize(j) {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.temples)) return j.temples;
  if (Array.isArray(j.deities)) return j.deities;
  return Object.values(j);
}

const deityById = new Map(deities.map((d) => [d.id, d]));
const systemHrefById = new Map(
  divinationSystems.map((s) => [s.id, s.hub ?? `/systems/${s.id}/`]),
);
const systemHrefOf = (id) => systemHrefById.get(id) ?? `/systems/${id}/`;

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
const templeTitleOwners = new Map();
const templeDescOwners = new Map();

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
  if (descForPunct) {
    (templeDescOwners.get(descForPunct) ?? templeDescOwners.set(descForPunct, []).get(descForPunct)).push(t.id);
  }
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
  if (pageTitle) {
    (templeTitleOwners.get(pageTitle) ?? templeTitleOwners.set(pageTitle, []).get(pageTitle)).push(t.id);
  }
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
    // 不變量 1h（2026-08-09 加）：法人前綴不得出現在 title 開頭。
    // 背景：348 間廟的登記全名以「財團法人／社團法人」開頭，SERP 上第一眼看到的就是那四個字。
    //       GSC 7 天實測這群 CTR 1.37%、其餘 10,342 間 2.42%；而「財團法人」本身零搜尋需求
    //       （6,339 個查詢詞裡 11 個含這四字、81 曝光、0 點擊）。
    // 🔴 驗**雙向**，兩邊都是實害：
    //   ① title 不得以法人前綴開頭——退化回去就是把 CTR 賠掉，且不會有任何錯誤訊息；
    //   ② 一般稱呼必須真的出現在 title——防「剝過頭把廟名剝沒了」。
    // ⚠️ 只驗開頭。登記全名出現在 title 後段的括號裡是**刻意的**（放得下就留），不是違規。
    if (pageTitle && /^(財團法人|社團法人)/.test(pageTitle)) {
      violations.push(`${t.id} title 以法人前綴開頭（應改用一般稱呼，見 src/lib/temple-name.ts）：${pageTitle}`);
    }
    if (pageTitle && !pageTitle.includes(commonTempleName(t.name))) {
      violations.push(`${t.id} title 未含一般稱呼「${commonTempleName(t.name)}」：${pageTitle}`);
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
  // 🔴 2026-08-09 起 intro 與 history **並存**（此前互斥，理由見 src/pages/temples/[id].astro 顯示段註解）。
  //    斷言因此變成單純的雙向：有 intro 就必須顯示、沒有就不准顯示，**不再看 history**。
  //    ⚠️ 舊條件是 `!t.history`（且刻意不是 `!hasHistory`，否則有 main_festival 的廟會連 intro
  //    一起靜默消失）——那個坑在並存後自然消失，但別因此以為「顯示條件可以隨便寫」：
  //    這裡與頁面必須永遠是同一條件，兩邊任一邊改了另一邊沒改，症狀就是整段安靜不見。
  const introBlock = html.match(/<section class="temple-intro"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  const wantIntro = !!t.intro;
  if (wantIntro) {
    qifuIntro++;
    if (!introBlock) {
      violations.push(`${t.id}（有 intro）應顯示簡介區塊，實際缺少`);
    } else {
      if (!introBlock.includes(escText(t.intro))) violations.push(`${t.id} 簡介區塊文字與 temples.json 的 intro 不符`);
      // OGDL 1.0 要求標示出處：頁面須明寫引自何處（頁尾 Sources 之外再標一次給讀者看）。
      if (!introBlock.includes('觀光資訊資料庫')) violations.push(`${t.id} 簡介區塊未標示來源（應含「觀光資訊資料庫」）`);
    }
  } else if (introBlock) {
    violations.push(`${t.id}（無 intro）不應顯示簡介區塊，實際卻有`);
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
      const href = systemHrefOf(sid);
      if (!html.includes(`href="${href}"`)) {
        violations.push(`${t.id} 求籤區塊缺少連結 ${href}`);
      }
    }
  } else if (hasSection) {
    violations.push(`${t.id}（主祀 ${t.main_deity_ref ?? '無對映'} 無籤系）不應顯示求籤區塊，實際卻有`);
  }
}

// 不變量 1i（2026-08-10 加）：不同宮廟不得送出完全相同的 SERP title／description。
// 同鄉鎮、同名、同主祀的廟原本即使加了地區與主祀仍無法辨識；這批頁用既有地址的
// 最短唯一片段消歧。這裡驗最終產物，避免未來 title 候選或長度退回分支使碰撞復發。
for (const [title, ids] of templeTitleOwners) {
  if (ids.length > 1) violations.push(`宮廟 title 完全重複（${ids.join('、')}）：${title}`);
}
for (const [description, ids] of templeDescOwners) {
  if (ids.length > 1) violations.push(`宮廟 description 完全重複（${ids.join('、')}）：${description}`);
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
  if (!new RegExp(`收錄\\s*${num(count)}\\s*間廟宇`).test(html)) {
    violations.push(`鄉鎮頁 ${key} 摘要間數與資料不符（資料 ${count} 間）`);
  }
}

// ── 不變量 4：神明頁 title 的聖誕日期（2026-07-30 加；本檔首次涵蓋 deity 頁）──────────
// 背景：GSC 實測神明頁 CTR 僅 1.13%，主流意圖是「○○生日／聖誕」＝一個日期就滿足，
//       但 title 原本只有農曆、且用阿拉伯數字（農曆3月23日），從未命中查詢用的「農曆三月廿三」形式，
//       也沒有使用者真正要的國曆。2026-08-09 再把 cohort 改為
//       「媽祖生日｜聖誕農曆三月廿三（國曆 4/29）」：同時命中「生日／聖誕」，且拿掉首別名控制長度。
//       這裡逐尊全驗關鍵詞、長度與日期同筆。
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
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    // 連續右括號可能是合法巢狀括號（如「出典（原典（補註））」）；只擋雙開括號。
    if (/（（|，，|。。/.test(description)) {
      violations.push(`神明頁 ${d.id} description 含重複括號或標點：${description}`);
    }
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
      if (/｜聖誕/.test(title)) violations.push(`${d.id} 無聖誕資料，title 卻出現「｜聖誕」：${title}`);
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
    if (!title.startsWith(`${d.name}生日｜聖誕`)) {
      violations.push(`${d.id} title 未以「${d.name}生日｜聖誕」自然涵蓋兩種查詢用語：${title}`);
      continue;
    }
    // 日期是這個 cohort 的核心答案，故標題不帶別名，並限制品牌前內容不超過 30 全形字。
    // 英數各算半形；站名由 Base 統一附加，不列入 cohort 的內容預算。
    const seoTitle = title.replace(/｜神酷$/, '');
    const titleWide = [...seoTitle].reduce((n, c) => (/[^\x00-\xff]/.test(c) ? n + 1 : n + 0.5), 0);
    if (titleWide > 30) {
      violations.push(`${d.id} 生日 title 超過 30 全形字（${titleWide}）：${title}`);
    }
    const alias = (d.aliases ?? [])[0];
    if (alias && alias !== d.name && seoTitle.includes(`（${alias}）`)) {
      violations.push(`${d.id} 生日 title 不應塞入首別名「${alias}」（會擠掉日期）：${title}`);
    }
    const shown = title.match(/｜聖誕(農曆[^（|]+)/);
    if (!shown) { violations.push(`${d.id} title 缺「｜聖誕農曆…」（實際：${title}）`); continue; }
    const shownLabel = shown[1].trim();
    const md = title.match(/（國曆\s*(\d{1,2})\/(\d{1,2})）/);
    if (!md) { violations.push(`${d.id} title 缺國曆日期「（國曆 M/D）」：${title}`); continue; }
    const mo = Number(md[1]);
    const day = Number(md[2]);
    // 以頁面同一支 occurrence 同時驗農曆標籤與國曆 M/D。
    // 原始登錄 07-30 遇短月時，正確組合是「農曆七月廿九／國曆 9/10」；
    // 不能僅允許 29 日順延，卻繼續把標籤驗成資料的 30 日。
    const pairMatches = shengdanDates.some((dt) =>
      [nowYear, nowYear + 1, nowYear + 2].some((y) => {
        const occurrence = lunarToNextOccurrence(dt, `${y}-01-01`);
        return occurrence?.label === shownLabel
          && Number(occurrence.iso.slice(5, 7)) === mo
          && Number(occurrence.iso.slice(8, 10)) === day;
      }),
    );
    if (!pairMatches) {
      violations.push(
        `${d.id} title 的聖誕組合「${shownLabel}／國曆 ${mo}/${day}」不對應任何一筆資料（資料：${shengdanDates.map((x) => lunarDateLabel(x)).join('、')}）`,
      );
    }
  }
}

// ── 不變量 5：節日頁（2026-07-30 加）─────────────────────────────────────────
// 每個 festivals.json 條目都必須有頁、有 answer-first .lead、有 FAQPage 與 Article 結構化資料，
// 且 title 上的國曆 M/D 同樣做農曆往返驗證（防日期算錯或模板寫死）。
let festChecked = 0;
for (const f of festivals) {
  const file = `${DIST}/festivals/${f.slug}/index.html`;
  if (!existsSync(file)) { violations.push(`節日頁未建置：${f.slug}`); continue; }
  const html = readFileSync(file, 'utf8');
  festChecked++;
  const festivalDescription = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (!/[。！？…]$/.test(festivalDescription)) {
    violations.push(`節日頁 ${f.slug} description 不是完整句或安全刪節：${festivalDescription}`);
  }
  if (/（（|，，|。。/.test(festivalDescription)) {
    violations.push(`節日頁 ${f.slug} description 含重複括號或標點：${festivalDescription}`);
  }
  if (!html.includes('class="lead"')) violations.push(`節日頁 ${f.slug} 缺 answer-first 摘要（class="lead"）`);
  if (!html.includes(FAQ_MARK)) violations.push(`節日頁 ${f.slug} 缺 FAQPage 結構化資料`);
  if (!html.includes('"@type":"Article"')) violations.push(`節日頁 ${f.slug} 缺 Article 結構化資料`);
  // 節日知識頁不是本站主辦的線下活動。反向擋住 Event，避免連帶宣稱
  // EventScheduled、OfflineEventAttendanceMode 與 folk.tw organizer。
  if (html.includes('"@type":"Event"')) violations.push(`節日頁 ${f.slug} 不得宣稱 Event 結構化資料`);
  // 不變量 5d（2026-08-09 加）：一套儀式的完整內容**只准出現在主場節日頁**。
  // 背景：`pudu` 被 7 個節日頁指到，此前每頁都整組渲染它的步驟／供品／金紙／禁忌／地區差異，
  //       造成站內自我重複（實測與中元節頁的 8 字片段重疊：搶孤 84.4%、雞籠中元祭 71.6%），
  //       而重疊最高的兩頁正是 Google 不收錄的那兩頁。
  // 🔴 驗**雙向**，兩邊都是實害：主場頁少了＝把能排名的內容弄丟；非主場頁多了＝重複又回來。
  //    而且兩種都不會有錯誤訊息，只會在幾週後從 GSC 看出來。
  const mainPracticeId = (f.practice_refs ?? [])[0];
  const mainPracticeData = mainPracticeId ? practices.find((p) => p.id === mainPracticeId) : null;
  if (mainPracticeData?.home_festival && (mainPracticeData.steps ?? []).length > 0) {
    const hasSteps = html.includes('<ol class="steps"');
    const isHome = f.slug === mainPracticeData.home_festival;
    if (isHome && !hasSteps) {
      violations.push(`節日頁 ${f.slug} 是 ${mainPracticeId} 的主場，卻沒渲染完整步驟`);
    }
    if (!isHome && hasSteps) {
      violations.push(`節日頁 ${f.slug} 不是 ${mainPracticeId} 的主場，卻渲染了完整步驟（站內重複內容）`);
    }
    // 非主場頁必須留下往正主頁的指路，否則讀者與爬蟲都走不過去。
    if (!isHome && !html.includes(`/practices/${mainPracticeId}/`)) {
      violations.push(`節日頁 ${f.slug} 未指向 /practices/${mainPracticeId}/`);
    }
  }
  // 不變量 5e（2026-08-09 加）：民俗活動的**文資登錄明細**同樣只准出現在主場節日頁。
  // 這一條是 5d 當天的**續發事故**：補「文化資產登錄」區塊時忘了套同一條規則，
  // 於是 `jilong` 的登錄明細同時印在中元節頁與雞籠中元祭頁上，
  // guimenkai 的重疊率當場從 46.8% 反升到 61.6%——**補內容也會製造重複**，不是只有共用欄位會。
  // 判定用「公告文號」而非區塊 class：文號是那一筆登錄獨有的字串，抄到別頁就會被抓到。
  for (const eid of f.event_refs ?? []) {
    const ev = events.find((e) => e.id === eid);
    const home = ev?.heritage?.home_festival;
    if (!home || !ev?.heritage?.announcements?.length) continue;
    const doc = ev.heritage.announcements[0].doc;
    const printed = html.includes(doc);
    if (home === f.slug && !printed) {
      violations.push(`節日頁 ${f.slug} 是 ${eid} 的登錄主場，卻沒印出公告文號 ${doc}`);
    }
    if (home !== f.slug && printed) {
      violations.push(`節日頁 ${f.slug} 不是 ${eid} 的登錄主場，卻印出了它的公告文號 ${doc}（站內重複內容）`);
    }
    // 不變量 5f（2026-08-09 加）：文資網逐字內容與**來源連結**必須同時在頁面上。
    // 🔴 這是**授權條件**，不是排版偏好：2026-08-09 取得文化部授權，條件＝標示資料來源連結。
    //    與內政部那批（不變量：建築特色／參拜流程「來源連結確實渲染在頁面上」）同一個規格——
    //    少了連結就是違反授權，而那是不會有任何錯誤訊息的違反。
    if (home !== f.slug) continue;
    const h = ev.heritage;
    const caseUrl = h.case_id ? `https://nchdb.boch.gov.tw/assets/overview/folklore/${h.case_id}` : null;
    for (const [field, label] of [['register_reason', '登錄理由'], ['history', '歷史沿革']]) {
      const text = h[field];
      if (!text) continue;
      // 取一段夠長、且不含會被 HTML 轉義字元的片段比對（逐字未改寫的證據）。
      const probe = text.split('\n')[0].slice(0, 24);
      if (probe && !html.includes(escText(probe))) {
        violations.push(`節日頁 ${f.slug} 的 ${eid} ${label}未逐字渲染（找不到「${probe}」）`);
      }
    }
    if ((h.register_reason || h.history || (h.notices ?? []).length) && caseUrl && !html.includes(caseUrl)) {
      violations.push(`節日頁 ${f.slug} 引用了 ${eid} 的文資網逐字內容，卻沒有渲染來源連結（違反授權條件）`);
    }
  }
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
    // ⚠️ 2026-08-08 改切「整個 <section class="on-date">」而不是「第一個 <ul>」：
    //    該區塊已改成「前 60 間直接列、其餘收進 <details>」（中元節那頁的清單原本佔掉整頁一半），
    //    名單因此是兩個 <ul>。不變量本身沒有放寬——仍然要求**全部**登記在案的宮廟都出現在
    //    這一頁的 HTML 裡（收合的部分也在 HTML 裡，爬蟲讀得到、內鏈一條都沒少），
    //    只是計數範圍從單一 <ul> 擴成整個區塊，比原本更不容易被 markup 調整騙過去。
    const sectionStart = html.indexOf('class="on-date"');
    const sectionHtml =
      sectionStart >= 0 ? html.slice(sectionStart, html.indexOf('</section>', sectionStart)) : '';
    const shown = (sectionHtml.match(/href="\/temples\//g) ?? []).length;
    if (want > 0) {
      if (shown !== want) {
        violations.push(`節日頁 ${f.slug} 當日祭典宮廟名單列出 ${shown} 間，資料為 ${want} 間`);
      }
      if (!new RegExp(`全台共\\s*${num(want)}\\s*間宮廟`).test(html)) {
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
  const campaignTitleProbe = {
    zhongyuan: '普渡供品、金紙與祭拜順序',
    qixi: '七娘媽生、做十六歲與祭拜',
    fangshuideng: '由來、對象與基隆中元祭',
    'jilong-zhongyuan': '開龕門、放水燈與字姓輪值',
    qianggu: '頭城、恆春日期與文化資產',
    zhongqiu: '拜月娘、土地公供品與四天連假',
    'kongzi-birthday': '孔子誕辰與祭孔釋奠典禮',
    'september-solar-terms': '9/7、9/23 節氣與農漁產',
    'kinmen-bo-bing': '六顆骰子規則與活動日期',
  }[f.slug];
  if (campaignTitleProbe && !title.includes(campaignTitleProbe)) {
    violations.push(`節日頁 ${f.slug} title 未呈現本頁獨有的搜尋意圖：${title}`);
  }
  const festivalOgSlugs = new Set(FESTIVAL_OG_SLUGS);
  if (festivalOgSlugs.has(f.slug)) {
    const wantOg = `/og/festivals/${f.slug}.png`;
    if (!html.includes(escAttr(wantOg))) {
      violations.push(`節日頁 ${f.slug} 的 og:image 不是自己的分享卡（應為 ${wantOg}）`);
    } else if (!existsSync(`${DIST}${wantOg}`)) {
      violations.push(`節日頁 ${f.slug} 的分享卡檔不存在：dist${wantOg}`);
    }
    if (!html.includes('aria-label="分享這一頁"') || !html.includes('data-pagefind-ignore')) {
      violations.push(`節日頁 ${f.slug} 的頁首分享列缺少或會被 Pagefind 索引`);
    }
    const visual = html.match(/<figure class="festival-visual"[^>]*>[\s\S]*?<\/figure>/)?.[0] ?? '';
    if (!visual.includes(`src="${escAttr(wantOg)}"`)) {
      violations.push(`節日頁 ${f.slug} 未在正文顯示自己的分享卡（應為 ${wantOg}）`);
    }
    if (!visual.includes('width="1200"') || !visual.includes('height="630"')) {
      violations.push(`節日頁 ${f.slug} 的正文分享卡缺少 1200×630 固定尺寸`);
    }
  } else if (html.includes('class="festival-visual"')) {
    violations.push(`節日頁 ${f.slug} 沒有專屬分享卡卻顯示節令主視覺`);
  }
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
  if (md && f.solar_date && `${String(md[1]).padStart(2, '0')}-${String(md[2]).padStart(2, '0')}` !== f.solar_date) {
    violations.push(`節日頁 ${f.slug} title 國曆 ${md[1]}/${md[2]} 不等於固定日期 ${f.solar_date}`);
  }
  if (f.slug === 'zhongqiu') {
    if (!html.includes('中秋拜拜準備清單') || !html.includes('zhongqiu_worship_checklist')) {
      violations.push('中秋節頁缺少可操作的掛源準備清單');
    }
    if (!html.includes('中秋節與教師節共四天連假') || !html.includes('/festivals/kongzi-birthday/')) {
      violations.push('中秋節頁缺少四天連假模組或祭孔頁連結');
    }
  }
  if (f.slug === 'kongzi-birthday' &&
      (!html.includes('中秋節與教師節共四天連假') || !html.includes('/festivals/zhongqiu/'))) {
    violations.push('祭孔頁缺少四天連假模組或中秋頁連結');
  }
}

// 不變量 5g（2026-08-09 加）：首頁農曆七月戰役卡只能同時推一頁。
// 建置當日的主題要正確，前端排程也必須含後續所有切換項。
{
  const home = readFileSync(`${DIST}/index.html`, 'utf8');
  const taipeiToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const schedule = seasonalCampaigns;
  const campaignEnd = schedule.at(-1)?.end ?? '';
  const current = schedule.find(({ start, end }) => start <= taipeiToday && taipeiToday <= end);
  if (current) {
    if (!home.includes('data-seasonal-campaign')) violations.push('首頁在戰役期間缺少節日主卡');
    if (!home.includes(`href="${current.href}"`)) violations.push(`首頁節日主卡未指向當日主題 ${current.href}`);
    if (!home.includes('data-campaign-image') || !home.includes('width="1200"') || !home.includes('height="630"')) {
      violations.push('首頁節日主卡缺少 1200×630 主視覺');
    }
    for (const campaign of schedule) {
      if (!home.includes(campaign.href)) violations.push(`首頁節日主卡的前端排程缺少 ${campaign.href}`);
      if (!home.includes(campaign.image)) {
        violations.push(`首頁節日主卡的前端排程缺少 ${campaign.festivalSlug} 主視覺`);
      }
    }
  } else if (campaignEnd && taipeiToday > campaignEnd && home.includes('data-seasonal-campaign')) {
    violations.push(`首頁節日主卡應於 ${campaignEnd} 後自然退場`);
  }
}

// 不變量 5h（2026-08-09 加）：節日總覽必須讓所有有分享卡的主題直接露出各自主視覺。
{
  const html = readFileSync(`${DIST}/festivals/index.html`, 'utf8');
  for (const slug of FESTIVAL_OG_SLUGS) {
    const image = `/og/festivals/${slug}.png`;
    if (!html.includes(`src="${escAttr(image)}"`)) {
      violations.push(`節日總覽缺少 ${slug} 主視覺`);
    }
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

// ── 不變量 12（2026-08-08 加）：生肖頁「太歲殿」區塊的**措辭界線** ──────────────
//
// 🔴 這條守的是一句話，而那句話是整段的存在前提：
//    資料說的是「這間廟登記資料裡提到太歲殿／太歲星君」，
//    **不是**「這間廟提供安太歲服務」。少了那句 caveat，整段就變成替廟方宣稱他們有在辦。
//    原訂計畫是等參拜流程到齊後抽「安太歲」關鍵字——到齊後實測 0 筆，假設是錯的，
//    才退到這個較弱但有源的事實（見 src/lib/zodiac.ts 的 taisuiShrineTemples 檔頭）。
// ⚠️ 同時雙向驗名單：該出現的廟都在、不該出現的（已列在上面那批「祭典登記有安太歲」的）不重複。
{
  const CAVEAT = '不代表該廟目前有提供安太歲服務';
  const SHRINE_RE = /太歲殿|太歲星君|太歲君|太歲廳/;
  const ANTAISUI_RE = /安太歲|安奉[^，。、]{0,6}太歲/;
  const shrineIds = temples
    .filter((t) => SHRINE_RE.test(`${t.history ?? ''}${t.architecture ?? ''}${t.worship_flow ?? ''}${t.intro ?? ''}`))
    .map((t) => t.id);
  const festIds = new Set(
    temples.filter((t) => (t.festivals ?? []).some(
      (f) => ANTAISUI_RE.test(String(f?.name ?? '')) || ANTAISUI_RE.test(String(f?.desc ?? '')),
    )).map((t) => t.id),
  );
  const want = shrineIds.filter((id) => !festIds.has(id));
  const wantSet = new Set(want);
  let zodiacWithShrine = 0;

  for (const dir of existsSync(`${DIST}/zodiac`) ? readdirSync(`${DIST}/zodiac`) : []) {
    const file = `${DIST}/zodiac/${dir}/index.html`;
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const hasBlock = html.includes('登記資料提到太歲殿或太歲星君的宮廟');
    if (!hasBlock) continue;
    zodiacWithShrine++;
    if (!html.includes(CAVEAT)) {
      violations.push(`生肖頁 ${dir} 有太歲殿名單卻缺措辭界線那句「${CAVEAT}」（等於替廟方宣稱有在辦）`);
    }
    // 雙向：該在的都在
    const missing = want.filter((id) => !html.includes(escAttr(`/temples/${id}/`)));
    if (missing.length) {
      violations.push(`生肖頁 ${dir} 太歲殿名單少了 ${missing.length} 間（如 ${missing[0]}）`);
    }
    // 不該在的：已列在「祭典登記有安太歲」那批的不得在本段重複出現
    const shrineBlock = html.slice(html.indexOf('登記資料提到太歲殿或太歲星君的宮廟'));
    const dup = [...festIds].filter((id) => shrineBlock.includes(escAttr(`/temples/${id}/`)));
    if (dup.length) {
      violations.push(`生肖頁 ${dir} 太歲殿名單重複列出了已在「祭典登記有安太歲」那批的 ${dup.length} 間`);
    }
    if (!new RegExp(`另有\\s*${num(want.length)}\\s*間宮廟`).test(html)) {
      violations.push(`生肖頁 ${dir} 太歲殿間數敘述與資料不符（資料 ${want.length} 間）`);
    }
  }
  globalThis.__zodiacShrine = zodiacWithShrine;
  globalThis.__zodiacShrineN = want.length;
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
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    if (/（（|，，|。。/.test(description)) {
      violations.push(`籤詩頁 ${p.id} description 含重複括號或標點：${description}`);
    }
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
    // ⚠️ 2026-08-08：定位改成錨在 **<h2> 標題本身**，不再用 indexOf('圖片來源') 抓第一個字面。
    //    /about/ 加了目錄之後，「圖片來源」四個字最先出現在目錄的 <a> 裡，
    //    切出來的 lead 變成目錄到「責任限制」那個 <h3> 之間的東西，引言根本不在裡面
    //    → gate 直接誤報。判準一點都沒放寬，只是把錨點釘準。
    const h2 = html.match(/<h2[^>]*>圖片來源<\/h2>/);
    if (!h2) {
      violations.push('/about/ 找不到「圖片來源」的 <h2>，無法驗引言（版面被改動？）');
    }
    const sec = h2 ? html.slice(html.indexOf(h2[0]) + h2[0].length) : '';
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

// ── 不變量 13（2026-08-08 加）：「附近的廟」的頁面骨架與格網索引 ──────────────────
//
// 🔴 這條擋的是一整類「不會有紅燈的壞掉」：格檔沒產出、產錯格、欄位順序被改、
//    或有人把結果槽刪了——症狀全都是「按下去查不到廟」，build 照樣全綠、頁面照樣渲染，
//    只有真的拿手機站在廟前面的人才會發現。所以這裡驗到底，不抽樣。
//
// 三件事：
//   ① 頁面骨架：定位鈕、結果清單、以及**預先渲染好的結果槽**必須都在。
//      槽是這個功能的房規（不注入 DOM，見該頁檔頭），槽沒了 JS 就沒有地方寫。
//   ② 格檔 ↔ 資料**雙向**逐筆相符：每一間有座標的廟都在它該在的那一格、欄位逐項相符；
//      且 dist 裡不存在多出來的格檔。
//   ③ 無座標的廟一間都不能出現在任何格檔（寧可查不到，也不能把人導到假座標）。
//      切格與欄位規則一律 import 頁面用的那支 lib，本檔不重寫（重寫＝新的漂移源）。
{
  const { buildCells, cellKey } = await import('../src/lib/nearby-grid.ts');
  const page = `${DIST}/temples/nearby/index.html`;
  if (!existsSync(page)) {
    violations.push('/temples/nearby/ 未建置');
  } else {
    const html = readFileSync(page, 'utf8');
    if (!html.includes('id="nb-go"')) violations.push('/temples/nearby/ 缺定位按鈕（id="nb-go"）');
    if (!html.includes('id="nb-list"')) violations.push('/temples/nearby/ 缺結果清單（id="nb-list"）');
    const slots = (html.match(/class="nb-item"/g) ?? []).length;
    if (slots === 0) {
      violations.push('/temples/nearby/ 沒有任何預先渲染的結果槽（class="nb-item"）＝JS 無處可寫');
    }
    globalThis.__nbSlots = slots;
    // 靜態退路：不給位置／無 JS 的人要有東西可用，同時這也是這頁對爬蟲的實際內容。
    if (!html.includes('class="county-wall"')) {
      violations.push('/temples/nearby/ 缺縣市清單（無 JS／不給權限時的唯一退路）');
    }
  }

  const expected = buildCells(temples);
  const cellDir = join(DIST, 'temples', 'nearby', 'cells');
  let nbRows = 0;
  for (const [key, rows] of expected) {
    const file = join(cellDir, `${key}.json`);
    if (!existsSync(file)) {
      violations.push(`附近的廟：格檔缺少 ${key}.json（資料有 ${rows.length} 間廟落在這格）`);
      continue;
    }
    let actual;
    try {
      actual = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      violations.push(`附近的廟：格檔 ${key}.json 不是合法 JSON`);
      continue;
    }
    if (JSON.stringify(actual) !== JSON.stringify(rows)) {
      violations.push(
        `附近的廟：格檔 ${key}.json 與資料不符（檔內 ${Array.isArray(actual) ? actual.length : '?'} 筆、` +
        `資料 ${rows.length} 筆；欄位順序或內容被改動？）`
      );
      continue;
    }
    // 每一筆都真的屬於這一格（防「格檔內容對、但整格算在錯的位置」）。
    for (const r of rows) {
      if (cellKey(r[2], r[3]) !== key) {
        violations.push(`附近的廟：${r[0]} 被放進 ${key}.json，但其座標應落在 ${cellKey(r[2], r[3])}`);
      }
    }
    nbRows += rows.length;
  }
  globalThis.__nbCells = expected.size;
  globalThis.__nbRows = nbRows;

  if (existsSync(cellDir)) {
    const extra = readdirSync(cellDir)
      .filter((n) => n.endsWith('.json'))
      .filter((n) => !expected.has(n.replace(/\.json$/, '')));
    for (const n of extra.slice(0, 5)) violations.push(`附近的廟：dist 有多餘的格檔 ${n}（資料裡沒有這一格）`);
    if (extra.length > 5) violations.push(`附近的廟：另有 ${extra.length - 5} 個多餘格檔`);
    // 無座標的廟不得出現在任何格檔。
    const noCoord = new Set(temples.filter((t) => typeof t.lat !== 'number' || typeof t.lng !== 'number').map((t) => t.id));
    if (noCoord.size) {
      const inCells = new Set([...expected.values()].flat().map((r) => r[0]));
      for (const id of noCoord) {
        if (inCells.has(id)) violations.push(`附近的廟：${id} 無座標卻出現在格檔裡`);
      }
    }
  } else if (expected.size) {
    violations.push('附近的廟：dist 完全沒有格檔目錄（/temples/nearby/cells/）');
  }
}

// 不變量 18（2026-08-10 加）：籤系 hub 連結與 Pagefind 屬性。
// 自有樞紐（目前藥籤＝/medicine-slips/）不會生成 /systems/<id>/ 頁；任何輸出仍指向後者
// 都是使用者可點到的 404。全站逐檔掃描，避免只修廟頁、卻從生日／行業／情境等入口復發。
// Pagefind 對 data-pagefind-ignore 的判定是「屬性存在即忽略」，字串 "false" 也一樣；
// 因此除了全面禁止 false，另確認 /almanac/ 的正文容器完全不帶此屬性。
{
  const renderedFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html') || entry.name === 'llms-full.txt') renderedFiles.push(path);
    }
  };
  walk(DIST);

  const hubSystems = divinationSystems.filter((s) => s.hub);
  for (const file of renderedFiles) {
    const output = readFileSync(file, 'utf8');
    const route = file.slice(DIST.length) || '/';
    for (const system of hubSystems) {
      const deadPath = `/systems/${system.id}/`;
      if (output.includes(deadPath)) {
        violations.push(`籤系 hub：${route} 仍輸出不存在的 ${deadPath}（應為 ${system.hub}）`);
      }
    }
    if (/data-pagefind-ignore=(?:"false"|'false')/.test(output)) {
      violations.push(`Pagefind：${route} 輸出 data-pagefind-ignore="false"，仍會被視為忽略`);
    }
  }

  const almanacHubFile = join(DIST, 'almanac', 'index.html');
  if (existsSync(almanacHubFile)) {
    const html = readFileSync(almanacHubFile, 'utf8');
    const dayTag = html.match(/<div\b[^>]*class="[^"]*\balmanac-day\b[^"]*"[^>]*>/)?.[0] ?? '';
    if (!dayTag) violations.push('Pagefind：/almanac/ 找不到 .almanac-day 正文容器');
    else if (dayTag.includes('data-pagefind-ignore')) {
      violations.push('Pagefind：/almanac/ 的 .almanac-day 正文容器不應被排除索引');
    }
  } else {
    violations.push('Pagefind：/almanac/ 未建置，無法驗證正文索引屬性');
  }
  globalThis.__systemHubFiles = renderedFiles.length;
}

// 文字工具本身也是渲染規則的一部分；用已知事故樣本鎖住三個退路。
if (excerptAtBoundary('整個七月結束後才把門口掛燈燒去。下一句。', 6) !== '整個七月結…') {
  violations.push('文字摘要工具未在無句界時使用安全刪節號');
}
if (stripOuterParens('（梨園祖師）') !== '梨園祖師') {
  violations.push('文字摘要工具未移除欄位最外層括號');
}
if (withoutTerminalPunctuation('典故說明。') !== '典故說明') {
  violations.push('文字摘要工具未移除既有句末標點');
}

// 不變量 19（2026-08-09 加）：正文圖片覆蓋。
// 使用者要求所有非黃曆／宮廟正式頁都必須有圖；黃曆與宮廟的覆蓋範圍
// 由 image-priority.json 控制。只認 body 實際 <img>，不把 meta og:image 算進來。
{
  const indexFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'index.html') indexFiles.push(path);
    }
  };
  walk(DIST);
  let requiredGeneral = 0;
  for (const file of indexFiles) {
    const route = file.slice(DIST.length).replace(/\/index\.html$/, '/') || '/';
    if (route.startsWith('/almanac/') || route.startsWith('/temples/')) continue;
    const html = readFileSync(file, 'utf8');
    // astro.config 的 mergedInto 舊 slug 是只有跳轉標記的相容網址，沒有正文，也不是內容頁。
    if (!/<html\b/i.test(html)) continue;
    requiredGeneral += 1;
    if (!/<img\b/i.test(html)) violations.push(`正文圖片：${route} 沒有 <img>`);
  }

  const todayTaipei = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const almanacHub = join(DIST, 'almanac', 'index.html');
  const almanacHubHtml = existsSync(almanacHub) ? readFileSync(almanacHub, 'utf8') : '';
  if (!almanacHubHtml) violations.push('首屏版面：今日黃曆入口 /almanac/ 未建置');
  // 黃曆是高密度工具頁，首屏必須先看到日期導覽與今日資訊。曾因全站圖片覆蓋 gate
  // 把 1200×630 裝飾圖塞在 AlmanacDay 前面，桌機 1000px 高仍只看到圖與標題。
  if (almanacHubHtml.includes('class="almanac-visual"')) {
    violations.push('首屏版面：/almanac/ 不得用大型裝飾圖把日期資訊推到折線下');
  }
  let date = todayTaipei;
  let requiredAlmanac = 0;
  while (requiredAlmanac < imagePriority.almanac_rolling_days) {
    const dated = join(DIST, 'almanac', date, 'index.html');
    const file = existsSync(dated) ? dated : date === todayTaipei ? join(DIST, 'almanac', 'index.html') : dated;
    requiredAlmanac += 1;
    if (!existsSync(file)) violations.push(`正文圖片：黃曆 ${date} 未建置`);
    else if (!/<img\b/i.test(readFileSync(file, 'utf8'))) violations.push(`正文圖片：黃曆 ${date} 沒有 <img>`);
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
  }

  const qiugianHub = join(DIST, 'qiugian', 'index.html');
  const qiugianHubHtml = existsSync(qiugianHub) ? readFileSync(qiugianHub, 'utf8') : '';
  if (!qiugianHubHtml) violations.push('首屏版面：求籤入口 /qiugian/ 未建置');
  else if (!/class="lead-visual compact"/.test(qiugianHubHtml)) {
    violations.push('首屏版面：/qiugian/ 主視覺必須維持 compact，不得把求籤選項推離首屏');
  }

  // 中元普渡清單是依 pudu 的掛源 offerings／joss_paper 欄位產生；
  // 雙向驗證可防清單與頁面資料漂移，也鎖住複製、分享與 attribution 埋點。
  const zhongyuanFile = join(DIST, 'festivals', 'zhongyuan', 'index.html');
  const zhongyuanHtml = existsSync(zhongyuanFile) ? readFileSync(zhongyuanFile, 'utf8') : '';
  const pudu = practices.find((practice) => practice.id === 'pudu');
  if (!zhongyuanHtml) violations.push('中元普渡清單：/festivals/zhongyuan/ 未建置');
  else {
    for (const mark of [
      'data-pudu-checklist', 'data-checklist-copy', 'data-checklist-share',
      'checklist_copy', 'checklist_share', 'utm_campaign', 'zhongyuan_pudu_checklist',
    ]) {
      if (!zhongyuanHtml.includes(mark)) violations.push(`中元普渡清單：渲染產物缺少 ${mark}`);
    }
    for (const item of [...(pudu?.offerings ?? []), ...(pudu?.joss_paper ?? [])]) {
      if (!zhongyuanHtml.includes(escText(item))) violations.push(`中元普渡清單：缺少掛源項目「${item}」`);
    }
    const canonical = zhongyuanHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
    if (canonical !== 'https://folk.tw/festivals/zhongyuan/') {
      violations.push(`中元普渡清單：canonical 被 attribution 汙染（${canonical || '缺少'}）`);
    }
  }

  let requiredTemples = 0;
  for (const row of imagePriority.top_temples) {
    const file = join(DIST, 'temples', row.id, 'index.html');
    requiredTemples += 1;
    if (!existsSync(file)) violations.push(`正文圖片：流量優先宮廟 ${row.id} 未建置`);
    else if (!/<img\b/i.test(readFileSync(file, 'utf8'))) violations.push(`正文圖片：流量優先宮廟 ${row.id} 沒有 <img>`);
  }
  globalThis.__imageCoverage = { requiredGeneral, requiredAlmanac, requiredTemples };
}

if (violations.length === 0) {
  console.log(`✓ render 不變量檢查通過：全 ${checked} 間廟頁逐一比對，${expectedCount} 間正確顯示求籤區塊、其餘正確不顯示；並確認全 ${checked} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料、且 og:image 為本廟專屬卡（檔案存在）且 og:title 不含站名；title 其中 ${titleWithDeity} 頁帶主祀神、神名皆已清洗且全形寬未超過 30；另全 ${globalThis.__nearbyChecked} 間有鄰居的廟頁皆含同鄉鎮宮廟區塊且鎮內廟數相符；全 ${townPages} 個鄉鎮頁摘要存在、其中 ${townPages - townUnmatched} 頁間數與資料逐一相符；全 ${deityChecked} 尊神明頁其中 ${deityWithShengdan} 尊生日 title 同時含「生日／聖誕」、全形寬未超過 30，且農曆標籤／國曆往返驗證相符，其餘正確不帶日期後綴，另 ${deityWithIcon} 尊造型・法器逐項相符、${deityWithMoi} 尊宗教知識+ 引文逐字相符且**來源連結在**（授權條件），兩者其餘皆正確不渲染；全 ${festChecked} 個節日頁含 lead／FAQPage／Event 且日期相符、當日祭典宮廟名單間數與資料相符；另全 ${festTemples} 間有年度祭典的廟頁筆數／名稱／代表祭典句逐一相符、其餘 ${checked - festTemples} 間正確不顯示該區塊；另 ${yijiPagesChecked} 個擇日頁共 ${yijiDaysChecked} 個「宜」日逐日翻查該日農民曆頁，建除／日干／日支皆非投票表明列所忌；另全 ${qifuChecked} 間廟頁皆含祈福區塊與 /qiugian/ 集氣入口，其中 ${qifuWithOffice} 間職司句與資料相符、${qifuWithScenario} 間列出情境、${qifuWithConcern} 間列出煩惱籤，情境與煩惱籤皆雙向比對（該有的都在、不該有的都不在）；另 ${qifuIntro} 間顯示觀光署簡介（文字相符且標示來源）、${qifuOpen} 間顯示開放時間，兩者皆雙向比對；另 ${moiDetailTemples} 間顯示內政部建築特色／參拜流程，文字逐字相符且**來源連結確實渲染在頁面上**（授權條件），其餘正確不渲染；另 ${templePhotos} 間廟頁與 ${deityPhotos} 尊神明頁的代表圖皆已渲染且檔案存在，其中內政部來源者**攝影者姓名與可點來源連結都在**；另地方宗教慶典 ${lcChecked}/${localCel.items.length} 項逐項在 /festivals/local/ 出現、項數敘述相符、回曆項未被擅自換算，${lcTempleSections} 間廟頁與相關節日頁的名單皆雙向比對（該有的都在、不該有的都不在）；另籤詩頁 ${globalThis.__poemCards} 張與神明頁 ${globalThis.__deityCards} 張專屬分享卡皆為該頁自己的卡且**檔案存在**，全站分享列逐頁驗過 ${globalThis.__shareRows} 頁、404 正確不帶、且確認分享列在 pagefind 索引區外；另 ${globalThis.__zodiacShrine} 個生肖頁的太歲殿名單（各 ${globalThis.__zodiacShrineN} 間）**措辭界線那句在**、名單雙向比對相符、且未與「祭典登記有安太歲」那批重複；另「附近的廟」頁骨架齊全（定位鈕／結果清單／${globalThis.__nbSlots} 個預渲染結果槽／無 JS 退路的縣市清單），格網索引 ${globalThis.__nbCells} 個格檔共 ${globalThis.__nbRows} 筆與資料**雙向**逐筆相符（每筆都落在正確的格、無多餘格檔、無座標者一間都不在裡面）；另正文圖片覆蓋 ${globalThis.__imageCoverage.requiredGeneral} 個非黃曆／宮廟頁、${globalThis.__imageCoverage.requiredAlmanac} 個指定黃曆日與 ${globalThis.__imageCoverage.requiredTemples} 個流量 Top 宮廟頁。`);
  process.exit(0);
}

console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
if (missingPages) console.error(`  （其中 ${missingPages} 間廟頁未建置）`);
for (const v of violations.slice(0, 30)) console.error(`  ✗ ${v}`);
if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
process.exit(1);
