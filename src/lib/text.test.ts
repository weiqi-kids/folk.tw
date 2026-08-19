// src/lib/text.ts 的單元測試 —— 本 repo 第三支測試。
//
// 為何搬到這裡（2026-08-19）：這三條斷言原本住在 scripts/check-rendered.mjs 裡。
// 那支檔案的其他 34 個斷言全都是「dist 產物 ↔ src/data 資料」的比對；這三條
// **完全不讀 dist、也不讀資料**，是對三個純函式的 assert-equal。住在那裡的代價是：
// 要跑這三行 assert，必須先跑完整個 build:release 產出 15,000+ 個檔——
// 回饋週期從毫秒變成分鐘，而這三條 regression 應該在 push 前（甚至存檔時）就紅燈。
//
// 🔴 三個樣本都是**已知事故樣本**，不是隨手編的：
//   ① 無句界時必須用安全刪節號（否則摘要會在句中被硬切）；
//   ② 欄位最外層括號要剝掉（「（梨園祖師）」這種來源寫法）；
//   ③ 既有句末標點要移除（否則接上下一段會變成「。。」——那正是 2026-08-03
//      連續標點事故的同一個破口，只是在另一層）。
//
// 跑法：pnpm test:text（gate manifest 的 fast 層）。
import { excerptAtBoundary, stripOuterParens, withoutTerminalPunctuation } from './text.ts';

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}`); };

// ① 無句界時使用安全刪節號
t('無句界時使用安全刪節號',
  excerptAtBoundary('整個七月結束後才把門口掛燈燒去。下一句。', 6) === '整個七月結…');
t('未超長時原樣返回', excerptAtBoundary('短句', 6) === '短句');
t('有句界時切在句界且不加刪節號',
  excerptAtBoundary('七月結束。下一句。', 6) === '七月結束。');

// ② 移除欄位最外層括號
t('移除欄位最外層括號', stripOuterParens('（梨園祖師）') === '梨園祖師');
t('半形括號同樣剝除', stripOuterParens('(梨園祖師)') === '梨園祖師');
t('多層括號逐層剝除', stripOuterParens('（（梨園祖師））') === '梨園祖師');
t('內層括號不動', stripOuterParens('梨園（祖師）') === '梨園（祖師）');

// ③ 移除既有句末標點（接上下一段時才不會變成「。。」）
t('移除既有句末標點', withoutTerminalPunctuation('典故說明。') === '典故說明');
t('句中標點不動', withoutTerminalPunctuation('甲、乙、丙') === '甲、乙、丙');
t('連續句末標點一併移除', withoutTerminalPunctuation('典故說明。。') === '典故說明');

console.log(`\n${fail === 0 ? '✅' : '❌'} 通過 ${pass}／失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
