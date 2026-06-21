/**
 * 錨定常數校準＋跨源交叉驗證測試（C.5 / C.4-4）
 *
 * 執行：node --experimental-strip-types src/lib/almanac/calibration.test.mjs
 *   （或 node src/lib/almanac/calibration.test.mjs）
 *
 * 策略：嵌入 jdn/ganzhi/ershiba 公式（避免 ESM 無副檔名解析），
 * 並與 lunar-javascript（壽星天文曆算法，對齊香港天文台）跨多個分散日期交叉驗證，
 * 同時保留 wannianrili 之日柱錨點作為第二來源佐證。
 *
 * 結論：DAY_GANZHI_ANCHOR=49、XIU_ANCHOR=11 經兩類獨立來源一致確認。
 */
import { Solar } from 'lunar-javascript';

// ── 公式（與 jdn.ts / ganzhi.ts / ershiba.ts 完全相同）─────────
function gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const DAY_GANZHI_ANCHOR = 49;
function dayPillar(jdn) {
  const i = (((jdn + DAY_GANZHI_ANCHOR) % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}
const XIU_ANCHOR = 11;
const XIU_28 = ['角','亢','氐','房','心','尾','箕','斗','牛','女','虛','危','室','壁','奎','婁','胃','昴','畢','觜','參','井','鬼','柳','星','張','翼','軫'];
function ershiba(jdn) {
  return XIU_28[(((jdn + XIU_ANCHOR) % 28) + 28) % 28];
}

let passed = 0, failed = 0;
function assert(label, actual, expected) {
  if (actual === expected) { passed++; }
  else { console.error(`  ✗ ${label}: 期望 "${expected}", 得 "${actual}"`); failed++; }
}

// ── A. 日柱 — wannianrili 第二來源錨點 ───────────────────────
console.log('\nA. 日柱錨點（wannianrili 佐證，DAY_GANZHI_ANCHOR=49）：');
assert('2020-01-01 JDN', gregorianToJDN(2020, 1, 1), 2458850);
assert('2020-01-01 日柱', dayPillar(gregorianToJDN(2020, 1, 1)), '癸卯');
assert('2023-01-01 日柱', dayPillar(gregorianToJDN(2023, 1, 1)), '己未');
assert('2026-06-20 日柱', dayPillar(gregorianToJDN(2026, 6, 20)), '乙丑');

// ── B. 跨源交叉驗證 — 對 lunar-javascript 多日比對 ───────────
console.log('B. 跨源交叉驗證（lunar-javascript，對齊香港天文台）：');
const SAMPLES = [
  [2020, 1, 1], [2021, 5, 20], [2022, 9, 9], [2023, 1, 1], [2024, 2, 10],
  [2024, 12, 31], [2025, 7, 15], [2026, 6, 21], [2000, 1, 1], [1990, 8, 8],
  [2030, 3, 3], [2018, 11, 11],
];
// lunar-javascript 部分廿八宿回簡體，正規化為繁體後比對
const XIU_NORM = { 虚: '虛', 娄: '婁', 毕: '畢', 参: '參', 张: '張', 轸: '軫' };
const norm = (x) => XIU_NORM[x] ?? x;
for (const [y, m, d] of SAMPLES) {
  const jdn = gregorianToJDN(y, m, d);
  const l = Solar.fromYmd(y, m, d).getLunar();
  assert(`${y}-${m}-${d} 日柱`, dayPillar(jdn), l.getDayInGanZhi());
  assert(`${y}-${m}-${d} 廿八宿`, ershiba(jdn), norm(l.getXiu()));
}

// ── C. 建除公式 — 給真月支時與 lunar-javascript 一致（非交節日）──
console.log('C. 建除公式交叉驗證（非交節日）：');
const JIANCHU = ['建', '除', '滿', '平', '定', '執', '破', '危', '成', '收', '開', '閉'];
function jianchu(monthBranch, dayBranch) {
  const mi = BRANCHES.indexOf(monthBranch), di = BRANCHES.indexOf(dayBranch);
  return JIANCHU[(((di - mi) % 12) + 12) % 12];
}
// lunar-javascript 之建除回簡體，正規化為繁體後比對
const ZHI_NORM = { 闭: '閉', 满: '滿', 执: '執', 开: '開' };
for (const [y, m, d] of SAMPLES) {
  const l = Solar.fromYmd(y, m, d).getLunar();
  if (l.getJieQi()) continue; // 交節日有重值規則，跳過
  const monthBranch = l.getMonthInGanZhi()[1];
  const dayBranch = l.getDayInGanZhi()[1];
  const lib = ZHI_NORM[l.getZhiXing()] ?? l.getZhiXing();
  assert(`${y}-${m}-${d} 建除`, jianchu(monthBranch, dayBranch), lib);
}

// ── D. 四柱邊界（C.4-2）：立春分年、節分月 ───────────────
console.log('D. 四柱邊界 — 立春分年/節分月（C.4-2）：');
{
  const before = Solar.fromYmd(2025, 2, 2).getLunar(); // 立春前
  const onday = Solar.fromYmd(2025, 2, 3).getLunar(); // 立春當日
  assert('2025-02-02 立春前年柱', before.getYearInGanZhiByLiChun(), '甲辰');
  assert('2025-02-03 立春當日年柱', onday.getYearInGanZhiByLiChun(), '乙巳'); // 立春分年
  assert('2025-02-02 節分月（丑月）', before.getMonthInGanZhi()[1], '丑');
  assert('2025-02-03 節分月（寅月）', onday.getMonthInGanZhi()[1], '寅'); // 立春＝正月建寅
}

// ── E. 建除交節重值（C.4-3）：交節日與前一日同值神 ────────
console.log('E. 建除交節重值（C.4-3，2025 驚蟄 3/5）：');
{
  const norm = (z) => (ZHI_NORM[z] ?? z);
  const d4 = norm(Solar.fromYmd(2025, 3, 4).getLunar().getZhiXing());
  const d5 = norm(Solar.fromYmd(2025, 3, 5).getLunar().getZhiXing()); // 驚蟄交節
  const d6 = norm(Solar.fromYmd(2025, 3, 6).getLunar().getZhiXing());
  assert('3-4 建除', d4, '破');
  assert('3-5 交節日建除（重值＝前一日）', d5, '破'); // 交節重值：與前一日同神
  assert('交節重值成立（3-4=3-5）', d4 === d5, true);
  assert('3-6 建除（重值後續行）', d6, '危');
}

console.log(`\n結果：${passed} 通過，${failed} 失敗\n`);
if (failed > 0) process.exit(1);
