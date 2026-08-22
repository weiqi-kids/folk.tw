#!/usr/bin/env node
// 部署 gate：攔「面向使用者的產品文案出現 AI 療癒腔／假掰詩意」這個類別。
//
// 由來：用戶反覆要求「去 AI 味」，但人眼每次都會漏（例 /qiugian 的「…回來說一聲——你可能是
// 第一個。」）。把品味做成機器強制的 gate——命中即 exit 1 → deploy.yml build job 失敗 → 不部署，
// 連每日大腦自動優化寫出 AI 味也 push 不上去。
//
// 範圍：只掃 src/**/*.astro（產品 chrome 文案就在這；神明/籤解等資料在 *.json，含公有領域古文，
//       不掃以免誤傷）。禁語清單是「逐次養」的——每被用戶抓到新句子就補一條，只收嚴不放寬。
// 規則同源：記憶 copy-voice-no-ai-speak（面向使用者的字要像真台灣人講話，Dcard/PTT 白話、
//           matter-of-fact；禁修飾性情感詩）。
// 用法：`node scripts/check-copy-voice.mjs`（本機 pnpm check:copy-voice；CI 已串在 build gate 前）。
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// 語料涵蓋契約：宣告要掃什麼、掃到幾筆；掃到 0 或輸入缺漏就是違規，不是備註。
// 這支存在的直接理由就寫在本檔 scanProseJson() 裡那兩行警告。
import { newCorpus } from './lib/gate-corpus.mjs';

// 種子＝記憶列出的地雷 ＋ 歷來被用戶抓到的句子。誤傷時：先改寫文案；確認真的是誤傷才在此收斂
// pattern（縮小、加界，別整條刪）。新增禁語直接往下加一列。
// 2026-07-31：本檔原本只掃 .astro，check:content 只掃 .md(x)——於是**由 AI 產製、
// 存在資料 JSON 裡的散文兩道 gate 都不掃**（藥籤醫師解說 330 首×4 段就是這種）。
// 當初排除 JSON 的理由是「資料 JSON 含公有領域古文會誤判」，但這裡是白名單：
// 只列**確定全部是現代散文**的檔與欄位，不整批放行 JSON。
const PROSE_JSON = [
  { file: 'src/data/yaoqian-notes.json', fields: ['safety_flags', 'why_not_self_medicate', 'modern_care_pathway', 'physician_note'] },
  // 2026-08-03：/compare/ 從 3 頁擴到 13 頁，`contrast` 是逐頁手寫的散文（雖然內容只准
  // 重述 deities.json 已掛源的 office/category），屬「由 AI 產製、存在資料 JSON 裡」那一類，
  // 與藥籤醫師解說同型 → 一併納入白名單掃描。`a_focus`/`b_focus` 是短標籤不是散文，不掃。
  { file: 'src/data/comparisons.json', fields: ['contrast'] },
  // 同上：/scenarios/ 的 description 與 patrons[].why 也是手寫散文（內容只准重述
  // deities.json 已掛源的 office）。patrons 是巢狀陣列，掃描器需支援。
  { file: 'src/data/scenarios.json', fields: ['description', 'patrons.why'] },
  // 2026-08-05：廟宇 `intro`（115 間）＝交通部觀光署景點資料庫的官方介紹文字，逐筆引用不改寫。
  // 它**不是 AI 產製**，但同樣是「存在資料 JSON 裡、會渲染到使用者眼前的散文」——
  // 若哪天有人手改或用 LLM 補寫，這裡是唯一會攔到的地方（.astro gate 掃不到 JSON、
  // check:content 只掃 .md）。觀光行銷／旅遊指南腔另由 check:integrity 以
  // scripts/lib/tourism-intro.mjs 的同一份規則硬驗，兩道互補。
  { file: 'src/data/temples.json', fields: ['intro'] },
  // 2026-08-09：節日頁「逐句掛源的補充事實」。同樣是存在 JSON 裡、直接渲染給讀者看的散文。
  // 2026-08-22：`lead` 是節日頁正文第一段、也被塞進 FAQPage 的 answer；`date_note` 渲染在 header；
  // `seo_description` 進 meta。三個都直接面向讀者，卻一直不在掃描範圍內——當天實查
  // 54 個 lead 全部帶著「本頁先說明日期，再把祭祖、登高分開」這種**自我指涉的導覽句**
  // （見下方 SELF_REFERENCE）。我當時還拿「54 頁都這樣寫＝既有慣例」當作不修的理由，
  // 被站主打回：「你看過那個問題文章這樣宣告的？不是要去 AI 味嗎？」——
  // 🔴 **同一個 AI 腔犯 54 次是 54 個問題，不是慣例。數量從來不是不修的理由。**
  { file: 'src/data/festivals.json', fields: ['facts.text', 'lead', 'date_note', 'seo_description'] },
  // 2026-08-16：籤後選擇題的鼓勵語（籤型×選擇 64 段原創文案，直接渲染給使用者）。
  { file: 'src/data/qian-encourage.json', fields: ['text'] },
  // 2026-08-16：籤型（八型）的描述散文，渲染於籤詩頁。根是物件不是陣列，
  // 靠下方 scanProseJson 的物件包裝支援；用 types.desc 路徑穿進去。
  { file: 'src/data/poem-personas.json', fields: ['types.desc'] },
  // 2026-08-19：活動頁的檔期說明與補充事實。⚠️ `date_note` 直接渲染在活動頁與
  // /events/ 列表頁上，但它同時是最容易被寫成「維護筆記」的欄位——查源時手邊都是
  // caseId、holdPeriod、「repo 記的日期不可沿用」這類內部語彙，一不小心就整段貼進去。
  // 當天實際發生：17 筆 date_note 全部混進維護註記，其中 5 筆**已經上線**，
  // 讀者在列表頁看得到「🔴 repo 的 solar 12-12 是假的固定日」。
  { file: 'src/data/events.json', fields: ['date_note', 'facts.text'] },
  // 2026-08-22：同一輪清 SELF_REFERENCE 時發現這兩處也中招，一併納管。
  { file: 'src/data/good-days.json', fields: ['note'] },
  { file: 'src/data/practices.json', fields: ['steps.note'] },
];

