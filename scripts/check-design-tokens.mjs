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

// ── 第 3 條：var(--x) 必須真的存在（2026-08-08 立）────────────────────────────────
// 病灶：打錯／自創 token 名稱，CSS 不會報錯，那一整條宣告只是**安靜失效**。
// 2026-08-08 全站掃出 8 處：`--muted`（正確是 --ink-soft，5 處）、`--rule`（--line，2 處）、
// `--surface-soft`（--paper-2，1 處）。後果不是「顏色跑掉」而是「東西不見」——
// /zodiac/ 那十二格的 `border: 1px solid var(--rule)` 整條無效 → **完全沒有邊框**，
// 使用者根本看不出可以點；/zodiac/<生肖> 的「就是你」那幾列底色也一樣沒出現。
// 前兩道 gate（硬編顏色、硬編 font-size）都掃不到這種，因為它形式上完全合規。
const DEFINED = new Set();
for (const f of ['src/styles/variables.css', 'src/styles/global.css'])
  for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) DEFINED.add(m[1]);

const files = ROOTS.flatMap((r) => walk(r));
const colorViolations = [];
const fontViolations = [];
const tokenViolations = [];

for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  // 同檔自訂的區域 token（含由 inline style 屬性餵進來的，如 nav 的 --nav-cols）視為已定義。
  const local = new Set([...raw.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
  const css = styleBodies(raw);
  // 註解裡提到某個 token 名稱（例如記錄「這裡原本寫錯成 var(--rule)」）不算引用，先剝掉再掃。
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of cssNoComments.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    const name = m[1];
    if (DEFINED.has(name) || local.has(name)) continue;
    tokenViolations.push({ file: f, name });
  }
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

if (colorViolations.length === 0 && fontViolations.length === 0 && tokenViolations.length === 0) {
  console.log(
    `✓ 設計 token 檢查通過：掃 ${files.length} 個 .astro，<style> 內無硬編顏色、font-size 全用 var(--text-*)、var(--…) 皆已定義。`,
  );
  process.exit(0);
}

if (tokenViolations.length) {
  console.error(`✗ 引用了不存在的 token ${tokenViolations.length} 處（宣告會安靜失效，東西直接不見）：`);
  for (const v of tokenViolations.slice(0, 30)) console.error(`  ✗ ${v.file}：var(${v.name})`);
  console.error('  → 對到 src/styles/variables.css 既有的名稱（如 --ink-soft / --line / --paper-2），或先在 token 檔定義。');
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
