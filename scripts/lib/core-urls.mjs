// `pnpm notify` 不帶參數時要送的「高槓桿清單」＝**唯一來源**。
//
// 🔴 為什麼不寫成兩份常數陣列：index-ping.mjs 與 indexnow-ping.mjs 各自有一份 CORE，
//    文件早就標了「改一份等於沒改」。但那只擋得住「兩份不一致」，擋不住第二種漂——
//    **新增了模組樞紐卻忘記加進 CORE**。2026-08-07 實查：站上 16 個模組樞紐
//    （src/pages/<模組>/index.astro）只有 6 個在 CORE 裡，/festivals/、/trades/、
//    /scenarios/、/good-days/、/compare/、/qiugian/、/systems/、/allusions/、
//    /medicine-slips/ 全部沒送過。那些頁不是不重要，是加模組的人不會想到要回來改這裡。
//
// 解法：**從檔案系統推導**，新模組一上線就自動進清單，沒有人需要記得。
//    只保留一份明確的額外清單 EXTRA（首頁、about、封存頁這種沒有 <模組>/index.astro 的）。
//
// ⚠️ 尾斜線：Indexing API 送 301 網址等於浪費配額，故一律以 `/` 結尾。
//    （下游 index-ping.mjs 另有機械正規化保底，但這裡先做對。）

import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 沒有 `<模組>/index.astro` 但仍屬高槓桿的固定網址。 */
const EXTRA = ['/', '/about/', '/almanac/archive/'];

/**
 * 站上所有模組樞紐＋EXTRA。
 * @returns {string[]} 以 `/` 開頭與結尾的路徑
 */
export function corePaths() {
  const dir = join(root, 'src/pages');
  const hubs = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'index.astro')))
        .map((d) => `/${d.name}/`)
    : [];
  return [...new Set([...EXTRA, ...hubs])].sort();
}
