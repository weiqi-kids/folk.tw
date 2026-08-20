// 🔴 **這個檔一行邏輯都沒有。實作全部在 `./calendar-date.ts`，要改就改那支。**
//
// 為什麼還留著（2026-08-20）：本檔在 2026-08-20 更名為 `calendar-date.ts`
// ——它早就不只管農曆（同時管國曆月日、節氣、回曆），而新增的 `CalendarDate`
// discriminated union 帶著 `cal: 'hijri'` 住在一個叫「lunar-date」的檔裡，
// 正是本 repo 一再被燒到的「一個名字裝兩種東西」。
//
// 但 `src/lib/lunar-date.ts` 這個**路徑**在頁面、OG 產製與 gate 的不變量裡都有人寫死，
// 而其中一部分（`scripts/invariants/*.mjs`）當時正被另一個任務改動中，
// 同一回合去動會撞車。所以路徑先原地保留成純轉出，改名的收尾另一回合做。
//
// 👉 **移除條件**：所有 import 改指 `./calendar-date.ts` 之後即可刪除本檔。
//    還有誰在用（**不要把數字寫進這裡，跑指令**）：
//      grep -rn "lib/lunar-date" --include=*.ts --include=*.astro --include=*.mjs src scripts
//
// ⚠️ 不要在這裡加任何東西——加了就會變成第二份會漂移的實作，那正是本檔要避免的。
export * from './calendar-date.ts';
