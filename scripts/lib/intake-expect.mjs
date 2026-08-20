// ═══════════════════════════════════════════════════════════════════════════
// manifest `expect` 的判定：唯一入口
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼抽出來（2026-08-20）：v18 送出去的 14 個 knowledge-list job，expect.contains
//    寫成未跳脫的 `?ci=2&cid=`，而來源 HTML 逐字輸出 `?ci=2&amp;cid=` → 14 個 job 全部
//    驗不過、一個 byte 都沒落地，而且**基準檔就躺在本機 inbox 裡**（cid=3，實測未跳脫
//    0 次／跳脫 212 次）。也就是說那條規則從來沒有被任何東西驗證過就發給對方了。
//    抽成共用模組是為了讓 scripts/check-manifest-expect.mjs 能拿**同一份判定**去回測，
//    而不是再寫一份「差不多的」邏輯——那正是本 repo 反覆記著的「同一事實兩個真實來源」。
//
// 消費端：scripts/intake-ingest.mjs（收件時驗）、scripts/check-manifest-expect.mjs（發布前回測）。

import { existsSync, statSync } from 'node:fs';

/**
 * manifest 的 expect 檢查（與台灣端同一份規則，雙重把關）。回違規字串陣列。
 *
 * ⚠️ 2026-07-30 實測踩到的坑：光有 `min_bytes` 絕對下限**擋不住殘檔**。
 * 當時投一個 5 MB 的截斷檔（真檔 6.27 MB），`min_bytes: 4000000` 通過、前 2MB 也含
 * `<OpenData_3>`，於是**覆蓋掉完整的上位檔**（12,419 筆 → 只剩前 5 MB）。
 * 靠 archive 才救回來。故新增兩道相對檢查——它們才是真正擋殘檔的：
 *   ① `not_smaller_than_current_pct`：新檔不得比現有上位檔小超過 N%
 *      （MOI 月更是增修，正常不會驟減；驟減＝傳輸截斷或來源出錯）
 *   ② `min_occurrences`：記錄筆數下限（整檔計數，例如 `<OpenData_3>` 至少 12,000 筆）
 *
 * `meta` ＝該檔的 .meta.json（台灣端記的 HTTP 狀態）。給了才驗 `http_status`／`http_status_any_of`；
 * 沒給就跳過——側檔不是每個檔都有，缺側檔另有專門的判定，不在這裡當成內容錯誤。
 * 🔴 `magic_any_of` 是 v17 為 photos job 加的，**只能在這裡實作、不能只信台灣端**：
 *    它擋的是「302 導回 200 的 HTML 頁被當成合格圖片」，而 header 是來源說了算、bytes 不會騙人。
 */
export function checkExpect(buf, expect, currentPath, meta = null) {
  const bad = [];
  if (!expect) return bad;

  // `record_status_only`：這個 job 的目的是「記錄那邊回什麼」，不是取得特定內容。
  // 例：religion.moi.gov.tw/robots.txt 實回 404——404 本身是有效答案（未宣告抓取限制），
  // 不該當失敗。故跳過所有內容檢查，由呼叫端把 meta.json 的狀態印出來供人判讀。
  if (expect.record_status_only) return bad;

  if (expect.min_bytes != null && buf.length < expect.min_bytes) {
    bad.push(`大小 ${buf.length}B < 絕對下限 ${expect.min_bytes}B（疑為錯誤頁）`);
  }

  // 台灣端記的 HTTP 狀態（有 meta 才驗）。同一份規則兩端各驗一次＝本檔的「雙重把關」前提。
  const okStatus = expect.http_status_any_of ?? (expect.http_status != null ? [expect.http_status] : null);
  if (okStatus && meta?.http_status != null && !okStatus.includes(meta.http_status)) {
    bad.push(`HTTP ${meta.http_status} 不在預期 ${okStatus.join('／')} 內`);
  }

  // 檔案開頭實際 bytes（JPEG FFD8FF／PNG 89504E470D0A1A0A），命中任一即過。二進位檔專用。
  if (expect.magic_any_of?.length) {
    const head = buf.subarray(0, 32).toString('hex').toUpperCase();
    if (!expect.magic_any_of.some((m) => head.startsWith(String(m).toUpperCase()))) {
      bad.push(`檔頭 ${head.slice(0, 16)}… 不符 magic ${expect.magic_any_of.join('／')}（疑為錯誤頁冒充二進位檔）`);
    }
  }

  // 🔴 magic 之後才轉字串：二進位檔轉 utf8 是垃圾，contains 一定失敗——
  //    但那類 job 本來就不該宣告 contains（v17 photos 用 magic_any_of 取代），這裡只是不浪費。
  if (expect.contains == null && !expect.min_occurrences && expect.not_smaller_than_current_pct == null) return bad;

  const text = buf.toString('utf8');

  if (expect.contains && !text.includes(expect.contains)) {
    bad.push(`找不到預期字串「${expect.contains}」`);
  }

  // ① 相對現有檔不得驟減（擋截斷；現有檔不存在則跳過＝首次收件）
  const pct = expect.not_smaller_than_current_pct;
  if (pct != null && currentPath && existsSync(currentPath)) {
    const cur = statSync(currentPath).size;
    const floor = Math.floor(cur * (pct / 100));
    if (buf.length < floor) {
      bad.push(
        `大小 ${buf.length}B 比現有 ${cur}B 少於 ${pct}%（下限 ${floor}B）＝疑為傳輸截斷，拒收以保護現有資料`,
      );
    }
  }

  // ② 記錄筆數下限（整檔計數，比「前 2MB 含某字串」可靠得多）
  if (expect.min_occurrences) {
    for (const [needle, min] of Object.entries(expect.min_occurrences)) {
      const n = text.split(needle).length - 1;
      if (n < min) bad.push(`「${needle}」只出現 ${n} 次 < 下限 ${min}（疑為殘檔）`);
    }
  }

  return bad;
}