// 維護筆記殘留（2026-08-19 加）。這些是**寫給維護者的語彙**，不該出現在讀者眼前。
// 🔴 為什麼做成 gate：查源與產頁是同一個流程，素材裡本來就充滿內部識別碼與判斷語，
//    「記得把它們拿掉」是靠不住的——那正是這批 17 筆一起中招的原因。
const MAINTENANCE_LEAKS = [
  { re: /🔴|⛔|🅤/, why: '維護註記符號（🔴／⛔／🅤 是給維護者的標記，不是給讀者的）' },
  { re: /caseId|holdPeriod|holdCalendarType|registerReason|historyDevelopment/, why: '資料來源的欄位名稱' },
  { re: /(?:^|[^A-Za-z])repo(?:[^A-Za-z]|$)/, why: '「repo」是內部語彙' },
  { re: /不可沿用|不要照它換算|逐字照抄|站上鐵則/, why: '對維護者的指示語' },
  { re: /lunar-javascript|nchdb|data\.boch/, why: '工具或端點名稱（讀者不需要知道我們用什麼查的）' },
];

// Markdown 殘留（2026-08-09 加）。這些欄位**渲染時是純文字**，不會過 Markdown ——
// 寫 `**時刻**` 就會把星號原樣印在頁面上。當天實際發生：清明的補充事實上線前才抓到。
// 🔴 為什麼做成 gate 而不是改掉那一句：資料是手寫或由模型產生的，寫 JSON 的人習慣帶 Markdown 語法，
//    這是**會重複發生的類型**，不是單一筆的筆誤。
const MARKDOWN_ARTIFACTS = [
  { re: /\*\*[^*]+\*\*/, why: 'Markdown 粗體殘留（此欄渲染為純文字，星號會原樣印出）' },
  { re: /(?:^|[^*])\*[^*\n]+\*(?:[^*]|$)/, why: 'Markdown 斜體殘留（同上）' },
  { re: /\[[^\]]+\]\([^)]+\)/, why: 'Markdown 連結殘留（同上）' },
  { re: /^#{1,6}\s/m, why: 'Markdown 標題殘留（同上）' },
];
// 自我指涉的導覽句（2026-08-22 加）。
// 「本頁先說明 A，再把 B、C 分開」這種宣告自己章節安排的寫法**只有 AI 會寫**，
// 真人寫的文章不會這樣自我介紹。它常常和一句該留的措辭界線黏在一起
// （「…，不把單一地區做法當成全臺規則」），所以**修法是拆開**：導覽的部分刪掉，
// 界線的部分改寫成不提「本頁」的正常說法。整句刪會連界線一起弄丟。
// ⚠️ 刻意**不禁「本文」**：`poems.json` 的「籤詩本文」是名詞（指籤詩正文本身），不是自我指涉。
// ⚠️ 也不禁單獨的「以下」（「以下是傳統常見版本」讀起來像人話），只禁「以下逐條…」這種宣告編排。
const SELF_REFERENCE = [
  // 兩個放行（2026-08-22 實測必要）：
  //   ・`本頁資料更新：` 是不變量 festival/discover-freshness **逐字要求**的可見標籤
  //     （Google 建議 Article 的 dateModified 要在頁面上看得到），改掉會讓產物層 gate 紅燈。
  //   ・`把這頁存起來` 這種「這頁」是正常人話（指瀏覽器裡的這一頁），不是宣告章節安排。
  { re: /本頁(?!資料更新)|這一頁|(?<![把存])這頁/, why: '自我指涉的導覽句（真人寫的文章不會宣告自己的章節安排；界線要留，改成不提「本頁」的說法）' },
  { re: /以下逐條/, why: '同上：宣告編排方式' },
];

