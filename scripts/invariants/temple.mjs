// 廟宇頁的不變量。**全部共用同一趟走訪**（runner 依 source 分組，dist/temples/*/index.html
// 讀一次餵給這裡每一條）——重構前這批頁被完整讀 4 次、近全量 1 次，共 ≈5 趟。
//
// ⚠️ 改任何一條之前先看它自己的檔頭註解：每一條都是拿線上事故換來的。
import { escText, escAttr } from '../lib/astro-escape.mjs';
import { commonTempleName } from '../../src/lib/temple-name.ts';
import {
  fullWidth, SERP_TITLE_MAX_WIDTH, TEMPLE_TITLE_DEITY_MAX_WIDTH, SERP_DESC_TRUNCATION_WIDTH,
} from '../../src/lib/text-width.ts';
import { checkEntityPhoto } from './entity-photo.mjs';
// 代表祭典的挑選與造句：頁面、OG 卡、本 gate 走同一支 lib。
import { pickMainFestival, festivalSentence } from '../../src/lib/temple-festival.ts';
// ⚠️ 2026-08-20 這支正在更名為 calendar-date.ts，`lunar-date.ts` 暫留為純轉出。
//    等那次更名落地，這裡連同其餘 import 一起改指 calendar-date.ts。
import { lunarDateLabel } from '../../src/lib/lunar-date.ts';

const SECTION_MARK = 'class="temple-lingqian"';
const SUMMARY_MARK = 'class="summary"';
const FAQ_MARK = '"@type":"FAQPage"';
// 求籤句在 meta description 裡的字面。🔴 與 src/pages/temples/[id].astro 的 lingqianLine 同字面；
// 兩邊不一致這條 gate 會直接算成「沒有求籤句」而靜默略過，故改任一邊都要一起改。
const LINGQIAN_DESC_MARK = '可線上求籤，附白話解籤。';

/** 原不變量 1：求籤 · 主祀神靈籤區塊（雙向）。本檔最早的一條。 */
export const templeLingqian = {
  id: 'temple/lingqian',
  legacyIds: ['1'],
  title: '主祀神有籤系者必須渲染求籤區塊並連向每個籤系 hub，無籤系者必須不渲染',
  source: 'temples',
  check(t, page, ctx, acc) {
    const hasSection = page.html.includes(SECTION_MARK);
    const systems = ctx.derived.expectedSystems(t);
    if (systems.length > 0) {
      acc.count('expected');
      if (!hasSection) {
        acc.violate(`${t.id}（主祀 ${t.main_deity_ref} 有籤系 ${systems.join('/')}）應顯示求籤區塊，實際缺少`);
        return;
      }
      for (const sid of systems) {
        const href = ctx.derived.systemHrefOf(sid);
        if (!page.html.includes(`href="${href}"`)) acc.violate(`${t.id} 求籤區塊缺少連結 ${href}`);
      }
    } else if (hasSection) {
      acc.violate(`${t.id}（主祀 ${t.main_deity_ref ?? '無對映'} 無籤系）不應顯示求籤區塊，實際卻有`);
    }
  },
  summary: (acc, ctx) =>
    `全 ${ctx.visitedOf('temples')} 間廟頁逐一比對，${acc.get('expected')} 間正確顯示求籤區塊、其餘正確不顯示`,
};

/** 原本**沒有編號**的一條（舊 L134-136）：頁首 answer-first 摘要 + FAQPage。 */
export const templeSummaryFaq = {
  id: 'temple/summary-faq',
  legacyIds: [],
  title: '全體廟頁必有 answer-first 摘要元素與 FAQPage 結構化資料',
  source: 'temples',
  check(t, page, _ctx, acc) {
    if (!page.html.includes(SUMMARY_MARK)) acc.violate(`${t.id} 缺少 answer-first 摘要元素（${SUMMARY_MARK}）`);
    if (!page.html.includes(FAQ_MARK)) acc.violate(`${t.id} 缺少 FAQPage 結構化資料（${FAQ_MARK}）`);
  },
  summary: (_acc, ctx) =>
    `並確認全 ${ctx.visitedOf('temples')} 間廟頁皆含 answer-first 摘要（${SUMMARY_MARK}）與 FAQPage 結構化資料`,
};

