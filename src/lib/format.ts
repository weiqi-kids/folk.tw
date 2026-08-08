// 數字呈現的唯一入口。
//
// 規則：四位數以上的計數一律加千分位（10704 → 10,704）。2026-08-08 用戶指出
// /temples/ 的「收錄全台 10704 間廟宇」該是 10,704——整數字串黏成一團，人要停下來數位數。
//
// 🔴 **不要用 `n.toLocaleString()`**（本檔取代掉的就是它）：不帶 locale 時取執行環境的預設語系，
//    本機、CI、未來換 runtime 可能給出不同結果（`10,704` / `10 704` / `10.704`），
//    而這些數字會進 meta description 與頁面正文，還被 check:rendered 逐頁比對——
//    環境一飄就是整批 gate 紅燈，而且很難看出原因。這裡自己分組，輸出與環境無關。
//
// ⚠️ 頁面與 gate 必須用同一支：`scripts/check-rendered.mjs` 也 import 這個檔來組期望字串
//    （它跑在 --experimental-strip-types 底下，讀得動 .ts）。改這裡等於同時改兩邊，
//    不會出現「頁面加了逗號、gate 還在找沒逗號的字串」。
export const num = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