/**
 * SELF_REFERENCE 在 .astro 比對前要先剝掉的兩種**不是散文**的東西（2026-08-22，實測誤傷）：
 *   ① 行尾 `//` 註解——`iso: string; // 本頁日期（YYYY-MM-DD）`。上面那台註解狀態機只認
 *      **行首**的 `//`，行尾的接在程式碼後面，它看不到。⚠️ 負向前瞻擋 `https://`。
 *   ② `aria-label="分享這一頁"`——無障礙標籤指的是瀏覽器裡的這一頁，不是在跟讀者宣告章節安排。
 * 這兩種剝掉之後剩下的才是真的會被讀者看到的字。
 */
const stripNonProse = (line) => line
  .replace(/(?<![:/])\/\/.*$/, '')
  .replace(/aria-label="[^"]*"/g, '');

// 一般 AI 腔套語。只作用於 PROSE_JSON（.astro 的產品文案另有下方 BANNED 的專屬地雷）。
const AI_TELLS = [
  { re: /總的來說/, why: 'AI 套語' },
  { re: /值得注意的是/, why: 'AI 套語' },
  { re: /綜上所述/, why: 'AI 套語' },
  { re: /總而言之/, why: 'AI 套語' },
  { re: /需要注意的是/, why: 'AI 套語' },
  { re: /讓我們/, why: 'AI 套語（第一人稱複數勸導腔）' },
  { re: /首先[^，。]{0,8}其次/, why: 'AI 條列腔' },
  { re: /不僅[^，。]{0,12}而且/, why: 'AI 排比腔' },
  // 2026-08-16 鼓勵語審稿抓到的「讚美機器人腔」（Good choice／Smart move 直譯）：
  // 對使用者的決定打分，不是真人朋友的講話方式。
  // ⚠️ 已收斂一次（2026-08-16）：「沒有更好選擇的年代」是正當用法，只擋當讚美感嘆詞的「，好選擇，」。
  { re: /(?<!更)好選擇[，。！]/, why: '讚美機器人腔（Good choice 直譯）' },
  { re: /這樣做很聰明/, why: '讚美機器人腔（Smart move 直譯）' },
  { re: /更(接近|貼近)這支籤/, why: '後設分析腔：拿「與籤的距離」替行為打分' },
  // ⚠️ 刻意不含「可以理解」：藥籤註「方向可以理解，但不能取代檢查」是正當讓步，會誤傷。
  { re: /(也能|都能)理解/, why: '先同理後指導的諮商機器人腔' },
];


