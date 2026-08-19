// 「Astro 會把這個字串輸出成什麼」的**唯一入口**，給所有比對 dist HTML 的 gate 共用。
//
// 🔴 這裡直接用 **Astro 自己的** escapeHTML（`astro/runtime/server/escape.js`，內部就是
//    html-escaper 的 escape），不是複刻。理由是 2026-08-08 那兩次假紅燈：
//    check-rendered.mjs 原本手寫一份對照表，先漏 `"`（內政部參拜流程有 3 筆自帶半形雙引號，
//    渲染是對的、錯的是檢查），補完當天下一個匯入批次又被 `Dynasty's` 咬（Astro 輸出 `&#39;`）。
//    當時的結論寫得很清楚：**逐字元補是錯的做法**——來源是政府資料，什麼字元都可能出現。
//    那份警語卻沒涵蓋到 check-topical-followup-render.mjs 裡的逐字副本；兩份規則就是漂移的起點。
//    ⚠️ 所以：不要在任何 gate 裡再寫第二份對照表，也不要在這裡「補字元」——
//    要跟的是上游，不是我們的記性。
//
// ⚠️ 這條 import 路徑是 astro 套件的 `./runtime/*` 匯出（package.json exports 有列）。
//    哪天 Astro 改路徑，這裡會**直接 import 失敗**（gate 紅燈、看得見），
//    而不是安靜地回傳過時的跳脫結果——這正是選它而不是複刻的原因。
import { escapeHTML } from 'astro/runtime/server/escape.js';

/** 文字節點的跳脫（Astro 對 `& < > " '` 全部跳脫）。 */
export const escText = (value) => escapeHTML(String(value));

/**
 * 屬性值的跳脫。
 * ⚠️ 目前與 escText 同一份實作，但**維持兩個名字**：屬性值日後若要多處理什麼情形
 * （原註解：「屬性多跳脫引號」），改的是這一支，不該去動文字節點那支。
 */
export const escAttr = (value) => escText(value);
