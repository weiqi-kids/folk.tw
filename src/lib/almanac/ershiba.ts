// C.2 S6 — 廿八宿（方法確定、錨定常數待校準 C.5）
import { ganzhiFromIndex } from './ganzhi';

export const XIU_28 = [
  '角', '亢', '氐', '房', '心', '尾', '箕', // 東方蒼龍
  '斗', '牛', '女', '虛', '危', '室', '壁', // 北方玄武
  '奎', '婁', '胃', '昴', '畢', '觜', '參', // 西方白虎
  '井', '鬼', '柳', '星', '張', '翼', '軫', // 南方朱雀
] as const;

// 值宿 =（JDN + XIU_ANCHOR）mod 28。
// ⚠️ 待校準（C.5）：XIU_ANCHOR 須以一已知值宿日校準後鎖定 → ershiba verified=false 直到校準。
export const XIU_ANCHOR = 0; // 佔位，待以官方資料校準

export function ershiba(jdn: number): string {
  const i = ((jdn + XIU_ANCHOR) % 28 + 28) % 28;
  return XIU_28[i];
}

// 重新導出，方便 index 統一 import
export { ganzhiFromIndex };