// ── 全站級的單一資料來源宣告（2026-08-07 立，用戶第三次抓到）──────────────────────
// 病灶：在樞紐頁／內容頁寫「（內政部開放資料）」「資料來源：內政部全國宗教資訊網開放資料。」
// 這種**全站級**的來源宣告。兩個問題疊在一起：
//   ① 它是後設警語，屬 /about/ 的事（記憶 no-meta-disclaimers-on-pages：樞紐頁與 /about/
//      已統一處理，內容頁再加就是警語牆）。2026-08-06 才被抓過一次，8/7 又在 /temples/ 重犯。
//   ② **它是假的**。站上的廟宇資料是複合來源——內政部 8203 ＋ 交通部觀光署 ＋ 廟方官網
//      ＋ 維基 ＋ 逐間查證的沿革，宣稱單一來源不只是多餘，是錯的陳述（違反總紅線 1）。
//
// 🔴 這條擋的是**全站級宣稱**，不是逐筆掛源。兩者的界線：
//    · 逐筆事實掛源（<Sources> 元件、moi_knowledge 的條目連結、座標來源、
//      《欽定協紀辨方書》這類單筆引用）＝**必要**，內政部授權條件就是標示來源連結。
//    · 針對某一個區塊的來源（那天的曆算依據、那份登記祭典清單）＝可以，見下方 ALLOW。
//    · 「本頁／本站的資料來自 X」＝**不可以**，那是 /about/ 的事，而且我們不是單一來源。
const SOURCE_CLAIM = [
  { re: /[（(]內政部[^）)]{0,12}開放資料[）)]/, why: '全站級單一來源宣告（屬 /about/；且資料為複合來源）' },
  { re: /資料來源[：:]\s*內政部/, why: '同上' },
  { re: /資料源自內政部/, why: '同上' },
  { re: /站上(的)?資料(來源|源自)/, why: '全站級來源宣告，屬 /about/' },
  // 🔴 2026-08-21 補的三條。前四條擋的是**那幾句字面**，而 2026-08-21 在
  //    `temples/region/[county]/[town]/[deity].astro` 抓到的是
  //    「宮廟、主祀與祭典資料：內政部全國宗教資訊網開放資料。」——沒有括號、
  //    主詞從「資料來源」換成「宮廟、主祀與祭典資料」，四條規則一條都沒中。
  //    這是本檔開頭那句教訓（「禁語要擋**句型**，不是擋那一句字面」）在來源宣告上的重演。
  { re: /內政部[^。，\n]{0,20}開放資料/, why: '全站級單一來源宣告（不論有無括號）；屬 /about/' },
  { re: /[^。\n]{0,14}資料[：:]\s*(內政部|交通部|文化部|衛生福利部)/, why: '「某某資料：某部會」＝資料集級宣稱，屬 /about/' },
  // 資料集級整包宣稱的字面（＝ src/lib/sources.ts 的 DATASET_LEVEL_CLAIMS）。
  // 那兩句由 <Sources> 在渲染時濾掉，這裡擋的是「有人又把它寫死進 .astro」。
  { re: /data\.gov\.tw\/dataset\/(8203|7777)/, why: '資料集級整包宣稱，屬 /about/（見 sources.ts DATASET_LEVEL_CLAIMS）' },
];
// 例外：**針對單一區塊**的來源說明，不是全站級宣稱。加新例外前先確認它真的只描述該區塊。
const SOURCE_CLAIM_ALLOW = new Set([
  // 那一天的曆算依據，寫在 <details> 的「曆算基準」dl 裡，與時區／日界／時柱並列。
  'src/components/AlmanacDay.astro',
  // 只描述「當天有登記祭典的宮廟」那一份清單的出處，不是在講全站資料。
  'src/pages/festivals/[slug].astro',
  // /about/ 就是放這件事的地方。
  'src/pages/about.astro',
]);