/**
 * 原不變量 1b（2026-07-30 加）：分享卡必須是「這間廟自己那張」，且分享標題不得出現站名。
 * 背景：外撥把廟宇連結傳給廟方時，原本 12,018 頁共用同一張神酷品牌卡，
 *       主委看到的是別人的招牌（用戶截圖實例）。逐廟驗三件事：
 *       og:image 指向本廟的卡、該檔真的存在（不能指向 404）、og:title 不含「神酷」。
 */
export const templeOgCard = {
  id: 'temple/og-card',
  legacyIds: ['1b'],
  title: 'og:image 是本廟專屬卡且檔案存在、og:title 不含站名',
  source: 'temples',
  check(t, page, ctx, acc) {
    const ogImg = page.html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? '';
    const wantPath = `/og/temples/${encodeURIComponent(t.id)}.png`;
    if (!ogImg.endsWith(wantPath)) {
      acc.violate(`${t.id} og:image 不是本廟專屬卡（實際：${ogImg || '無'}）`);
    } else if (!ctx.exists(`${ctx.DIST}/og/temples/${t.id}.png`)) {
      acc.violate(`${t.id} og:image 指向的卡片檔不存在（dist/og/temples/${t.id}.png）`);
    }
    const ogTitle = page.html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '';
    if (!ogTitle) acc.violate(`${t.id} 缺 og:title`);
    else if (ogTitle.includes('神酷')) acc.violate(`${t.id} og:title 仍含「神酷」：${ogTitle}`);
  },
  summarySep: '、且 ',
  summary: () => 'og:image 為本廟專屬卡（檔案存在）且 og:title 不含站名',
};

/**
 * 原不變量 1d（2026-07-31 加）：title 的長度上限與髒資料清洗。
 * 背景：title 加上「主祀○○」是為了在 Google 地圖包旁邊給出地圖沒有的資訊。
 *       但 `main_deity_raw` 是 MOI 原始欄位，有廟登記 7 尊並列、也有超長名稱——
 *       未清洗就會產生 47 全形字、被 Google 從中間截斷的標題。
 * 驗三件事（都是**上線後才看得到**的產物層事實，不能只靠 build 期單元測試）：
 *   ① 帶「主祀」子句者，全形寬（含站名）不得超過 30；
 *   ② 帶「主祀」子句者，神名不得含分隔符（逗號/頓號/分號）——含了代表「取首位」失效；
 *   ③ 帶「主祀」子句者，神名不得超過 8 全形字。
 * ⚠️ 上限**只對帶主祀子句者**斷言，因為那正是程式碼保證的事（「加子句不得把標題推過 30」）。
 * 🔴 它同時是 temple/serp-uniqueness 的上游：把每個 title 的擁有者記進 acc.state.owners。
 */
export const templeTitleHygiene = {
  id: 'temple/title-hygiene',
  legacyIds: ['1d'],
  title: 'title 帶主祀子句時的長度上限與神名清洗',
  source: 'temples',
  initAcc(acc) { acc.state.owners = new Map(); },
  check(t, page, _ctx, acc) {
    const pageTitle = page.title();
    const owners = acc.state.owners;
    if (pageTitle) (owners.get(pageTitle) ?? owners.set(pageTitle, []).get(pageTitle)).push(t.id);
    if (!pageTitle) { acc.violate(`${t.id} 缺 <title>`); return; }
    const m = pageTitle.match(/・主祀([^｜]+)｜/);
    if (!m) return;
    acc.count('withDeity');
    const wide = fullWidth(pageTitle);
    if (wide > SERP_TITLE_MAX_WIDTH) {
      acc.violate(`${t.id} title 帶主祀子句卻超過 ${SERP_TITLE_MAX_WIDTH} 全形字（${wide}）：${pageTitle}`);
    }
    if (/[,，、;；]/.test(m[1])) acc.violate(`${t.id} title 主祀神未取首位（含分隔符）：${m[1]}`);
    if (fullWidth(m[1]) > TEMPLE_TITLE_DEITY_MAX_WIDTH) {
      acc.violate(`${t.id} title 主祀神超過 ${TEMPLE_TITLE_DEITY_MAX_WIDTH} 全形字：${m[1]}`);
    }
  },
  summary: (acc) =>
    `title 其中 ${acc.get('withDeity')} 頁帶主祀神、神名皆已清洗且全形寬未超過 ${SERP_TITLE_MAX_WIDTH}`,
};

