// UploadFileID → 站上哪一間廟：**這是唯一的一份對映邏輯**，別再寫第二套。
//
// 為什麼抽出來：`import-temple-history.mjs` 的檔頭寫著「不另外產一個對映檔進 repo，
// 多一份就多一個會漂的真實來源」。那條規矩對「檔案」成立，對「程式碼」一樣成立——
// 2026-08-07 要讓 `gen-intake-urls-yange.mjs` 也能判斷「這個 UploadFileID 屬於的廟站上有沒有」，
// 若各自實作一份消歧，兩邊遲早會漂，清單就會濾掉匯入器其實對得上的項目。
//
// 🔴 對映只能靠**廟名＋地址**：MOI 的 UploadFileID 與 temple.xml 的編號是兩套獨立流水號，
//    temple.xml 也沒有 ReligionID 欄。這不是懶得找更好的鍵，是真的沒有。
// 🔴 個資：結果頁每列都帶電話與負責人，本模組只取廟名與行政區／地址兩格，其餘不碰。

import { readFileSync, existsSync, readdirSync } from 'node:fs';
// 合併鍵正規化與 entity 解碼的**唯一定義**在 lib/dataset-commit.mjs（2026-08-19 收斂，
// 抽出前 norm 有四份、entity 解碼有五份）。這裡只是轉出給既有 import 路徑用，不要在此重寫。
import { norm, decodeEntities as unescapeHtml } from './dataset-commit.mjs';

export { norm };

// 🔴 **欄位順序不固定，不可用位置索引**（2026-08-06 實測換來的）：
//   有的列是 [廟名, 主管機關, 縣市鄉鎮, 地址, 電話, …]
//   有的列是 [廟名, 主管機關, **主祀神**, 縣市鄉鎮, 地址, …]  ← 多一欄，整排錯位
//   初版寫死 cells[2]+cells[3]，第二種列就把「主祀神＋縣市鄉鎮」當成地址，對映必然失敗。
//   改成**認形狀不認位置**：找出長得像「○○縣/市○○鄉/鎮/市/區」的那一格，它的下一格才是地址。
const TOWN_CELL = /^..[縣市].{1,4}?[鄉鎮市區]$/;

/**
 * 從查詢結果頁建 `UploadFileID-IndexID` → { name, district }。
 * @param {string} listDir 結果頁目錄（page-<N>.html）
 * @param {(idx: string) => boolean} keepIdx 要收哪些 IndexID
 */
export function buildOwnerMap(listDir, keepIdx = () => true) {
  const owner = new Map();
  const files = existsSync(listDir) ? readdirSync(listDir).filter((f) => /^page-\d+\.html$/.test(f)) : [];
  for (const f of files.sort()) {
    const html = readFileSync(`${listDir}/${f}`, 'utf8');
    for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      if (!/main=['"]\d+['"]/.test(row)) continue;
      const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map((c) =>
        unescapeHtml(c.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
      );
      const name = cells.find((c) => c) ?? '';
      const ti = cells.findIndex((c) => TOWN_CELL.test(norm(c)));
      const district = ti >= 0 ? `${cells[ti]}${cells[ti + 1] ?? ''}`.replace(/\s+/g, '') : '';
      if (!name) continue;
      for (const m of row.matchAll(/<a[^>]*main=['"](\d+)['"][^>]*>/g)) {
        const idx = m[0].match(/idx=['"](\d+)['"]/)?.[1];
        if (!idx || !keepIdx(idx)) continue;
        owner.set(`${m[1]}-${idx}`, { name, district });
      }
    }
  }
  return { owner, pages: files.length };
}

/** 縣市＋鄉鎮（地址前綴），用來消歧。 */
export const regionKey = (d) => norm(d).match(/^..[縣市].{1,4}?[鄉鎮市區]/)?.[0] ?? '';

/**
 * 三段消歧：廟名唯一 → 行政區 → 完整地址。對不上就回 null，寧缺勿假。
 * 回傳 { resolve(key), stat }；stat 各欄位由呼叫端印報表。
 */
export function makeResolver(owner, temples) {
  const byName = new Map();
  const byAddr = new Map();
  for (const t of temples) {
    const n = norm(t.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(t);
    const a = norm(t.district);
    if (!byAddr.has(a)) byAddr.set(a, []);
    byAddr.get(a).push(t);
  }
  const stat = { noOwner: 0, notInDb: 0, byUnique: 0, byRegion: 0, byAddr: 0, unresolved: 0 };

  function resolve(key) {
    const o = owner.get(key);
    if (!o) { stat.noOwner++; return null; }
    const cands = byName.get(norm(o.name)) ?? [];
    if (cands.length === 0) { stat.notInDb++; return null; }
    if (cands.length === 1) { stat.byUnique++; return cands[0]; }
    const want = regionKey(o.district);
    const narrowed = want ? cands.filter((t) => regionKey(t.district) === want) : [];
    if (narrowed.length === 1) { stat.byRegion++; return narrowed[0]; }
    const exact = (byAddr.get(norm(o.district)) ?? []).filter((t) => norm(t.name) === norm(o.name));
    if (exact.length === 1) { stat.byAddr++; return exact[0]; }
    // 「全台有同名廟，但**該鄉鎮一間都沒有**」＝我們根本沒收錄這一間，不是消歧失敗。
    // 分開計數才看得出真正需要處理的量。
    if (want && narrowed.length === 0) { stat.notInDb++; return null; }
    stat.unresolved++;
    return null;
  }
  return { resolve, stat };
}