const BANNED = [
  { re: /放下了/, why: '假釋懷腔（用戶原話：這種講法「太 AI」）' },
  { re: /釋懷了/, why: '假釋懷腔' },
  { re: /下一個人的光/, why: '情感詩／curated' },
  { re: /(添|多)了一分暖/, why: '情感詩' },
  { re: /不是一個人走過/, why: '情感詩' },
  { re: /照亮彼此/, why: '情感詩' },
  { re: /你的消息會陪/, why: '情感詩' },
  { re: /你(可能|可以|也許|說不定|或許)(會)?是第一個/, why: '「當第一個」勸誘框，非真人語氣' },
  // 2026-08-02 用戶回報 /qiugian 又出現 AI 味：「還沒有人回來報喜——你有結果了，回來說一聲。」
  // 這批**不是新病灶，是舊病灶的變體**：既有規則只擋了「你可能是第一個」那個完整句，
  // 「回來說一聲」「後面還在找的人會看到」換個接法就繞過去了。
  // 教訓：禁語要擋**句型**，不是擋那一句字面。以下三條擋的是同一個腔調——
  // 替使用者想像一個溫情場景（有人在等你、你的回報會照亮誰）。
  { re: /回來說一聲/, why: '溫情勸誘腔（用戶 2026-08-02 指名）' },
  { re: /後面(還在|正在)?[^。，]{0,6}的人會看到/, why: '替使用者想像溫情場景，非真人語氣' },
  { re: /後面還在找的人/, why: '同上，情感詩' },
  { re: /正跟你一樣/, why: '同上：把統計數字包裝成「有人陪你」的溫情場景' },
];


// 解析欄位路徑：'why' → 該筆的 why；'patrons.why' → 每個 patrons[i].why。
// 回傳 {path, value}，path 帶陣列索引，命中時報得出是哪一筆。
function resolveField(obj, spec) {
  const [head, ...rest] = spec.split('.');
  const v = obj?.[head];
  if (!rest.length) return [{ path: head, value: v }];
  const sub = rest.join('.');
  if (Array.isArray(v)) return v.flatMap((item, i) =>
    resolveField(item, sub).map((r) => ({ path: `${head}[${i}].${r.path}`, value: r.value })));
  return resolveField(v, sub).map((r) => ({ path: `${head}.${r.path}`, value: r.value }));
}

// 掃白名單資料 JSON 的散文欄位（AI 產製，非公有領域古文）。
function scanProseJson(hits, corpus) {
  let scannedFields = 0;
  for (const { file, fields } of PROSE_JSON) {
    // 🔴 白名單指到不存在的檔＝這道 gate 對該檔實際上是關閉的，而且會印綠字。
    //    原本是 `continue`（靜默跳過），2026-08-20 改成違規上報。
    if (!existsSync(file)) { corpus.missing('PROSE_JSON 白名單檔', file, '改名或搬移後白名單沒跟著改'); continue; }
    let rows;
    try {
      rows = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      // 同上：JSON 壞掉不能靜默跳過。
      corpus.missing('PROSE_JSON 白名單檔', file, `JSON 解析失敗（${e.message.split('\n')[0]}）`);
      continue;
    }
    // 根是物件的檔（如 poem-personas.json）包成單列，讓 a.b 路徑穿進去掃；
    // 原本 !Array.isArray 直接 continue 會把整檔靜默跳過——正是上面警告過的「加了白名單卻沒掃」。
    if (!Array.isArray(rows)) rows = [rows];
    for (const row of rows) {
      for (const k of fields) {
        // 支援 `a.b` 路徑穿進物件陣列（如 scenarios 的 patrons[].why）。
        // ⚠️ 原本只取 row[k]，巢狀欄位會取到 undefined 而**靜默跳過**——
        // 加了白名單卻什麼都沒掃，比沒加更糟（誤以為有守）。
        for (const { path, value } of resolveField(row, k)) {
          if (typeof value !== 'string') continue;
          scannedFields += 1;
          for (const b of [...AI_TELLS, ...MARKDOWN_ARTIFACTS, ...MAINTENANCE_LEAKS, ...SELF_REFERENCE]) {
            const m = value.match(b.re);
            if (m) hits.push({ f: `${file} → ${row.id ?? row.slug ?? '?'}.${path}`, line: 0, phrase: m[0].trim(), why: b.why });
          }
        }
      }
    }
  }
  return scannedFields;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.astro')) out.push(p);
  }
  return out;
}

