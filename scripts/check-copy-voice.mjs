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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 種子＝記憶列出的地雷 ＋ 歷來被用戶抓到的句子。誤傷時：先改寫文案；確認真的是誤傷才在此收斂
// pattern（縮小、加界，別整條刪）。新增禁語直接往下加一列。
const BANNED = [
  { re: /放下了/, why: '假釋懷腔（用戶原話：這種講法「太 AI」）' },
  { re: /釋懷了/, why: '假釋懷腔' },
  { re: /下一個人的光/, why: '情感詩／curated' },
  { re: /(添|多)了一分暖/, why: '情感詩' },
  { re: /不是一個人走過/, why: '情感詩' },
  { re: /照亮彼此/, why: '情感詩' },
  { re: /你的消息會陪/, why: '情感詩' },
  { re: /你(可能|可以|也許|說不定|或許)(會)?是第一個/, why: '「當第一個」勸誘框，非真人語氣' },
];

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

if (hits.length) {
  console.error(`✗ 文案 AI 味 ${hits.length} 處（面向使用者的字要像真人；規則見記憶 copy-voice-no-ai-speak）：`);
  for (const h of hits) console.error(`  ${h.f}:${h.line}  「${h.phrase}」— ${h.why}`);
  console.error('\n修法：改寫成真台灣人會打的白話（先自問「真的有人會這樣打字嗎？」）。');
  console.error('確認是誤傷才在 scripts/check-copy-voice.mjs 收斂該條 pattern。');
  process.exit(1);
}
console.log(`✓ check:copy-voice：掃 ${files.length} 個 .astro，無 AI 味禁語`);
