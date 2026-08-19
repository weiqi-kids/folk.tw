// 代表圖與**出處標示**：廟頁（原不變量 1i）與神明頁（原不變量 4d）的判定規則
// 原本是**逐字相同的兩份**（check-rendered.mjs 舊 L346-358 與 L558-570），
// 差別只有訊息前綴。兩份實作＝兩個漂移起點，故收成一支參數化的判定。
//
// 🔴 內政部的照片有兩項義務，缺一即違規：
//    ① 攝影者姓名（著作人格權的姓名表示）必須印在頁面上
//    ② 可點的來源連結（授權條件）必須在頁面上
//    Commons 那批沿用既有作法（出處彙整在 /about），只驗圖與檔案在。
import { escText, escAttr } from '../lib/astro-escape.mjs';

export function checkEntityPhoto(entity, page, ctx, acc, prefix) {
  if (!entity.image?.src) return;
  acc.count('photos');
  if (!page.html.includes(escAttr(entity.image.src))) {
    acc.violate(`${prefix}${entity.id} 有代表圖卻沒渲染（${entity.image.src}）`);
  }
  if (!ctx.exists(`${ctx.DIST}${entity.image.src}`)) {
    acc.violate(`${prefix}${entity.id} 代表圖檔不存在：dist${entity.image.src}`);
  }
  if (/religion\.moi\.gov\.tw/.test(entity.image.source ?? '')) {
    if (!page.html.includes(escText(entity.image.author))) {
      acc.violate(`${prefix}${entity.id} 內政部照片未標示攝影者「${entity.image.author}」（著作人格權）`);
    }
    if (!page.html.includes(escAttr(entity.image.source))) {
      acc.violate(`${prefix}${entity.id} 內政部照片缺可點的來源連結（授權條件）：${entity.image.source}`);
    }
  }
}
