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
  { file: 'src/data/festivals.json', fields: ['facts.text'] },
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
  { re: /本站(的)?資料(來源|源自)/, why: '全站級來源宣告，屬 /about/' },
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
function scanProseJson(hits) {
  for (const { file, fields } of PROSE_JSON) {
    if (!existsSync(file)) continue;
    let rows;
    try { rows = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      for (const k of fields) {
        // 支援 `a.b` 路徑穿進物件陣列（如 scenarios 的 patrons[].why）。
        // ⚠️ 原本只取 row[k]，巢狀欄位會取到 undefined 而**靜默跳過**——
        // 加了白名單卻什麼都沒掃，比沒加更糟（誤以為有守）。
        for (const { path, value } of resolveField(row, k)) {
          if (typeof value !== 'string') continue;
          for (const b of [...AI_TELLS, ...MARKDOWN_ARTIFACTS]) {
            const m = value.match(b.re);
            if (m) hits.push({ f: `${file} → ${row.id ?? row.slug ?? '?'}.${path}`, line: 0, phrase: m[0].trim(), why: b.why });
          }
        }
      }
    }
  }
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
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const b of BANNED) {
      const m = line.match(b.re);
      if (m) hits.push({ f, line: i + 1, phrase: m[0], why: b.why });
    }
    // 只掃會渲染出去的行：**註解不擋**。否則沒人敢在註解裡記下病灶原文
    // （本檔自身與 temples/[id].astro:271 的沿革註解就是靠原文才看得懂當初改了什麼）。
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(line);
    if (!isComment && !SOURCE_CLAIM_ALLOW.has(f)) {
      for (const b of SOURCE_CLAIM) {
        const m = line.match(b.re);
        if (m) hits.push({ f, line: i + 1, phrase: m[0], why: b.why });
      }
    }
  });
}

scanProseJson(hits);

if (hits.length) {
  console.error(`✗ 文案 AI 味 ${hits.length} 處（面向使用者的字要像真人；規則見記憶 copy-voice-no-ai-speak）：`);
  for (const h of hits) console.error(`  ${h.f}:${h.line}  「${h.phrase}」— ${h.why}`);
  console.error('\n修法：改寫成真台灣人會打的白話（先自問「真的有人會這樣打字嗎？」）。');
  console.error('確認是誤傷才在 scripts/check-copy-voice.mjs 收斂該條 pattern。');
  process.exit(1);
}
console.log(`✓ check:copy-voice：掃 ${files.length} 個 .astro，無 AI 味禁語`);
