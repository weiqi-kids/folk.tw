// 原不變量 10（2026-08-07 加）：/about/ 圖片來源段落的**全稱斷言**必須涵蓋清單裡的每一種授權。
//
// 🔴 這條擋的不是某一句話，是一整類錯誤：「頁面上的總結句，隨著資料變成複合來源而變成假的」。
//    2026-08-07 實際發生：/about/ 寫「代表圖皆取自 Wikimedia Commons」，
//    同日匯入 19 張內政部照片後，清單裡出現第二種授權——**每一張的標示各自都對，
//    錯的是那句總結**。逐張比對的檢查完全看不到這種錯，因為錯的不是任何一筆資料。
//    這也是 no-meta-disclaimers 那條紅線第四次以變體出現，所以這次不是改字，
//    是把「引言必須跟著清單走」變成機器驗得出來的不變量。
//
// 判準：清單裡出現的每一種授權家族，其識別字都必須出現在該段引言裡。
// 家族由 image.source 判定（與 src/lib/image-credit.ts 的 isMoiImage 同一套判準，不另寫規則）。

const FAMILIES = [
  { id: 'moi', mark: '內政部', test: (img) => /religion\.moi\.gov\.tw/.test(img.source ?? '') },
  { id: 'commons', mark: 'Wikimedia Commons', test: (img) => !/religion\.moi\.gov\.tw/.test(img.source ?? '') },
];

export const aboutImageCredits = {
  id: 'about/image-credit-lead',
  legacyIds: ['10'],
  title: '/about/ 圖片來源引言必須提到清單裡實際出現的每一種授權家族，且不得下全稱句',
  source: 'singleton',
  singletons: ['dist/about/index.html'],
  onMissing: (_file, acc) => acc.violate('/about/ 未建置，無法驗圖片來源段落'),
  check(_file, page, ctx, acc) {
    // 引言＝<h2>圖片來源</h2> 之後、第一個 <h3> 之前那段。
    // ⚠️ 2026-08-08：定位改成錨在 **<h2> 標題本身**，不再用 indexOf('圖片來源') 抓第一個字面。
    //    /about/ 加了目錄之後，「圖片來源」四個字最先出現在目錄的 <a> 裡，
    //    切出來的 lead 變成目錄到「責任限制」那個 <h3> 之間的東西，引言根本不在裡面
    //    → gate 直接誤報。判準一點都沒放寬，只是把錨點釘準。
    const h2 = page.html.match(/<h2[^>]*>圖片來源<\/h2>/);
    if (!h2) {
      acc.violate('/about/ 找不到「圖片來源」的 <h2>，無法驗引言（版面被改動？）');
    }
    const sec = h2 ? page.html.slice(page.html.indexOf(h2[0]) + h2[0].length) : '';
    const lead = sec.slice(0, sec.indexOf('<h3'));
    const all = ctx.derived.allEntityImages;
    for (const fam of FAMILIES) {
      const n = all.filter(fam.test).length;
      if (n > 0 && !lead.includes(fam.mark)) {
        acc.violate(
          `/about/ 圖片來源引言沒提到「${fam.mark}」，但清單裡有 ${n} 張是這個來源`
          + `（引言是清單的全稱斷言，漏一種就是錯的陳述）`,
        );
      }
    }
    // 反向：引言不得對一個複合清單下「皆／全部取自單一來源」的斷言。
    const familiesPresent = FAMILIES.filter((f) => all.some(f.test)).length;
    if (familiesPresent > 1 && /(皆|全部|都)取自/.test(lead.replace(/<[^>]+>/g, ''))) {
      acc.violate('/about/ 圖片來源引言用了「皆／全部取自」的全稱句，但清單是複合來源');
    }
  },
  summary: false,
};