/**
 * 原不變量 1h（2026-08-09 加；🔴 舊編號與「內政部建築特色／參拜流程」撞號）：
 * 法人前綴不得出現在 title 開頭。
 * 背景：348 間廟的登記全名以「財團法人／社團法人」開頭，SERP 上第一眼看到的就是那四個字。
 *       GSC 7 天實測這群 CTR 1.37%、其餘 10,342 間 2.42%；而「財團法人」本身零搜尋需求。
 * 🔴 驗**雙向**，兩邊都是實害：
 *   ① title 不得以法人前綴開頭——退化回去就是把 CTR 賠掉，且不會有任何錯誤訊息；
 *   ② 一般稱呼必須真的出現在 title——防「剝過頭把廟名剝沒了」。
 * ⚠️ 只驗開頭。登記全名出現在 title 後段的括號裡是**刻意的**（放得下就留），不是違規。
 */
export const templeLegalPrefix = {
  id: 'temple/legal-name-prefix',
  legacyIds: ['1h'],
  title: 'title 不得以法人前綴開頭，且必須含一般稱呼',
  source: 'temples',
  check(t, page, _ctx, acc) {
    const pageTitle = page.title();
    if (!pageTitle) return; // 缺 title 已由 temple/title-hygiene 報過
    if (/^(財團法人|社團法人)/.test(pageTitle)) {
      acc.violate(`${t.id} title 以法人前綴開頭（應改用一般稱呼，見 src/lib/temple-name.ts）：${pageTitle}`);
    }
    if (!pageTitle.includes(commonTempleName(t.name))) {
      acc.violate(`${t.id} title 未含一般稱呼「${commonTempleName(t.name)}」：${pageTitle}`);
    }
  },
  summary: false,
};

/**
 * 原不變量 1e（2026-08-03 加）：meta description 不得出現連續標點。
 * 背景：description 由多個「可有可無」的句子串接（沿革首句／祭典句／聖誕句／求籤句／鄉鎮脈絡），
 *       每一段自己負責結尾標點。`historyFirstSentence` 有「已自帶標點就不補」的守衛，
 *       但 2026-07-31 加的 `main_festival` 分支漏了 → 那 21 筆已查證敘述句**全部自帶句號**，
 *       再補一個就變成「…獲指定為國家重要民俗。。可線上求籤」。受影響的正是最重要的一批名廟，
 *       而且**從 7/31 起就這樣送進 SERP，直到 8/3 才由線上 curl 抓到**。
 * ⚠️ 這類拼接瑕疵既有的檢查一律抓不到，故獨立成一條，涵蓋全部廟頁（不設任何前置條件）。
 * 🔴 它同時是 temple/serp-uniqueness 的上游：把每個 description 的擁有者記進 acc.state.owners。
 */
export const templeDescriptionPunct = {
  id: 'temple/description-punct',
  legacyIds: ['1e'],
  title: 'meta description 不得出現連續標點',
  source: 'temples',
  initAcc(acc) { acc.state.owners = new Map(); },
  check(t, page, _ctx, acc) {
    const desc = page.description();
    const owners = acc.state.owners;
    if (desc) (owners.get(desc) ?? owners.set(desc, []).get(desc)).push(t.id);
    const dupPunct = desc.match(/[。，、；：！？]{2,}/);
    if (!dupPunct) return;
    const at = desc.indexOf(dupPunct[0]);
    acc.violate(
      `${t.id} description 出現連續標點「${dupPunct[0]}」（第 ${at} 字）：…${desc.slice(Math.max(0, at - 18), at + 12)}…`,
    );
  },
  summary: false,
};

/**
 * 2026-08-22 加。**求籤句必須落在 Google 中文摘要的截斷點之前。**
 *
 * 🔴 為什麼要有這一條：這條規則 2026-08-03 就立過（把求籤句與鄉鎮統計句對調），
 *    但那次是在只有 22/7891 間廟有沿革時量的。內政部沿革匯入之後，沿革首句
 *    ＋祭典句又把求籤句推回截斷點之後，**而且推掉的正是流量最大的那批**
 *    （沿革是內政部給名廟的，有沿革＝有名）：2026-08-22 實測 3,672 間有籤系的廟裡
 *    1,241 間（33.8%）的求籤句 SERP 上根本看不到，大甲鎮瀾宮／白沙屯拱天宮／
 *    北港朝天宮／松山慈祐宮全在裡面。
 *    也就是說：**一次資料匯入把一條被實測立過的規則靜默推翻了三分之一，沒有任何東西會擋。**
 *    這一條就是那個「東西」。判準綁在**產物**上，不綁在模板怎麼寫——
 *    模板的排序邏輯以後怎麼改都行，改壞了這裡會紅燈。
 * ⚠️ 只驗「有輸出求籤句的頁」；沒有籤系對映的廟不該有這句（那是 temple/lingqian 的事）。
 */
