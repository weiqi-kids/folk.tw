// 全站掃描型的不變量。
//
// ⚠️ 原本這裡有**兩份幾乎相同的 walk() 遞迴**：不變量 18 掃 `.html` 與 `llms-full.txt`
//    的全文（15,397 個檔，只做 3 個字串測試），不變量 19① 再掃一次全站的 index.html。
//    現在由 runner 的 `outputs` 走訪讀**一趟**，兩條共用。

/**
 * 原不變量 18（2026-08-10 加）：籤系 hub 連結與 Pagefind 屬性。
 * 自有樞紐（目前藥籤＝/medicine-slips/）不會生成 /systems/<id>/ 頁；任何輸出仍指向後者
 * 都是使用者可點到的 404。全站逐檔掃描，避免只修廟頁、卻從生日／行業／情境等入口復發。
 * Pagefind 對 data-pagefind-ignore 的判定是「屬性存在即忽略」，字串 "false" 也一樣；
 * 因此全面禁止 false。
 */
export const sitewideSystemHubLinks = {
  id: 'sitewide/system-hub-links',
  legacyIds: ['18'],
  title: '全站輸出不得含指向自有樞紐籤系的死路徑，也不得輸出 data-pagefind-ignore="false"',
  source: 'outputs',
  initAcc(acc, ctx) { acc.state.hubSystems = ctx.data.divinationSystems.filter((s) => s.hub); },
  check(file, page, ctx, acc) {
    const route = file.slice(ctx.DIST.length) || '/';
    for (const system of acc.state.hubSystems) {
      const deadPath = `/systems/${system.id}/`;
      if (page.html.includes(deadPath)) {
        acc.violate(`籤系 hub：${route} 仍輸出不存在的 ${deadPath}（應為 ${system.hub}）`);
      }
    }
    if (/data-pagefind-ignore=(?:"false"|'false')/.test(page.html)) {
      acc.violate(`Pagefind：${route} 輸出 data-pagefind-ignore="false"，仍會被視為忽略`);
    }
    acc.count('files');
  },
  // ⚠️ 原本 `globalThis.__systemHubFiles` 被賦值但**從未出現在成功摘要裡**（全檔唯一的死計數器）。
  //    重構刻意維持不進摘要，以保住輸出逐字相同；要加請另開一次改動。
  summary: false,
};

/** 原不變量 18 的第二段：/almanac/ 的正文容器不得被排除索引。 */
export const almanacPagefindBody = {
  id: 'sitewide/almanac-pagefind-body',
  legacyIds: ['18'],
  title: '/almanac/ 的 .almanac-day 正文容器不得帶 data-pagefind-ignore',
  source: 'singleton',
  singletons: ['dist/almanac/index.html'],
  onMissing: (_file, acc) => acc.violate('Pagefind：/almanac/ 未建置，無法驗證正文索引屬性'),
  check(_file, page, _ctx, acc) {
    const dayTag = page.html.match(/<div\b[^>]*class="[^"]*\balmanac-day\b[^"]*"[^>]*>/)?.[0] ?? '';
    if (!dayTag) acc.violate('Pagefind：/almanac/ 找不到 .almanac-day 正文容器');
    else if (dayTag.includes('data-pagefind-ignore')) {
      acc.violate('Pagefind：/almanac/ 的 .almanac-day 正文容器不應被排除索引');
    }
  },
  summary: false,
};

/**
 * 原不變量 19 的第①段（2026-08-09 加）：正文圖片覆蓋。
 * 使用者要求所有非黃曆／宮廟正式頁都必須有圖；黃曆與宮廟的覆蓋範圍
 * 由 image-priority.json 控制。只認 body 實際 <img>，不把 meta og:image 算進來。
 * ⚠️ 原本「不變量 19」一個編號底下塞了 6 件無關的事，其中 3 件在成功摘要裡完全隱形。
 *    重構已裂成 6 條（sitewide/body-images 與 coverage/*）。
 */
export const sitewideBodyImages = {
  id: 'sitewide/body-images',
  legacyIds: ['19'],
  title: '非黃曆／宮廟／籤詩詳情的正式頁都必須有正文 <img>',
  source: 'outputs',
  check(file, page, ctx, acc) {
    if (!file.endsWith('/index.html')) return;
    const route = file.slice(ctx.DIST.length).replace(/\/index\.html$/, '/') || '/';
    if (route.startsWith('/almanac/') || route.startsWith('/temples/')) return;
    // 籤詩詳情頁豁免（2026-08-15 用戶裁示：分享卡只作 og:image、不內嵌正文——
    // 這批頁原本的正文圖就是內嵌的 /og/poems/ 卡，故 2026-08-09「正式頁都要有圖」
    // 在此讓位；其他頁的覆蓋要求不變）。
    if (/^\/poems\/[^/]+\/$/.test(route)) return;
    // astro.config 的 mergedInto 舊 slug 是只有跳轉標記的相容網址，沒有正文，也不是內容頁。
    if (!/<html\b/i.test(page.html)) return;
    acc.count('general');
    if (!/<img\b/i.test(page.html)) acc.violate(`正文圖片：${route} 沒有 <img>`);
  },
  // 這一句原本就把①②⑥三段的數字組在一起，故在這裡一起組（③④⑤原本就不進摘要）。
  summary: (acc, ctx) =>
    `另正文圖片覆蓋 ${acc.get('general')} 個非黃曆／宮廟頁、`
    + `${ctx.accOf('coverage/almanac-days').get('days')} 個指定黃曆日與 `
    + `${ctx.accOf('coverage/top-temples').get('temples')} 個流量 Top 宮廟頁`,
};
