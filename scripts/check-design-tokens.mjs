#!/usr/bin/env node
// 部署 gate：守設計系統房規（見 memory design-system-tokens）——CSS 一律用 global.css 的
// OKLCH 調色盤與 --text-* 字級，禁自編 hex/rgb/hsl 顏色與硬編 font-size。只掃 .astro 的
// <style> 區塊內容（不掃 HTML 屬性，如 <meta name="theme-color"> 規範上只能用字面色，屬合法例外）。
//
// 兩層規則（皆硬 gate，命中即 exit 1 → deploy.yml build job 失敗 → 不部署）：
//   1) 顏色：<style> 內出現 #hex / rgb() / rgba() / hsl() / hsla() 一律違規 → 改用 var(--…) token
//      或 oklch()／color-mix(in oklch, …)。
//   2) font-size：<style> 內 font-size 必須是 var(--text-*)；任何硬編數值（rem/px/em）皆違規 →
//      對到最近／語意相符的 --text-* 階梯（xs .8／sm .9／base 1.1／lg 1.3／xl 1.6／2xl 2／3xl 2.5）。
//
// 沿革：2026-07-17 首版曾用「基線」豁免既有 69 處非階梯值；2026-07-18 用戶要求「不要有基線暫時
//      放行」，已把 69 處全數收斂到 token（語意對映）、刪除基線，本 gate 即為零硬編硬性檢查。
// 用法：`node scripts/check-design-tokens.mjs`（CI build gate；本機 pnpm check:design-tokens）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/pages', 'src/components', 'src/layouts'];

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
const fontViolations = [];

for (const f of files) {
  const css = styleBodies(readFileSync(f, 'utf8'));
  if (!css.trim()) continue;

  // 顏色：hex / rgb / hsl（oklch、color-mix、var 皆合規，不在此列）
  for (const cm of css.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\s*\(/g))
    colorViolations.push({ file: f, token: cm[0] });

  // font-size：必須 var(--…)；含數值即硬編
  for (const cm of css.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
    const val = cm[1].trim();
    if (val.includes('var(') || !/[0-9]/.test(val)) continue; // token 或 inherit/keyword
    fontViolations.push({ file: f, val });
  }
}

if (colorViolations.length === 0 && fontViolations.length === 0) {
  console.log(`✓ 設計 token 檢查通過：掃 ${files.length} 個 .astro，<style> 內無硬編顏色、font-size 全用 var(--text-*)。`);
  process.exit(0);
}

if (colorViolations.length) {
  console.error(`✗ 硬編顏色 ${colorViolations.length} 處（<style> 內禁 hex/rgb/hsl，改 var(--…)／oklch／color-mix）：`);
  for (const v of colorViolations.slice(0, 30)) console.error(`  ✗ ${v.file}：${v.token}`);
}
if (fontViolations.length) {
  console.error(`✗ 硬編 font-size ${fontViolations.length} 處（必須用 var(--text-*)）：`);
  for (const v of fontViolations.slice(0, 30)) console.error(`  ✗ ${v.file}：font-size: ${v.val}`);
}
process.exit(1);
