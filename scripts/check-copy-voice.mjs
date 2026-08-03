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


// 掃白名單資料 JSON 的散文欄位（AI 產製，非公有領域古文）。
function scanProseJson(hits) {
  for (const { file, fields } of PROSE_JSON) {
    if (!existsSync(file)) continue;
    let rows;
    try { rows = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      for (const k of fields) {
        const v = row?.[k];
        if (typeof v !== 'string') continue;
        for (const b of AI_TELLS) {
          const m = v.match(b.re);
          if (m) hits.push({ f: `${file} → ${row.id ?? '?'}.${k}`, line: 0, phrase: m[0], why: b.why });
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
