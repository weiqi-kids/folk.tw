// C.2 S6 — 廿八宿（方法確定、錨定常數待校準 C.5）
import { ganzhiFromIndex } from './ganzhi';

export const XIU_28 = [
  '角', '亢', '氐', '房', '心', '尾', '箕', // 東方蒼龍
  '斗', '牛', '女', '虛', '危', '室', '壁', // 北方玄武
  '奎', '婁', '胃', '昴', '畢', '觜', '參', // 西方白虎
  '井', '鬼', '柳', '星', '張', '翼', '軫', // 南方朱雀
] as const;

// 值宿 =（JDN + XIU_ANCHOR）mod 28。採通行之「七政廿八宿」值日（同香港天文台/通書）。
// 校準來源（C.5）：以 lunar-javascript（壽星天文曆算法，對齊香港天文台）跨 6 個分散日期
// 交叉驗證，皆得 ANCHOR = 11（見 calibration.test.mjs）。
//   例：2026-06-21=星宿、2024-02-10=氐宿、2000-01-01=胃宿，本公式與之一致。
// 註：早期單一通書站（wannianrili）曾得 13，係採不同廿八宿起例；今以對齊官方曆之
//   lunar-javascript 為準並修正。
export const XIU_ANCHOR = 11;

export function ershiba(jdn: number): string {
  const i = ((jdn + XIU_ANCHOR) % 28 + 28) % 28;
  return XIU_28[i];
}

// 重新導出，方便 index 統一 import
export { ganzhiFromIndex };
