// C.2 S6 — 廿八宿（方法確定、錨定常數待校準 C.5）
import { ganzhiFromIndex } from './ganzhi';

export const XIU_28 = [
  '角', '亢', '氐', '房', '心', '尾', '箕', // 東方蒼龍
  '斗', '牛', '女', '虛', '危', '室', '壁', // 北方玄武
  '奎', '婁', '胃', '昴', '畢', '觜', '參', // 西方白虎
  '井', '鬼', '柳', '星', '張', '翼', '軫', // 南方朱雀
] as const;

// 值宿 =（JDN + XIU_ANCHOR）mod 28。
// 校準來源（C.5）：以下兩個日期交叉驗證，兩者均得 ANCHOR = 13：
//   • 2023-01-01 = 觜宿（宿序19）：來源 wannianrili.bmcx.com，JDN=2459946
//   • 2026-06-20 = 張宿（宿序25）：來源 wannianrili.bmcx.com，JDN=2461212
// 計算：(宿序 − JDN) mod 28，兩者皆得 13。
// 注意：另一來源 huangli.com 在 2026-06-20 顯示「危」，但經分析是建除十二神而非廿八宿，
// 不適用本公式。wannianrili.bmcx.com 廿八宿序列（1月、6月各一）內部一致，已採信。
export const XIU_ANCHOR = 13;

export function ershiba(jdn: number): string {
  const i = ((jdn + XIU_ANCHOR) % 28 + 28) % 28;
  return XIU_28[i];
}

// 重新導出，方便 index 統一 import
export { ganzhiFromIndex };
