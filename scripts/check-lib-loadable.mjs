#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// src/lib 的模組必須能被 bare node 載入（gate 與匯入器要 import 它們）。
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼有這支（2026-08-20 建，起因是一整輪架構巡檢的共同病灶）：
//
//    本 repo 反覆出現「同一條規則兩份實作」，而且**每一次的直接原因都是同一個**：
//    gate 或匯入器**載不進** `src/lib` 的模組，只好自己複製一份。已知的病例：
//
//      • `scripts/verify-almanac.ts` 複製了 `ganzhi.ts`／`ershiba.ts` 的錨定常數與公式。
//        後果：那支「驗證器」驗的是它自己那份副本——出貨模組的常數漂掉也照樣印 100%。
//      • `scripts/check-source-refs.mjs` 複製了 `text-width.ts` 的 `fullWidth`，
//        而且字元類別寫得不一樣（`[\x00-\x7F]` vs `[\x00-\xff]`），
//        實測「café」一邊算 4 一邊算 5。
//      • `scripts/invariants/zodiac.mjs` 的檔頭直接寫著「`zodiac.ts` 用無副檔名 import，
//        bare node 解析不到，只能複製正則」——**作者自己標註了這個因果**。
//
//    `text-width.ts` 的檔頭記著同一條規則曾同時存在四份。修一份不會讓另一份跟著修，
//    而 gate 與頁面不一致時**不會紅燈，會安靜地放行錯的東西**。
//
//    所以這支擋的不是「複製」這個動作（那沒辦法機械偵測——真實案例的函式**都是不同名的**，
//    正因為不同名才沒人發現），而是擋**造成複製的那個條件**：模組載不進來。
//    載得進來，複製就沒有理由；載不進來，下一個人還是會複製。
//
// ── 兩個會讓模組載不進來的原因（都可修，本檔會指出是哪一種）────────────
//   1. ERR_MODULE_NOT_FOUND ── 相對 import 沒帶副檔名。Vite 補得起來，Node ESM 不會。
//      修法：`from './x'` → `from './x.ts'`（`allowImportingTsExtensions` 由
//      astro/tsconfigs/base 預設開著，型別與 build 都吃）。
//   2. ERR_IMPORT_ATTRIBUTE_MISSING ── import JSON 沒帶 import attributes。
//      修法：`from './x.json'` → `from './x.json' with { type: 'json' }`（Vite 也吃，已實測）。
//
// ⚠️ 這支只驗「載得進來」，不驗「有沒有人真的去 import」。
//    後者沒辦法機械判斷——一支 lib 沒有 gate 消費它是完全正常的。

import { readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newCorpus } from './lib/gate-corpus.mjs';

const ROOT = 'src/lib';

/**
 * 本質上無法被 bare node 載入的模組——**只有一個正當理由**：它相依於 `astro:content`。
 * 那是 Vite 的虛擬模組，不存在於檔案系統，Node 永遠解析不到。
 *
 * 🔴 要加一筆進來，必須是**同一個理由**。若是「沒帶副檔名」或「JSON 少 import attributes」，
 *    那兩種都可修，修它，不要加豁免——加了就是把病灶正常化，而病灶會長出複製品。
 */
const ASTRO_CONTENT_DEPENDENT = {
  'queries.ts': 'import astro:content（Astro content collections 的執行期入口）',
  'birthdays.ts': '透過 ./queries.ts 相依 astro:content',
  'weekly-feed.ts': '透過 ./birthdays.ts → ./queries.ts 相依 astro:content',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT)
  .filter((f) => extname(f) === '.ts' && !f.includes('.test.'))
  .sort();

const corpus = newCorpus('check:lib-loadable');
corpus.track('src/lib 的 .ts 模組', files.length, {
  why: '目錄走訪抓不到檔案時，這支會零覆蓋地印通過',
});

const problems = [];
const exemptUsed = new Set();
let loadable = 0;

for (const f of files) {
  const rel = relative(ROOT, f);
  let err = null;
  try {
    await import(pathToFileURL(join(process.cwd(), f)).href);
  } catch (e) {
    err = e;
  }

  if (!err) {
    loadable += 1;
    if (ASTRO_CONTENT_DEPENDENT[rel]) {
      problems.push(
        `${f} 已經載得動了，但仍列在 ASTRO_CONTENT_DEPENDENT 豁免裡。`
        + '請把它從豁免移除——過期的豁免會讓下一個人以為「這支本來就載不動」而去複製它。',
      );
    }
    continue;
  }

  const code = err.code ?? '';
  if (ASTRO_CONTENT_DEPENDENT[rel]) {
    exemptUsed.add(rel);
    if (code !== 'ERR_UNSUPPORTED_ESM_URL_SCHEME') {
      problems.push(
        `${f} 列在 astro:content 豁免裡，但實際錯誤是 ${code}（不是 ERR_UNSUPPORTED_ESM_URL_SCHEME）。`
        + '豁免只涵蓋 astro:content 那一個理由；這個錯誤是別的原因造成的，而且多半可修。',
      );
    }
    continue;
  }

  const fix = code === 'ERR_MODULE_NOT_FOUND'
    ? '相對 import 少了副檔名 → 改成 `from \'./x.ts\'`'
    : code === 'ERR_IMPORT_ATTRIBUTE_MISSING'
      ? 'import JSON 少了 import attributes → 改成 `from \'./x.json\' with { type: \'json\' }`'
      : code === 'ERR_UNSUPPORTED_ESM_URL_SCHEME'
        ? '相依 astro:content。若確實無法避免，加進 ASTRO_CONTENT_DEPENDENT 並寫明理由'
        : '見上面的錯誤訊息';
  problems.push(`${f} 無法被 bare node 載入（${code || err.message.split('\n')[0]}）。修法：${fix}`);
}

for (const [rel, why] of Object.entries(ASTRO_CONTENT_DEPENDENT)) {
  if (!exemptUsed.has(rel) && !files.some((f) => relative(ROOT, f) === rel)) {
    problems.push(`豁免清單裡的 ${ROOT}/${rel} 已不存在（改名或刪除？）。請一併更新 ASTRO_CONTENT_DEPENDENT。`);
  }
}

problems.push(...corpus.problems());

if (problems.length) {
  console.error(`✗ src/lib 可載入性檢查未通過（${problems.length} 項）：`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\n🔴 為什麼這件事要當 gate：gate 與匯入器載不進 lib 就會自己複製一份，'
    + '\n   而兩份規則各自演化時**不會紅燈，只會安靜地放行錯的東西**。'
    + '\n   完整緣由與已知病例見本檔檔頭。',
  );
  process.exit(1);
}

console.log(
  `✓ src/lib 可載入性通過：${loadable}/${files.length} 支可被 bare node 直接 import`
  + `（${Object.keys(ASTRO_CONTENT_DEPENDENT).length} 支相依 astro:content，已具名豁免）`,
);
