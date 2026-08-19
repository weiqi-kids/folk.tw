// 圖片出處標示的**唯一入口**。
//
// 🔴 為什麼要有這支（2026-08-06）：全站各索引頁各自把標註寫死成
//    「圖：${author}　·　${license}（Wikimedia Commons，詳見關於頁）」。
//    在「所有圖都來自 Commons」的年代那是對的，但 2026-08-06 取得內政部同意後，
//    同一個 `image` 欄位會裝進**內政部的照片**——那句寫死的字會把內政部的照片
//    標成 Wikimedia Commons 的，等於掛錯出處。故收斂成一支，依資料自己判斷。
//
// 🔴 兩種授權的義務不同，別混：
//    · Wikimedia Commons（CC／PD）：要求姓名表示與授權標示。既有作法是 title 提示＋/about 彙整。
//    · 內政部（2026-08-06 同意）：條件是**標示資料來源連結**——提示文字不是連結，
//      所以這類圖必須有可點的來源連結，由 `isMoi()` 判斷、呼叫端負責渲染 <a>。
//
//      🔴 **粒度：條目頁＋站台彙整，不含索引頁縮圖**（2026-08-19 查證後精確化）。
//         授權條文原文只寫到「標示資料來源連結」（docs/taiwan-intake-status.md:57）
//         與「落實方式＝**每一筆**掛回它自己的公開網址」（同檔 :59）——「每一筆」
//         指的是**資料筆**（每張照片有自己的來源網址），**條文未界定**是每一處
//         渲染實例、還是條目頁＋站台彙整即可。
//         本檔原本寫「必須在頁面上」，那是本 repo 自訂的內規措辭、不是條文原文，
//         而且與執行面不一致：把關的 `scripts/invariants/entity-photo.mjs` 只掛
//         神明頁與廟宇頁，索引頁從來不在其管轄。敘述面與執行面矛盾本身就是漏洞
//         （下一個人照著敘述改頁面、或照著執行面以為沒事，兩邊都有理），故對齊成
//         現行執行面的粒度。
//         ✅ 現況實測（2026-08-19）：涉及內政部照片的索引頁只有 `/deities/` 一頁
//         共 19 張，該 19 張在**各自的神明頁 19/19 全部**有可點來源連結，
//         `/about#credits` 另有 19 個逐張可點連結且由不變量 `about/image-credit-lead`
//         硬擋。其餘索引頁的圖全數為 Commons，沿用 title 提示＋/about 彙整。
//      ⚠️ **這是依現有文件所能做到的最精確陳述，不是資料提供方的認可。**
//         若要逐一渲染處都連結，判定權在內政部，不在本 repo——要問就走
//         docs/TODO-FOR-TAIWAN.md 的骨架，別自己推論成結論。

export type ImageMeta = {
  src: string;
  alt: string;
  author: string;
  /**
   * 署名的角色動詞：`攝`／`繪製`。內政部圖說寫的是「（○○攝）」或「（○○繪製）」，
   * 🔴 兩者不可互換——把繪師標成「攝」是把姓名表示標錯人的身分。
   * 缺值時退回 `攝`（既有內政部照片全是攝影，2026-08-07 實測 19/19）。
   */
  author_role?: string;
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
      text: `圖：${img.author}${img.author_role || '攝'}／內政部全國宗教資訊網`,
      href: img.source,
    };
  }
  return { text: `圖：${img.author}　·　${img.license}`, href: img.license_url ?? null };
}
