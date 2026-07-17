#!/usr/bin/env node
// 部署 gate：守設計系統房規（見 memory design-system-tokens）——CSS 一律用 global.css 的
// OKLCH 調色盤與 --text-* 字級，禁自編 hex/rgb/hsl 顏色與硬編 font-size。只掃 .astro 的
// <style> 區塊內容（不掃 HTML 屬性，如 <meta name="theme-color"> 規範上只能用字面色，屬合法例外）。
//
// 兩層規則：
//   1) 顏色（硬 gate）：<style> 內出現 #hex / rgb() / rgba() / hsl() / hsla() 一律違規 → 改用
//      var(--…) token 或 oklch()／color-mix(in oklch, …)。目前全站已清為 0。
//   2) font-size（基線 gate）：<style> 內 font-size 若非 var(--text-*) 即為硬編。全站現存約 69 處
//      「非階梯值」（0.85/1.05/0.82rem…，硬套 token 會改變字級、涉及 33 頁），經用戶決策採「等值先換
//      ＋基線擋新」：等值者已換 var()，其餘記進 scripts/design-tokens-baseline.json；gate 只擋「新增／
//      超出基線」的硬編 font-size，不強迫改動現有外觀。現有債日後想清再逐頁清（清完基線會自然縮小）。
//
// 用法：`node scripts/check-design-tokens.mjs`（CI build gate 前跑）；
//       `node scripts/check-design-tokens.mjs --update-baseline` 重建基線（清債或蓄意新增後）。
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/pages', 'src/components', 'src/layouts'];
const BASELINE_PATH = 'scripts/design-tokens-baseline.json';
const update = process.argv.includes('--update-baseline');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.astro')) out.push(p);
  }
  return out;
}

// 取出某檔所有 <style> 區塊的 CSS 內容（先剝 HTML 註解，避免註解裡字面標籤誤判）。
function styleBodies(src) {
  const clean = src.replace(/<!--[\s\S]*?-->/g, ' ');
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(clean))) out.push(m[1]);
  return out.join('\n');
}

const files = ROOTS.flatMap((r) => walk(r));
const colorViolations = [];
const fontCounts = {}; // file → { "0.85rem": n }

for (const f of files) {
  const css = styleBodies(readFileSync(f, 'utf8'));
  if (!css.trim()) continue;

  // 顏色：hex / rgb / hsl（oklch、color-mix、var 皆合規，不在此列）
  for (const cm of css.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\s*\(/g))
    colorViolations.push({ file: f, token: cm[0] });

  // font-size：非 var(--…) 且含數值即硬編
  for (const cm of css.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
    const val = cm[1].trim();
    if (val.includes('var(') || !/[0-9]/.test(val)) continue; // token 或 inherit/keyword
    (fontCounts[f] ??= {})[val] = ((fontCounts[f] ??= {})[val] ?? 0) + 1;
  }
}

if (update) {
  writeFileSync(BASELINE_PATH, JSON.stringify(fontCounts, null, 2) + '\n');
  const total = Object.values(fontCounts).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
  console.log(`✓ 已更新 font-size 基線：${Object.keys(fontCounts).length} 檔、共 ${total} 處硬編記入 ${BASELINE_PATH}。`);
  if (colorViolations.length) console.error(`⚠ 注意：仍有 ${colorViolations.length} 處硬編顏色（基線不涵蓋顏色，顏色為硬 gate，請一併清除）。`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
// 新增/超出基線的 font-size 硬編
const newFonts = [];
for (const [f, counts] of Object.entries(fontCounts)) {
  for (const [val, n] of Object.entries(counts)) {
    const allowed = baseline[f]?.[val] ?? 0;
    if (n > allowed) newFonts.push({ file: f, val, extra: n - allowed });
  }
}

const ok = colorViolations.length === 0 && newFonts.length === 0;
if (ok) {
  const based = Object.values(baseline).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
  console.log(`✓ 設計 token 檢查通過：<style> 內無硬編顏色；font-size 無新增硬編（現有 ${based} 處在基線內、豁免）。`);
  process.exit(0);
}

if (colorViolations.length) {
  console.error(`✗ 硬編顏色 ${colorViolations.length} 處（<style> 內禁 hex/rgb/hsl，改 var(--…)／oklch／color-mix）：`);
  for (const v of colorViolations.slice(0, 30)) console.error(`  ✗ ${v.file}：${v.token}`);
}
if (newFonts.length) {
  console.error(`✗ 新增硬編 font-size ${newFonts.reduce((s, v) => s + v.extra, 0)} 處（請改 var(--text-*)；若蓄意且合理，跑 --update-baseline 重建基線）：`);
  for (const v of newFonts.slice(0, 30)) console.error(`  ✗ ${v.file}：font-size: ${v.val}（超出基線 ${v.extra}）`);
}
process.exit(1);