export const templeLingqianInSerp = {
  id: 'temple/lingqian-in-serp',
  legacyIds: [],
  title: '有求籤句的廟宇頁，該句必須起始於 SERP 摘要截斷點之前',
  source: 'temples',
  check(t, page, ctx, acc) {
    const desc = page.description();
    if (!desc) return;
    const at = desc.indexOf(LINGQIAN_DESC_MARK);
    if (at < 0) return;
    acc.count('withLingqian');
    const width = fullWidth(desc.slice(0, at));
    if (width > SERP_DESC_TRUNCATION_WIDTH) {
      acc.violate(
        `${t.id} 的「${LINGQIAN_DESC_MARK}」起始於第 ${width} 全形字，超過截斷點 `
        + `${SERP_DESC_TRUNCATION_WIDTH}，SERP 上看不到：…${desc.slice(Math.max(0, at - 20), at + 12)}…`,
      );
    } else {
      acc.count('visible');
    }
  },
  summary: (acc) =>
    `${acc.get('withLingqian')} 間廟頁輸出求籤句，${acc.get('visible')} 間落在截斷點（${SERP_DESC_TRUNCATION_WIDTH} 全形）之前`,
};

/**
 * 原不變量 1i（2026-08-10 加；🔴 舊編號與「廟頁代表圖」撞號）：
 * 不同宮廟不得送出完全相同的 SERP title／description。
 * 同鄉鎮、同名、同主祀的廟原本即使加了地區與主祀仍無法辨識；這批頁用既有地址的
 * 最短唯一片段消歧。這裡驗最終產物，避免未來 title 候選或長度退回分支使碰撞復發。
 *
 * 🔴 它**不讀任何檔**：純粹是 1d／1e 走訪時填出的兩張表的 reduce，
 *    所以是 source:'none' + dependsOn，不是走訪型 adapter（給它一趟走訪＝憑空多讀一萬個檔）。
 */
export const templeSerpUniqueness = {
  id: 'temple/serp-uniqueness',
  legacyIds: ['1i'],
  title: '不同宮廟不得送出完全相同的 SERP title／description',
  source: 'none',
  dependsOn: ['temple/title-hygiene', 'temple/description-punct'],
  run(ctx, acc) {
    for (const [title, ids] of ctx.accOf('temple/title-hygiene').state.owners ?? []) {
      if (ids.length > 1) acc.violate(`宮廟 title 完全重複（${ids.join('、')}）：${title}`);
    }
    for (const [description, ids] of ctx.accOf('temple/description-punct').state.owners ?? []) {
      if (ids.length > 1) acc.violate(`宮廟 description 完全重複（${ids.join('、')}）：${description}`);
    }
  },
  summary: false,
};

/**
 * 原不變量 1c（2026-07-31 加）：年度慶(祭)典區塊。
 * 背景：內政部慶(祭)典資料匯入後 2,498 間廟有了自己登記的祭典（4,106 筆）。
 *       這是廟宇頁最實質的獨有內容，也直接餵 meta description 與 OG 分享卡，
 *       故逐頁驗**雙向**：有資料必須渲染且筆數相符、無資料必須不渲染（防模板寫死）。
 * ⚠️ 代表筆與日期字串一律取 lib 的計算結果比對，不在本檔重寫挑選規則。
 */
