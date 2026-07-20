// 時事祈福文案硬守門（純函式、無副作用，可被 orchestrate/news-scan/followup 安全 import）。
//
// 鐵則（用戶 2026-07-20 定，session 結束不得回頭）：面向使用者的祈福頁文案
//   **絕不出現具體傷亡／災損數字**（幾人罹難、幾棟受損、幾人疏散、金額…）。
//   理由：那些數字未經機器複驗、且隨救援變動；本站只做「為平安／復原祈福」，不是災情速報。
//   具體事實一律留給「有逐筆掛源、可查證」的後續發展時間軸；即便如此，時間軸也走同一守門不寫死數字。
//
// 這是**機器強制的最後一道**，補 LLM prompt 軟約束之不足：prompt 叫它別寫、它偶爾仍寫，
//   本守門在寫入 topical.json 前攔下，確保「數字」永遠不會上線。改動務必跑 lib 自帶自測（見檔尾註）。

// 數字 token：阿拉伯/全形數字，或中文數字串（含 約/逾/近/超過/達 等常見前綴會一起被涵蓋）。
const NUM = '(?:[0-9０-９]+|[一二三四五六七八九十百千萬兩零]+)';
// 傷亡／災損量詞：只收「講傷亡與災損規模」會用的量詞；**刻意不含 日/月/時/分/個/起/橋/地** 等，
//   以免誤傷日期（七月十七日）、地名（烏江三橋）、次數（第三個作業面）等正當用字。
const UNIT = '(?:人|名|死|傷|亡|罹難|失蹤|失聯|受困|受傷|死亡|傷亡|遇難|棟|戶|間|所|處|座|輛|艘|架|億|萬|元|公頃|平方公里)';
const BANNED_NUM = new RegExp(NUM + '\\s*' + UNIT);

/** 文案是否含「具體傷亡／災損數字」。true＝違規、須攔下。 */
export function hasBannedNumber(text) {
  return BANNED_NUM.test(String(text ?? ''));
}

/** 開頁事件文案的無數字保底祈福語（event 觸雷時用它取代，保住頁面、去掉數字）。 */
export const SAFE_EVENT = '願受影響的鄉親都平安、家園早日復原。';

// ── 檔尾自測（node scripts/lib/topical-guard.mjs 直接跑，改守門後務必綠）──────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const banned = ['八人罹難', '造成三十六棟民宅受損', '逾四千四百人一度疏散', '一座教堂受損', '4人受傷', '死亡2人'];
  const ok = ['發生山崩，願受影響的鄉親都平安', '七月十七日發生地震', '烏江三橋一帶', '搜救行動至此告一段落',
    '所幸未造成人員傷亡', '無人罹難', '第三個作業面', '調撥賑災物資協助安置'];
  let pass = true;
  for (const t of banned) if (!hasBannedNumber(t)) { console.error('✗ 應攔未攔:', t); pass = false; }
  for (const t of ok) if (hasBannedNumber(t)) { console.error('✗ 誤傷正當字:', t); pass = false; }
  console.log(pass ? '✓ topical-guard 自測通過（違規全攔、正當字零誤傷）' : '✗ topical-guard 自測失敗');
  process.exit(pass ? 0 : 1);
}
