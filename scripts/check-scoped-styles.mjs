#!/usr/bin/env node
// 部署 gate：全站攔「Astro scoped <style> 套不到 client JS 注入 DOM」這個 bug 類別。
//
// 背景（2026-07-17 /qiugian/[slug] 事故）：元件一般 <style> 的每條規則會被 Astro 編譯成帶
// [data-astro-cid-xxx] 的 scope 形式，只有 build 時就在模板裡的元素才帶那屬性。client <script>
// 用 innerHTML / createElement 動態產生的元素不帶 scope 屬性 → 那批 scoped 規則對它們完全不命中，
// 靜默退回瀏覽器預設樣式（例：抽籤四句籤詩 vertical-rl 失效、擠成一橫行）。不會報錯、極難發現。
//
// 偵測原理（純原始碼靜態分析，逐 .astro 檔、同檔比對）：
//   注入類名 = client <script> 內「class="..."（innerHTML 字面）」＋「.className='...'（createElement）」出現的 class
//   scoped 類名 = 非 is:global 的 <style> 裡、且未被 :global(...) 包住的 class 選擇器
//   違規 = 注入類名 ∩ scoped 類名 − 全域類名（is:global 區塊 + :global() 內的 class）
// 命中即 exit 1 → deploy.yml build job 失敗 → 不部署。
//
// 修法（房規）：把「給注入 DOM 用」的規則移到 <style is:global>，並以其靜態容器 id 命名空間收斂
//   （如 #result / #joys），避免全域外洩；色彩/字級續用 global.css 的 OKLCH token 與 --text-*。
// 用法：`node scripts/check-scoped-styles.mjs`（CI 已串在 build gate；本機 pnpm check:scoped-styles）。
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

// 從一段 CSS 抽出 class 選擇器 token（.foo）。`.4rem` 這類數值不會誤中（點後須為字母/底線）。
function classesInCss(css) {
  return new Set((css.match(/\.[A-Za-z_][\w-]*/g) ?? []).map((s) => s.slice(1)));
}

// 分離某檔的 scoped / global class 集合。
function styleClasses(src) {
  const scoped = new Set();
  const global = new Set();
  const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = styleRe.exec(src))) {
    const isGlobal = /\bis:global\b/.test(m[1]);
    const body = m[2];
    if (isGlobal) {
      for (const c of classesInCss(body)) global.add(c);
      continue;
    }
    // scoped 區塊內：先把 :global(...) 內的 class 記為 global 並自本體移除，其餘才算 scoped。
    let rest = body;
    const gRe = /:global\(([^)]*)\)/g;
    let g;
    while ((g = gRe.exec(body))) for (const c of classesInCss(g[1])) global.add(c);
    rest = rest.replace(gRe, ' ');
    for (const c of classesInCss(rest)) scoped.add(c);
  }
  return { scoped, global };
}

// 從 client <script> 抽出「動態注入 DOM」用到的 class（class="..." 與 .className='...'）。
// 跳過 type="application/json" / ld+json 這類資料 script（非 client JS）。
function injectedClasses(src) {
  const out = new Set();
  // 同時處理自閉合 <script .../>（如 type="application/json" set:html=.../>）與 <script>…</script>。
  // 若不處理自閉合，正則會從自閉合 tag 一路吞到後面主 script 的 </script>，把主 script 內容
  // 誤併進被跳過的 json 區塊 → 假陰性（gate 形同虛設）。(2026-07-17 反向測試抓到)
  const scriptRe = /<script([^>]*?)(?:\/>|>([\s\S]*?)<\/script>)/g;
  let m;
  while ((m = scriptRe.exec(src))) {
    const attrs = m[1];
    const body = m[2];
    if (body === undefined) continue; // 自閉合，無內容
    if (/type\s*=\s*["'][^"']*json[^"']*["']/i.test(attrs)) continue;
    // innerHTML / insertAdjacentHTML 字面裡的 class="..."（含反引號模板）
    for (const cm of body.matchAll(/class\s*=\s*["'`]([^"'`]+)["'`]/g))
      for (const c of cm[1].trim().split(/\s+/)) if (c) out.add(c);
    // createElement 後的 .className = '...'
    for (const cm of body.matchAll(/\.className\s*=\s*["'`]([^"'`]+)["'`]/g))
      for (const c of cm[1].trim().split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const violations = [];
let scanned = 0;

for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  // 先剝 HTML 註解：註解裡若出現字面 <style>/<script>/</style> 會被標籤正則誤判為真標籤，
  // 把後面真正的區塊併吞、錯判 scoped/global（2026-07-17 反向測試抓到本 checker 的假陰性）。
  const src = raw.replace(/<!--[\s\S]*?-->/g, ' ');
  if (!src.includes('<script')) continue; // 無 client script → 不可能有此坑
  scanned++;
  const { scoped, global } = styleClasses(src);
  const injected = injectedClasses(src);
  const bad = [...injected].filter((c) => scoped.has(c) && !global.has(c)).sort();
  for (const c of bad) violations.push({ file: f, cls: c });
}

if (violations.length === 0) {
  console.log(`✓ scoped 樣式檢查通過：掃 ${files.length} 個 .astro（其中 ${scanned} 個含 client script），無 scoped 規則套不到 JS 注入 DOM 的情形。`);
  process.exit(0);
}

console.error(`✗ scoped 樣式檢查失敗：${violations.length} 處 class 被 scoped <style> 樣式化，卻由 client JS 注入 DOM（scope 屬性缺失 → 樣式不會套用）。`);
console.error(`  修法：把該規則移到 <style is:global> 並以靜態容器 id 命名空間收斂（如 #result .foo{…}）。`);
for (const v of violations.slice(0, 40)) console.error(`  ✗ ${v.file}：.${v.cls}`);
if (violations.length > 40) console.error(`  …另有 ${violations.length - 40} 處`);
process.exit(1);