export const templeFestivals = {
  id: 'temple/festival-block',
  legacyIds: ['1c'],
  title: '年度慶(祭)典區塊筆數／名稱／代表祭典句雙向相符',
  source: 'temples',
  check(t, page, ctx, acc) {
    const templeFests = t.festivals ?? []; // 刻意不叫 festivals：ctx 已有 festivals.json
    const hasFestSection = page.html.includes('class="temple-festivals"');
    if (templeFests.length === 0) {
      if (hasFestSection) acc.violate(`${t.id}（無年度祭典資料）不應顯示年度祭典區塊，實際卻有`);
      return;
    }
    acc.count('withFestivals');
    if (!hasFestSection) {
      acc.violate(`${t.id}（有 ${templeFests.length} 筆年度祭典）應顯示年度祭典區塊，實際缺少`);
      return;
    }
    // ⚠️ 逐項計數用 class="fdate" 出現次數，**不要**寫成 `<li><span class="fdate">`：
    // Astro 會在每個元素補 data-astro-cid-* 屬性，那種寫法會恆為 0＝gate 靜默失效。
    const items = (page.html.match(/class="fdate"/g) ?? []).length;
    if (items !== templeFests.length) {
      acc.violate(`${t.id} 年度祭典列出 ${items} 筆，資料為 ${templeFests.length} 筆`);
    }
    // 每一筆的祭典名稱都必須真的出現在頁面上（防只渲染日期、或渲染到別間廟的資料）。
    for (const f of templeFests) {
      if (!page.html.includes(escText(f.name))) {
        acc.violate(`${t.id} 年度祭典缺少「${f.name}」`);
        break;
      }
    }
    // 代表筆（農曆日期最早）必須進 meta description——那是這批資料的 CTR 目的。
    // 已查證 main_festival 的 21 間走原本的敘述句，不適用本檢查。
    if (t.main_festival) return;
    const main = pickMainFestival(templeFests);
    const sentence = main ? festivalSentence(t.name, main, ctx.TODAY) : '';
    if (sentence && !page.description().includes(escAttr(sentence))) {
      acc.violate(`${t.id} meta description 未含代表祭典句：${sentence}`);
    }
  },
  summary: (acc, ctx) =>
    `另全 ${acc.get('withFestivals')} 間有年度祭典的廟頁筆數／名稱／代表祭典句逐一相符、`
    + `其餘 ${ctx.visitedOf('temples') - acc.get('withFestivals')} 間正確不顯示該區塊`,
};

/**
 * 原不變量 1f（2026-08-05 加）：祈福動線區塊 `temple-qifu`。
 * 背景：廟宇頁佔全站曝光 91% 卻對 /qiugian/ 零導流（正文 0 條內鏈，8 條全在折疊 nav 裡），
 *       導致時事集氣頁近 30 天合計只有 7 次瀏覽，「依真實集氣數決定去留」無數據可用。
 *       這個區塊是全體廟頁的常設入口，故逐頁全驗。
 * 🔴 **一律只在區塊內比對，不用全頁 includes**：nav 每頁都渲染全部 7 個 /qiugian/<concern>/
 *    連結，全頁比對會讓「不應出現」那半邊恆為真＝gate 靜默失效（同 1c 的 fdate 教訓）。
 */
