// 圖片出處標示的**唯一入口**。
//
// 🔴 為什麼要有這支（2026-08-06）：全站 8 個索引頁各自把標註寫死成
//    「圖：${author}　·　${license}（Wikimedia Commons，詳見關於頁）」。
//    在「所有圖都來自 Commons」的年代那是對的，但 2026-08-06 取得內政部同意後，
//    同一個 `image` 欄位會裝進**內政部的照片**——那句寫死的字會把內政部的照片
//    標成 Wikimedia Commons 的，等於掛錯出處。故收斂成一支，依資料自己判斷。
//
// 🔴 兩種授權的義務不同，別混：
//    · Wikimedia Commons（CC／PD）：要求姓名表示與授權標示。既有作法是 title 提示＋/about 彙整。
//    · 內政部（2026-08-06 同意）：條件是**標示資料來源連結**——
//      提示文字不是連結，所以這類圖**必須在頁面上給出可點的來源連結**，
//      由 `isMoi()` 判斷、呼叫端負責渲染 <a>。少了那個連結就是違反授權。

export type ImageMeta = {
  src: string;
  alt: string;
  author: string;
  license: string;
  license_url?: string;
  source: string;
};

/** 這張圖是不是內政部全國宗教資訊網來的（＝需要可見的來源連結）。 */
export const isMoiImage = (img: Pick<ImageMeta, 'source'>): boolean =>
  /religion\.moi\.gov\.tw/.test(img.source ?? '');

/**
 * 卡片／縮圖用的 title 提示字。
 * ⚠️ 只描述「這張圖是誰的、什麼授權」，**不再寫死平台名**——平台由 source 決定，
 * 而 source 是資料，不是常數。
 */
export const imageCreditTitle = (img: ImageMeta): string =>
  `圖：${img.author}　·　${img.license}${isMoiImage(img) ? '（內政部全國宗教資訊網）' : '（詳見關於頁）'}`;

/**
 * 圖片下方的可見出處標示。回傳 `{ text, href }`：
 * href 有值時**呼叫端必須把它渲染成可點的連結**（內政部授權條件），
 * href 為 null 時（Commons 那批）沿用既有作法，出處彙整在 /about。
 */
export function imageCredit(img: ImageMeta): { text: string; href: string | null } {
  if (isMoiImage(img)) {
    return {
      text: `圖：${img.author}攝／內政部全國宗教資訊網`,
      href: img.source,
    };
  }
  return { text: `圖：${img.author}　·　${img.license}`, href: img.license_url ?? null };
}
