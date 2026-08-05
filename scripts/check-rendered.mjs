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
  // 背景：內政部慶(祭)典資料匯入後 2,500 間廟有了自己登記的祭典（4,108 筆）。
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

// ── 不變量 5（2026-07-31 加）：擇日「宜○○」清單不得含該事項明文所忌的日相 ──────────
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

if (violations.length === 0) {
  console.log(`✓ render 不變量檢查通過：全 ${checked} 間廟頁逐一比對，${expectedCount} 間正確顯示求籤區塊、其餘正確不顯示；並確認全 ${checked} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料、且 og:image 為本廟專屬卡（檔案存在）且 og:title 不含站名；title 其中 ${titleWithDeity} 頁帶主祀神、神名皆已清洗且全形寬未超過 30；另全 ${globalThis.__nearbyChecked} 間有鄰居的廟頁皆含同鄉鎮宮廟區塊且鎮內廟數相符；全 ${townPages} 個鄉鎮頁摘要存在、其中 ${townPages - townUnmatched} 頁間數與資料逐一相符；全 ${deityChecked} 尊神明頁其中 ${deityWithShengdan} 尊聖誕（農曆標籤＋國曆往返驗證）相符、其餘正確不帶日期後綴；全 ${festChecked} 個節日頁含 lead／FAQPage／Event 且日期相符、當日祭典宮廟名單間數與資料相符；另全 ${festTemples} 間有年度祭典的廟頁筆數／名稱／代表祭典句逐一相符、其餘 ${checked - festTemples} 間正確不顯示該區塊；另 ${yijiPagesChecked} 個擇日頁共 ${yijiDaysChecked} 個「宜」日逐日翻查該日農民曆頁，建除／日干／日支皆非投票表明列所忌；另全 ${qifuChecked} 間廟頁皆含祈福區塊與 /qiugian/ 集氣入口，其中 ${qifuWithOffice} 間職司句與資料相符、${qifuWithScenario} 間列出情境、${qifuWithConcern} 間列出煩惱籤，情境與煩惱籤皆雙向比對（該有的都在、不該有的都不在）。`);
  process.exit(0);
}

console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
if (missingPages) console.error(`  （其中 ${missingPages} 間廟頁未建置）`);
for (const v of violations.slice(0, 30)) console.error(`  ✗ ${v}`);
if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
process.exit(1);