export const templeQifu = {
  id: 'temple/qifu-block',
  legacyIds: ['1f'],
  title: '祈福動線區塊：集氣入口、職司句、情境與煩惱籤（雙向）',
  source: 'temples',
  check(t, page, ctx, acc) {
    const qifuBlock = page.section('temple-qifu');
    if (!qifuBlock) {
      acc.violate(`${t.id} 缺少祈福區塊（class="temple-qifu"），該區塊應為全體廟頁常設`);
      return;
    }
    acc.count('checked');
    // (1) 收尾的集氣入口無條件存在——這是本區塊的存在理由。
    if (!qifuBlock.includes('href="/qiugian/"')) {
      acc.violate(`${t.id} 祈福區塊缺少 /qiugian/ 集氣入口連結`);
    }
    // (2) 職司句須與 deities.json 的 office 逐項相符（有 office 才驗；無則須不出現該句）。
    const node = ctx.derived.publishableDeityOf(t.main_deity_ref); // 同頁面的 refOk
    const office = node?.office ?? [];
    if (office.length > 0 && node?.name) {
      acc.count('withOffice');
      const sentence = `${node.name}的職司是${office.join('、')}。`;
      if (!qifuBlock.includes(escText(sentence))) {
        acc.violate(`${t.id} 祈福區塊職司句與 deities.json 不符，應為：${sentence}`);
      }
    } else if (qifuBlock.includes('class="qifu-office"')) {
      acc.violate(`${t.id}（主祀神無 office 資料）不應顯示職司句，實際卻有`);
    }
    // (3)(4) 情境／煩惱籤**雙向**：該有的每一條都在、不該有的一條都不能在。
    const expectScenarios = node ? (ctx.derived.scenariosByDeity.get(t.main_deity_ref) ?? []) : [];
    for (const sid of ctx.derived.allScenarioIds) {
      const present = qifuBlock.includes(`/scenarios/${sid}/`);
      if (expectScenarios.includes(sid) && !present) {
        acc.violate(`${t.id} 祈福區塊缺少情境連結 /scenarios/${sid}/`);
      } else if (!expectScenarios.includes(sid) && present) {
        acc.violate(`${t.id} 祈福區塊多出情境連結 /scenarios/${sid}/（主祀神非該情境的 patron）`);
      }
    }
    if (expectScenarios.length > 0) acc.count('withScenario');
    const expectConcerns = node ? (ctx.derived.concernsByDeity.get(t.main_deity_ref) ?? []) : [];
    for (const cid of ctx.derived.allConcernIds) {
      const present = qifuBlock.includes(`/qiugian/${cid}/`);
      if (expectConcerns.includes(cid) && !present) {
        acc.violate(`${t.id} 祈福區塊缺少煩惱籤連結 /qiugian/${cid}/`);
      } else if (!expectConcerns.includes(cid) && present) {
        acc.violate(`${t.id} 祈福區塊多出煩惱籤連結 /qiugian/${cid}/（concerns.json 未把該神明列入）`);
      }
    }
    if (expectConcerns.length > 0) acc.count('withConcern');
  },
  summary: (acc) =>
    `另全 ${acc.get('checked')} 間廟頁皆含祈福區塊與 /qiugian/ 集氣入口，`
    + `其中 ${acc.get('withOffice')} 間職司句與資料相符、${acc.get('withScenario')} 間列出情境、`
    + `${acc.get('withConcern')} 間列出煩惱籤，情境與煩惱籤皆雙向比對（該有的都在、不該有的都不在）`,
};

/**
 * 原不變量 1g（2026-08-05 加）：觀光署簡介與開放時間。
 * 🔴 2026-08-09 起 intro 與 history **並存**（此前互斥，理由見 src/pages/temples/[id].astro）。
 *    斷言因此變成單純的雙向：有 intro 就必須顯示、沒有就不准顯示，**不再看 history**。
 *    ⚠️ 這裡與頁面必須永遠是同一條件，兩邊任一邊改了另一邊沒改，症狀就是整段安靜不見。
 * ⚠️ 計數器原本叫 `qifuIntro`／`qifuOpen`（命名錯置，屬 1g 不屬 1f），重構時已改名。
 */
export const templeIntroAndHours = {
  id: 'temple/intro-and-hours',
  legacyIds: ['1g'],
  title: '觀光署簡介與開放時間雙向（有資料必顯示且值相符、無資料不得顯示）',
  source: 'temples',
  check(t, page, _ctx, acc) {
    const introBlock = page.section('temple-intro');
    if (t.intro) {
      acc.count('intro');
      if (!introBlock) {
        acc.violate(`${t.id}（有 intro）應顯示簡介區塊，實際缺少`);
      } else {
        if (!introBlock.includes(escText(t.intro))) acc.violate(`${t.id} 簡介區塊文字與 temples.json 的 intro 不符`);
        // OGDL 1.0 要求標示出處：頁面須明寫引自何處（頁尾 Sources 之外再標一次給讀者看）。
        if (!introBlock.includes('觀光資訊資料庫')) acc.violate(`${t.id} 簡介區塊未標示來源（應含「觀光資訊資料庫」）`);
      }
    } else if (introBlock) {
      acc.violate(`${t.id}（無 intro）不應顯示簡介區塊，實際卻有`);
    }
    // 開放時間：雙向。有資料必須出現在基本資料表且值相符；無資料不得出現該列。
    const hasOpenRow = page.html.includes('>開放時間</dt>');
    if (t.open_time) {
      acc.count('openTime');
      if (!hasOpenRow) acc.violate(`${t.id}（open_time=${t.open_time}）應顯示開放時間，實際缺少`);
      else if (!page.html.includes(escText(t.open_time))) {
        acc.violate(`${t.id} 開放時間值與資料不符（應為 ${t.open_time}）`);
      }
    } else if (hasOpenRow) {
      acc.violate(`${t.id}（無 open_time 資料）不應顯示開放時間列，實際卻有`);
    }
  },
  summary: (acc) =>
    `另 ${acc.get('intro')} 間顯示觀光署簡介（文字相符且標示來源）、${acc.get('openTime')} 間顯示開放時間，兩者皆雙向比對`,
};