const files = walk('src');
const hits = [];
for (const f of files) {
  // 🔴 2026-08-21：註解判定改成**區塊狀態機**。原本是單行 `/^\s*(\/\/|\/\*|\*)/`，
  //    抓不到 Astro 自己的註解語法 `{/* … */}`——行首是 `{`，不是 `/*`——
  //    也抓不到多行註解裡「不以 * 開頭」的續行。後果是**註解裡的字被當成會渲染的內容在掃**，
  //    等於逼人不敢在註解裡寫下病灶原文，而那正是本檔開頭說要保護的事。
  //    抓到的當下：移除 region 深頁那句全站級宣稱時，我把原句寫進 `{/* … */}` 留證，
  //    新規則立刻對自己的註解紅燈。
  let inBlockComment = false;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const b of BANNED) {
      const m = line.match(b.re);
      if (m) hits.push({ f, line: i + 1, phrase: m[0], why: b.why });
    }
    // 只掃會渲染出去的行：**註解不擋**。否則沒人敢在註解裡記下病灶原文
    // （本檔自身與 temples/[id].astro:271 的沿革註解就是靠原文才看得懂當初改了什麼）。
    const wasInBlock = inBlockComment;
    // 同一行內開了又關的（`{/* … */}` 單行）不進入區塊狀態，但該行本身算註解。
    const opens = (line.match(/\{?\/\*/g) ?? []).length;
    const closes = (line.match(/\*\//g) ?? []).length;
    if (opens > closes) inBlockComment = true;
    else if (closes > opens) inBlockComment = false;
    const isComment = wasInBlock || inBlockComment || opens > 0
      || /^\s*(\/\/|\/\*|\*)/.test(line);
    if (!isComment && !SOURCE_CLAIM_ALLOW.has(f)) {
      for (const b of SOURCE_CLAIM) {
        const m = line.match(b.re);
        if (m) hits.push({ f, line: i + 1, phrase: m[0], why: b.why });
      }
    }
    // 2026-08-22：SELF_REFERENCE 一併套到 .astro——自我指涉的導覽句在 JSON 與模板裡是同一個病
    // （當天實查 zodiac/[slug].astro、zodiac/index.astro 與 festivals/index.astro 各有一句
    // 渲染給讀者看的「本頁…」）。
    // ⚠️ 必須放在 `!isComment` 這一側：BANNED 那一段刻意不排除註解（沒人會在註解裡寫療癒腔），
    //    但註解裡講「本頁的通用視覺是…」是完全正常的維護語言，擋它等於逼人不敢寫註解。
    if (!isComment) {
      const prose = stripNonProse(line);
      for (const b of SELF_REFERENCE) {
        const m = prose.match(b.re);
        if (m) hits.push({ f, line: i + 1, phrase: m[0], why: b.why });
      }
    }
  });
}

const corpus = newCorpus('check:copy-voice');
corpus.track('.astro 檔', files.length);
const scannedFields = scanProseJson(hits, corpus);
corpus.track(
  'PROSE_JSON 散文欄位',
  scannedFields,
  { why: 'PROSE_JSON 的檔案改名、或欄位路徑寫錯（巢狀取到 undefined），都會讓它安靜地掃到 0' },
);
const corpusProblems = corpus.problems();
if (corpusProblems.length) {
  console.error('✗ check:copy-voice 的語料涵蓋有問題（gate 少掃卻通過，比沒有這道 gate 更糟）：');
  for (const c of corpusProblems) console.error(`  ${c}`);
  process.exit(1);
}

if (hits.length) {
  console.error(`✗ 文案 AI 味 ${hits.length} 處（面向使用者的字要像真人；規則見記憶 copy-voice-no-ai-speak）：`);
  for (const h of hits) console.error(`  ${h.f}:${h.line}  「${h.phrase}」— ${h.why}`);
  console.error('\n修法：改寫成真台灣人會打的白話（先自問「真的有人會這樣打字嗎？」）。');
  console.error('確認是誤傷才在 scripts/check-copy-voice.mjs 收斂該條 pattern。');
  process.exit(1);
}
console.log(`✓ check:copy-voice：掃 ${corpus.summary()}，無 AI 味禁語`);
