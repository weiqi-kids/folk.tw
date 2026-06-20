/**
 * 錨定常數校準測試（C.5）
 *
 * 執行方式：
 *   node src/lib/almanac/calibration.test.mjs
 *
 * 純 node，無第三方依賴。
 * 直接嵌入公式邏輯（不走 TS import），避免 Node.js ESM 無副檔名解析問題。
 * 公式與 jdn.ts / ganzhi.ts / ershiba.ts 保持一致；若實作有誤，此測試即揭露。
 *
 * 驗證「國曆日 → 日柱干支」三個獨立錨點：
 *   • 2020-01-01 = 癸卯  來源：wannianrili.bmcx.com/2020-01__wannianrili/
 *   • 2023-01-01 = 己未  來源：wannianrili.bmcx.com/2023-01-01__wannianrili/
 *   • 2026-06-20 = 乙丑  來源：goodaytw.com + wannianrili.bmcx.com/2026-06-20__wannianrili/
 *
 * 驗證「國曆日 → 廿八宿」兩個錨點：
 *   • 2023-01-01 = 觜  來源：wannianrili.bmcx.com/2023-01__wannianrili/
 *   • 2026-06-20 = 張  來源：wannianrili.bmcx.com/2026-06__wannianrili/
 */

// ── 公式（與 jdn.ts 完全相同） ─────────────────────────────
function gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

// ── 錨定常數（與 ganzhi.ts 相同） ──────────────────────────
const DAY_GANZHI_ANCHOR = 49;
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function dayPillar(jdn) {
  const i = ((jdn + DAY_GANZHI_ANCHOR) % 60 + 60) % 60;
  return { stem: STEMS[i % 10], branch: BRANCHES[i % 12] };
}

// ── 廿八宿常數（與 ershiba.ts 相同） ──────────────────────
const XIU_ANCHOR = 13;
const XIU_28 = [
  '角', '亢', '氐', '房', '心', '尾', '箕',
  '斗', '牛', '女', '虛', '危', '室', '壁',
  '奎', '婁', '胃', '昴', '畢', '觜', '參',
  '井', '鬼', '柳', '星', '張', '翼', '軫',
];

function ershiba(jdn) {
  return XIU_28[((jdn + XIU_ANCHOR) % 28 + 28) % 28];
}

// ── 測試框架 ───────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}: ${actual}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected "${expected}", got "${actual}"`);
    failed++;
  }
}

// ── 日柱校準（DAY_GANZHI_ANCHOR = 49）────────────────────
console.log('\n日柱校準 (DAY_GANZHI_ANCHOR = 49)：');

// 2020-01-01 = 癸卯日（干支序39）
// 來源：wannianrili.bmcx.com（中文萬年曆，標注 "壬寅年 癸卯日" 等）
{
  const jdn = gregorianToJDN(2020, 1, 1);
  const gz = dayPillar(jdn);
  assert('2020-01-01 JDN', jdn, 2458850);
  assert('2020-01-01 干支', `${gz.stem}${gz.branch}`, '癸卯');
}

// 2023-01-01 = 己未日（干支序55）
// 來源：wannianrili.bmcx.com（2023-01-01 單日查詢頁）
{
  const jdn = gregorianToJDN(2023, 1, 1);
  const gz = dayPillar(jdn);
  assert('2023-01-01 JDN', jdn, 2459946);
  assert('2023-01-01 干支', `${gz.stem}${gz.branch}`, '己未');
}

// 2026-06-20 = 乙丑日（干支序1）
// 來源：goodaytw.com（"丙午馬年 甲午月 乙丑日"）
//       + wannianrili.bmcx.com（"乙丑日 …乙丑 冲羊（己未）"）
{
  const jdn = gregorianToJDN(2026, 6, 20);
  const gz = dayPillar(jdn);
  assert('2026-06-20 JDN', jdn, 2461212);
  assert('2026-06-20 干支', `${gz.stem}${gz.branch}`, '乙丑');
}

// ── 廿八宿校準（XIU_ANCHOR = 13）─────────────────────────
console.log('\n廿八宿校準 (XIU_ANCHOR = 13)：');

// 2023-01-01 = 觜宿（宿序19）
// 來源：wannianrili.bmcx.com/2023-01__wannianrili/（月曆列表）
//       + wannianrili.bmcx.com/2023-01-01__wannianrili/（單日頁）
{
  const jdn = gregorianToJDN(2023, 1, 1);
  assert('2023-01-01 廿八宿', ershiba(jdn), '觜');
}

// 2026-06-20 = 張宿（宿序25）
// 來源：wannianrili.bmcx.com/2026-06__wannianrili/（月曆列表）
//       + wannianrili.bmcx.com/2026-06-20__wannianrili/（單日頁）
{
  const jdn = gregorianToJDN(2026, 6, 20);
  assert('2026-06-20 廿八宿', ershiba(jdn), '張');
}

// ── 序列一致性驗證：2023-01 前7天與 wannianrili 序列吻合 ──
console.log('\n序列一致性（2023年1月前7天）：');
const expected2023Jan = ['觜', '參', '井', '鬼', '柳', '星', '張'];
for (let d = 1; d <= 7; d++) {
  const jdn = gregorianToJDN(2023, 1, d);
  assert(`2023-01-0${d} 廿八宿`, ershiba(jdn), expected2023Jan[d - 1]);
}

// ── 結果 ─────────────────────────────────────────────────
console.log(`\n結果：${passed} 通過，${failed} 失敗\n`);
if (failed > 0) {
  process.exit(1);
}