/**
 * 原不變量 1h（2026-08-06 加；🔴 舊編號與「法人前綴」撞號）：
 * 內政部條目內容（建築特色／參拜流程）雙向。
 * 🔴 授權條件是「標示資料來源連結」，所以除了文字要逐字相符，
 *    **該筆的 GetUploadFile 網址必須真的出現在頁面上**（頁尾 Sources 會輸出）。
 *    缺連結不是排版問題，是違反授權——故與文字同級硬擋。
 */
export const templeMoiDetail = {
  id: 'temple/moi-detail',
  legacyIds: ['1h'],
  title: '內政部建築特色／參拜流程逐字相符且來源連結確實渲染（授權條件）',
  source: 'temples',
  check(t, page, _ctx, acc) {
    const moiBlock = page.section('temple-moi-detail');
    const wantMoi = !!(t.architecture || t.worship_flow);
    if (!wantMoi) {
      if (moiBlock) acc.violate(`${t.id} 無建築特色／參拜流程資料，卻渲染了該區塊`);
      return;
    }
    acc.count('temples');
    if (!moiBlock) {
      acc.violate(`${t.id} 有建築特色／參拜流程資料，卻沒有渲染該區塊`);
      return;
    }
    for (const [field, label, idx] of [
      ['architecture', '建築特色', '3'],
      ['worship_flow', '參拜流程', '4'],
    ]) {
      if (!t[field]) continue;
      if (!moiBlock.includes(escText(t[field]))) acc.violate(`${t.id} ${label}文字與資料不符`);
      const cited = (t.sources ?? []).some((s) => String(s.ref ?? '').includes(`IndexID=${idx}`));
      if (!cited) acc.violate(`${t.id} ${label}在資料層就沒掛 GetUploadFile 來源（違反授權條件）`);
      else if (!page.html.includes(`IndexID=${idx}`)) {
        acc.violate(`${t.id} ${label}的來源連結沒有渲染到頁面上（違反授權條件）`);
      }
    }
  },
  summary: (acc) =>
    `另 ${acc.get('temples')} 間顯示內政部建築特色／參拜流程，文字逐字相符且**來源連結確實渲染在頁面上**（授權條件），其餘正確不渲染`,
};

/** 原不變量 1i（2026-08-06 加；🔴 舊編號與 SERP 唯一性撞號）：廟頁代表圖與出處標示。 */
export const templePhotoCredit = {
  id: 'temple/photo-credit',
  legacyIds: ['1i'],
  title: '廟頁代表圖已渲染、檔案存在，內政部來源者攝影者與來源連結都在',
  source: 'temples',
  check(t, page, ctx, acc) { checkEntityPhoto(t, page, ctx, acc, ''); },
  // 這一句原本就與神明頁那半邊（原 4d）綁在同一句，故由這裡一起組。
  summary: (acc, ctx) =>
    `另 ${acc.get('photos')} 間廟頁與 ${ctx.accOf('deity/photo-credit').get('photos')} 尊神明頁的代表圖皆已渲染且檔案存在，`
    + `其中內政部來源者**攝影者姓名與可點來源連結都在**`,
};

/**
 * 原不變量 2 + 2b（2026-07-28／07-30 加）：同鄉鎮其他宮廟區塊與脈絡句、
 * 以及 description 不得落回通用樣板。
 * 背景：GSC 抽驗顯示廟宇頁約 12% 未索引（推估 810 頁），最單薄的一批只有 273 字、4 條內鏈。
 *       補上同鄉鎮鄰近宮廟（≤5 條）與「本鎮共 N 間」脈絡句後，這裡逐頁驗。
 * ⚠️ **2 與 2b 刻意不拆成兩條**：原始碼裡 2b 巢狀在 2 的 for 內，且 2 在「缺鄰近區塊」時
 *    `continue`——也就是說 2b 的執行前提是「這頁真的有鄰近區塊」。拆開會讓沒有區塊的頁
 *    多噴一條 2b，判定語意就變了。`--only 2b` 靠 legacyIds 仍可用（會連 2 一起跑）。
 */
export const templeTownContext = {
  id: 'temple/town-context',
  legacyIds: ['2', '2b'],
  title: '同鄉鎮其他宮廟區塊、鎮內廟數脈絡句，且 description 不得落回通用樣板',
  source: 'temples',
  check(t, page, ctx, acc) {
    const town = ctx.derived.townOf(t);
    if (!town) return;
    if (town.total <= 1) return; // 全鎮只有這一間 → 不該有鄰近區塊，正確地不驗
    acc.count('checked');
    if (!page.html.includes('class="nearby"')) {
      acc.violate(`${t.id}（${town.township.name}共 ${town.total} 間）應有「同鄉鎮其他宮廟」區塊，實際缺少`);
      return;
    }
    if (!new RegExp(`登記在案的宮廟共\\s*${town.total}\\s*間`).test(page.html)) {
      acc.violate(`${t.id} 在地脈絡句的鄉鎮廟數與資料不符（資料 ${town.total} 間）`);
    }
    // 原不變量 2b：原尾句「神酷（folk.tw）廟宇資料庫收錄，資料源自內政部…」在 ~7,869 頁
    // 一字不差，對「台南○○宮」查詢零資訊量。改為由沿革/聖誕/鄉鎮脈絡衍生後，這裡驗：
    // **該鎮不只一間廟者**（＝townContext 必非空）description 一定有可衍生內容。
    const desc = page.description();
    if (!desc) {
      acc.violate(`${t.id} 缺 meta description`);
    } else if (/資料源自內政部全國宗教資訊網。$/.test(desc)) {
      acc.violate(`${t.id}（${town.township.name}共 ${town.total} 間，應有鄉鎮脈絡可寫）description 落回通用樣板`);
    }
  },
  summary: (acc) => `另全 ${acc.get('checked')} 間有鄰居的廟頁皆含同鄉鎮宮廟區塊且鎮內廟數相符`,
};

/**
 * 原不變量 7② （2026-08-06 加）：廟宇頁的地方宗教慶典區塊雙向。
 * ⚠️ 原本這一段自己把 10,690 個廟頁**再讀一次**（全檔第二大的效能債），
 *    只為驗一個 `class="local-celebration-list"` 的雙向。現在併進廟頁那一趟。
 */
export const templeLocalCelebration = {
  id: 'temple/local-celebration',
  legacyIds: ['7'],
  title: '有 temple_ref 指向的廟頁必須渲染地方宗教慶典區塊，沒有的必須不渲染',
  source: 'temples',
  check(t, page, ctx, acc) {
    const has = page.html.includes('class="local-celebration-list"');
    const want = ctx.derived.localByTemple.get(t.id) ?? [];
    if (want.length === 0) {
      if (has) acc.violate(`廟頁 ${t.id} 不該有地方宗教慶典區塊（無資料指向它）`);
      return;
    }
    if (!has) { acc.violate(`廟頁 ${t.id} 缺地方宗教慶典區塊（資料有 ${want.length} 項）`); return; }
    acc.count('sections');
    for (const x of want) {
      if (!page.html.includes(escText(x.name))) acc.violate(`廟頁 ${t.id} 地方宗教慶典未列出「${x.name}」`);
      const label = x.calendar === 'lunar' ? lunarDateLabel(x.date) : '';
      if (label && !page.html.includes(label)) {
        acc.violate(`廟頁 ${t.id} 地方宗教慶典「${x.name}」缺日期標籤「${label}」`);
      }
    }
  },
  summary: false, // 併在 local-celebration/overview 那一句裡
};

/**
 * 原不變量 11 的廟頁那一段（2026-08-08 加）：分享列是全站鋪滿（Base.astro 預設開），
 * 所以廟宇頁抽不得——逐頁全驗。
 * ⚠️ 原本它讓廟頁被**第四次**全量重讀，只為驗一個字串。現在併進廟頁那一趟。
 */
export const templeShareRow = {
  id: 'temple/share-row',
  legacyIds: ['11'],
  title: '每一個廟宇頁都必須有分享列',
  source: 'temples',
  check(t, page, _ctx, acc) {
    if (!page.html.includes('aria-label="分享這一頁"')) acc.violate(`廟宇頁 ${t.id} 缺分享列`);
    else acc.count('rows');
  },
  summary: false, // 併在 poem/share-card 那一句裡
};
