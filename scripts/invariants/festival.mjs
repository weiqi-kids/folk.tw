// 節日頁的不變量。全部共用同一趟走訪（dist/festivals/*/index.html）。
// ⚠️ 原始碼裡這一段有 5 個**完全沒有編號**的斷言群（日期標籤／搜尋意圖／OG 卡／
//    中秋↔祭孔互指／可見更新日），它們既無 id 也不進成功摘要——換句話說沒有任何訊號
//    能看出它們有沒有真的比對到東西。重構時全部給了語意 id。
import { escText, escAttr } from '../lib/astro-escape.mjs';
import { num } from '../../src/lib/format.ts';
import { festivalDiscoverImagePath } from '../../src/lib/festival-og.ts';
// ⚠️ 2026-08-20 這支正在更名為 calendar-date.ts，`lunar-date.ts` 暫留為純轉出。
//    等那次更名落地，這裡連同其餘 import 一起改指 calendar-date.ts。
import { festivalNextSolar, isLunarMonthEnd } from '../../src/lib/lunar-date.ts';
import { Solar } from 'lunar-javascript';

const FAQ_MARK = '"@type":"FAQPage"';

/**
 * 原不變量 5（2026-07-30 加）：節日頁骨架。
 * 每個 festivals.json 條目都必須有頁、有 answer-first .lead、有 FAQPage 與 Article 結構化資料。
 * 節日知識頁不是站上主辦的線下活動，故**反向擋住 Event**（避免連帶宣稱 EventScheduled、
 * OfflineEventAttendanceMode 與 folk.tw organizer）。
 */
export const festivalSkeleton = {
  id: 'festival/skeleton',
  legacyIds: ['5'],
  title: '節日頁 description 完整句、lead／FAQPage／Article 齊備、且不得宣稱 Event',
  source: 'festivals',
  check(f, page, _ctx, acc) {
    const description = page.description();
    if (!/[。！？…]$/.test(description)) {
      acc.violate(`節日頁 ${f.slug} description 不是完整句或安全刪節：${description}`);
    }
    if (/（（|，，|。。/.test(description)) {
      acc.violate(`節日頁 ${f.slug} description 含重複括號或標點：${description}`);
    }
    if (!page.html.includes('class="lead"')) acc.violate(`節日頁 ${f.slug} 缺 answer-first 摘要（class="lead"）`);
    if (!page.html.includes(FAQ_MARK)) acc.violate(`節日頁 ${f.slug} 缺 FAQPage 結構化資料`);
    if (!page.html.includes('"@type":"Article"')) acc.violate(`節日頁 ${f.slug} 缺 Article 結構化資料`);
    if (page.html.includes('"@type":"Event"')) acc.violate(`節日頁 ${f.slug} 不得宣稱 Event 結構化資料`);
  },
  summary: (_acc, ctx) => `全 ${ctx.visitedOf('festivals')} 個節日頁含 lead／FAQPage／Event 且日期相符`,
};

/**
 * 原不變量 5g（2026-08-12 加；🔴 舊編號與「首頁季節戰役卡」撞號）：Discover 新鮮度訊號。
 * 背景：2026-08-12 實測全站 Article 結構化資料 0 個 datePublished，而 Discover 對缺日期的
 *       Article 幾乎不推。這三個欄位一旦被動掉不會有任何錯誤訊息，頁面照樣長得一樣——
 *       正是「安靜失效」那一類，所以做成不變量而非人工抽驗。
 * 🔴 日期比對的是 festivals.json 的 published/updated（資料實際變動日），**不是 build 時間**。
 * 可見更新日：標籤必須是「本頁資料更新」，只印裸日期會被讀成節日日期（這頁通篇在講節日的日期）。
 */
export const festivalFreshness = {
  id: 'festival/discover-freshness',
  legacyIds: ['5g'],
  title: 'Article 的 datePublished／dateModified／author 與資料一致，且有可見更新日',
  source: 'festivals',
  check(f, page, _ctx, acc) {
    if (!page.html.includes(`"datePublished":"${f.published}"`)) {
      acc.violate(`節日頁 ${f.slug} 的 Article 缺 datePublished 或與資料不符（應為 ${f.published}）`);
    }
    if (!page.html.includes(`"dateModified":"${f.updated}"`)) {
      acc.violate(`節日頁 ${f.slug} 的 Article 缺 dateModified 或與資料不符（應為 ${f.updated}）`);
    }
    if (!/"author":\{"@type":"Organization"/.test(page.html)) {
      acc.violate(`節日頁 ${f.slug} 的 Article 缺 author（須為 Organization——這個站沒有具名撰稿者，掛人名即杜撰署名）`);
    }
    if (!page.html.includes(`本頁資料更新：<time datetime="${f.updated}"`)) {
      acc.violate(`節日頁 ${f.slug} 缺可見更新日或標籤／日期不符（應為「本頁資料更新：${f.updated}」）`);
    }
  },
  summary: false,
};

/**
 * 原不變量 5i（2026-08-12 加）：Article／Discover 主圖必須是該節日自己的乾淨 1200×675（16:9）圖，
 * 不得退回全站 logo，也不得把社群文字卡當成 Discover 主圖。路徑與頁面共用 festival-og.ts，
 * 實體檔由 postbuild 的 gen-og-festivals.mjs 產生；兩邊任一缺失都會讓訊號安靜失效。
 * ⚠️ 全檔唯一需要 await 的斷言（實際讀 PNG 尺寸），runner 的 check 因此支援 async。
 */
export const festivalDiscoverImage = {
  id: 'festival/discover-image',
  legacyIds: ['5i'],
  title: 'Discover 主圖是該節日自己的圖、檔案存在，且實際像素為 1200×675',
  source: 'festivals',
  async check(f, page, ctx, acc) {
    const discoverImagePath = festivalDiscoverImagePath(f.slug);
    const discoverImageUrl = discoverImagePath ? `https://folk.tw${discoverImagePath}` : '';
    if (!discoverImageUrl || !page.html.includes(`"image":"${discoverImageUrl}"`)) {
      acc.violate(`節日頁 ${f.slug} 的 Article 缺 Discover 主圖或網址與資料不符（應為 ${discoverImageUrl || '該節日專屬主圖'}）`);
    }
    const discoverImageFile = discoverImagePath ? ctx.join(ctx.DIST, discoverImagePath.slice(1)) : '';
    if (!discoverImagePath || !ctx.exists(discoverImageFile)) {
      acc.violate(`節日頁 ${f.slug} 的 Discover 主圖檔案不存在（${discoverImagePath || '未配置'}）`);
      return;
    }
    try {
      const { width, height } = await ctx.imageSize(discoverImageFile);
      if (width !== 1200 || height !== 675) {
        acc.violate(`節日頁 ${f.slug} 的 Discover 主圖不是 1200×675（16:9）（實際：${width ?? '?'}×${height ?? '?'}）`);
      }
    } catch (error) {
      acc.violate(`節日頁 ${f.slug} 的 Discover 主圖無法讀取（${error instanceof Error ? error.message : String(error)}）`);
    }
  },
  summary: false,
};

/**
 * 原不變量 5d（2026-08-09 加）：一套儀式的完整內容**只准出現在主場節日頁**。
 * 背景：`pudu` 被 7 個節日頁指到，此前每頁都整組渲染它的步驟／供品／金紙／禁忌／地區差異，
 *       造成站內自我重複（實測與中元節頁的 8 字片段重疊：搶孤 84.4%、雞籠中元祭 71.6%），
 *       而重疊最高的兩頁正是 Google 不收錄的那兩頁。
 * 🔴 驗**雙向**：主場頁少了＝把能排名的內容弄丟；非主場頁多了＝重複又回來。兩種都不會報錯。
 */
export const festivalPracticeHome = {
  id: 'festival/practice-home',
  legacyIds: ['5d'],
  title: '儀式完整步驟只准出現在主場節日頁，非主場頁必須留下往正主頁的指路',
  source: 'festivals',
  check(f, page, ctx, acc) {
    const mainPracticeId = (f.practice_refs ?? [])[0];
    const mainPracticeData = mainPracticeId ? ctx.data.practices.find((p) => p.id === mainPracticeId) : null;
    if (!mainPracticeData?.home_festival || (mainPracticeData.steps ?? []).length === 0) return;
    const hasSteps = page.html.includes('<ol class="steps"');
    const isHome = f.slug === mainPracticeData.home_festival;
    if (isHome && !hasSteps) {
      acc.violate(`節日頁 ${f.slug} 是 ${mainPracticeId} 的主場，卻沒渲染完整步驟`);
    }
    if (!isHome && hasSteps) {
      acc.violate(`節日頁 ${f.slug} 不是 ${mainPracticeId} 的主場，卻渲染了完整步驟（站內重複內容）`);
    }
    // 非主場頁必須留下往正主頁的指路，否則讀者與爬蟲都走不過去。
    if (!isHome && !page.html.includes(`/practices/${mainPracticeId}/`)) {
      acc.violate(`節日頁 ${f.slug} 未指向 /practices/${mainPracticeId}/`);
    }
  },
  summary: false,
};

/**
 * 原不變量 5e + 5f（2026-08-09 加）：民俗活動的**文資登錄明細**只准出現在主場節日頁，
 * 且主場頁必須同時渲染逐字內容與**來源連結**。
 * 5e 是 5d 當天的續發事故：補「文化資產登錄」區塊時忘了套同一條規則，於是 `jilong` 的
 * 登錄明細同時印在中元節頁與雞籠中元祭頁上，guimenkai 的重疊率當場從 46.8% 反升到 61.6%
 * ——**補內容也會製造重複**，不是只有共用欄位會。
 * 判定用「公告文號」而非區塊 class：文號是那一筆登錄獨有的字串，抄到別頁就會被抓到。
 * 🔴 5f 是**授權條件**，不是排版偏好：2026-08-09 取得文化部授權，條件＝標示資料來源連結。
 * ⚠️ **5e 與 5f 刻意不拆**：原始碼裡兩者共用同一個 `for (const eid …)` 迴圈本體與
 *    `ev`／`home` 兩個中間值，且 5f 的執行前提就是 5e 算出的 `home === f.slug`。
 */
export const festivalHeritageHome = {
  id: 'festival/heritage-home',
  legacyIds: ['5e', '5f'],
  title: '文資登錄公告文號只准印在主場頁，且主場頁必須逐字渲染內容與來源連結',
  source: 'festivals',
  check(f, page, ctx, acc) {
    for (const eid of f.event_refs ?? []) {
      const ev = ctx.data.events.find((e) => e.id === eid);
      const home = ev?.heritage?.home_festival;
      if (!home || !ev?.heritage?.announcements?.length) continue;
      const doc = ev.heritage.announcements[0].doc;
      const printed = page.html.includes(doc);
      if (home === f.slug && !printed) {
        acc.violate(`節日頁 ${f.slug} 是 ${eid} 的登錄主場，卻沒印出公告文號 ${doc}`);
      }
      if (home !== f.slug && printed) {
        acc.violate(`節日頁 ${f.slug} 不是 ${eid} 的登錄主場，卻印出了它的公告文號 ${doc}（站內重複內容）`);
      }
      if (home !== f.slug) continue;
      const h = ev.heritage;
      const caseUrl = h.case_id ? `https://nchdb.boch.gov.tw/assets/overview/folklore/${h.case_id}` : null;
      for (const [field, label] of [['register_reason', '登錄理由'], ['history', '歷史沿革']]) {
        const text = h[field];
        if (!text) continue;
        // 取一段夠長、且不含會被 HTML 轉義字元的片段比對（逐字未改寫的證據）。
        const probe = text.split('\n')[0].slice(0, 24);
        if (probe && !page.html.includes(escText(probe))) {
          acc.violate(`節日頁 ${f.slug} 的 ${eid} ${label}未逐字渲染（找不到「${probe}」）`);
        }
      }
      if ((h.register_reason || h.history || (h.notices ?? []).length) && caseUrl && !page.html.includes(caseUrl)) {
        acc.violate(`節日頁 ${f.slug} 引用了 ${eid} 的文資網逐字內容，卻沒有渲染來源連結（違反授權條件）`);
      }
    }
  },
  summary: false,
};

/**
 * 原不變量 5b（2026-07-31 加）：「當天有登記祭典的宮廟」名單。
 * 這一段是節日頁對內容站的差異化資產（逐廟、掛源、可反查），故驗名單數量與資料完全相符。
 * 同一農曆日期只有「festivals.json 先出現者」掛名單（07-15 給中元節不給搶孤、
 * 07-01 給鬼門開不給雞籠中元祭），否則兩頁會帶一模一樣的清單＝自製重複內容。
 * ⚠️ 歸屬規則由 ctx.derived.ownsLunarDateList 提供——原本 5b 與 7③ 各有一份實作。
 * ⚠️ 2026-08-08 改切「整個 <section class="on-date">」而不是「第一個 <ul>」：
 *    該區塊已改成「前 60 間直接列、其餘收進 <details>」，名單因此是兩個 <ul>。
 *    不變量本身沒有放寬——收合的部分也在 HTML 裡，爬蟲讀得到、內鏈一條都沒少。
 */
export const festivalOnDateTemples = {
  id: 'festival/on-date-temples',
  legacyIds: ['5b'],
  title: '當日祭典宮廟名單只掛在擁有者頁，且間數與資料完全相符（雙向）',
  source: 'festivals',
  check(f, page, ctx, acc) {
    if (f.lunar_date && ctx.derived.ownsLunarDateList(f)) {
      const want = ctx.data.temples.filter((t) =>
        (t.festivals ?? []).some((x) => x.calendar === 'lunar' && x.date === f.lunar_date),
      ).length;
      // 不可假設是裸標籤（Astro 補 data-astro-cid-*），故先切出名單區間再數廟宇連結。
      const sectionStart = page.html.indexOf('class="on-date"');
      const sectionHtml = sectionStart >= 0
        ? page.html.slice(sectionStart, page.html.indexOf('</section>', sectionStart))
        : '';
      const shown = (sectionHtml.match(/href="\/temples\//g) ?? []).length;
      if (want > 0) {
        if (shown !== want) {
          acc.violate(`節日頁 ${f.slug} 當日祭典宮廟名單列出 ${shown} 間，資料為 ${want} 間`);
        }
        if (!new RegExp(`全台共\\s*${num(want)}\\s*間宮廟`).test(page.html)) {
          acc.violate(`節日頁 ${f.slug} 名單間數敘述與資料不符（資料 ${want} 間）`);
        }
      } else if (shown > 0) {
        acc.violate(`節日頁 ${f.slug} 無資料卻列出 ${shown} 間宮廟`);
      }
    } else if (page.html.includes('class="on-date-list"')) {
      // 非擁有者（搶孤／雞籠中元祭）或節氣型節日（清明）都不該有名單。
      acc.violate(`節日頁 ${f.slug} 不該有當日祭典宮廟名單（同日名單歸屬於別頁，或此為節氣型節日）`);
    }
  },
  summarySep: '、',
  summary: () => '當日祭典宮廟名單間數與資料相符',
};

/** 原本**沒有編號**（舊 L816-819）：農曆節日與節氣節日（清明）走同一支 lib 取標籤。 */
export const festivalDateLabel = {
  id: 'festival/date-label',
  legacyIds: [],
  title: 'festivalNextSolar 算出的日期標籤必須出現在頁面上',
  source: 'festivals',
  check(f, page, ctx, acc) {
    const { label: wantLabel } = festivalNextSolar(f, '2026-01-01');
    if (wantLabel && !page.html.includes(wantLabel)) {
      acc.violate(`節日頁 ${f.slug} 未出現日期標籤「${wantLabel}」`);
    }
  },
  summary: false,
};

/**
 * 原本**沒有編號**（舊 L820-834）：9 個戰役頁的 title 必須呈現該頁**獨有**的搜尋意圖。
 * 這是「節日頁自我重複」那次診斷的產物：整組流程被複製 7 次，重疊最高的兩頁正是
 * 不被收錄的兩頁；title 分流是差異化的第一層。
 */
export const festivalTitleIntent = {
  id: 'festival/title-intent',
  legacyIds: [],
  title: '戰役節日頁的 title 必須含本頁獨有的搜尋意圖片語',
  source: 'festivals',
  check(f, page, _ctx, acc) {
    const probe = {
      zhongyuan: '普渡供品、金紙與祭拜順序',
      qixi: '七娘媽生、做十六歲與祭拜',
      fangshuideng: '由來、對象與基隆中元祭',
      'jilong-zhongyuan': '開龕門、放水燈與字姓輪值',
      qianggu: '頭城、恆春日期與文化資產',
      zhongqiu: '拜月娘、土地公供品與四天連假',
      'kongzi-birthday': '孔子誕辰與祭孔釋奠典禮',
      'september-solar-terms': '9/7、9/23 節氣與農漁產',
      'kinmen-bo-bing': '六顆骰子規則與活動日期',
    }[f.slug];
    if (probe && !page.title().includes(probe)) {
      acc.violate(`節日頁 ${f.slug} title 未呈現本頁獨有的搜尋意圖：${page.title()}`);
    }
  },
  summary: false,
};

/**
 * 原本**沒有編號**（舊 L835-855）：節日頁的分享卡（og:image、頁首分享列、正文主視覺）。
 * ⚠️ FESTIVAL_OG_SLUGS 目前等於全部節日，所以 else 分支（沒卡卻顯示主視覺）是死分支；
 *    保留是為了防未來新增沒有卡的節日。
 */
export const festivalOgCard = {
  id: 'festival/og-card',
  legacyIds: [],
  title: '節日頁 og:image 是自己的卡、檔案存在，正文顯示同一張卡且有固定尺寸',
  source: 'festivals',
  check(f, page, ctx, acc) {
    if (!ctx.derived.festivalOgSlugs.has(f.slug)) {
      if (page.html.includes('class="festival-visual"')) {
        acc.violate(`節日頁 ${f.slug} 沒有專屬分享卡卻顯示節令主視覺`);
      }
      return;
    }
    const wantOg = `/og/festivals/${f.slug}.png`;
    if (!page.html.includes(escAttr(wantOg))) {
      acc.violate(`節日頁 ${f.slug} 的 og:image 不是自己的分享卡（應為 ${wantOg}）`);
    } else if (!ctx.exists(`${ctx.DIST}${wantOg}`)) {
      acc.violate(`節日頁 ${f.slug} 的分享卡檔不存在：dist${wantOg}`);
    }
    if (!page.html.includes('aria-label="分享這一頁"') || !page.html.includes('data-pagefind-ignore')) {
      acc.violate(`節日頁 ${f.slug} 的頁首分享列缺少或會被 Pagefind 索引`);
    }
    const visual = page.html.match(/<figure class="festival-visual"[^>]*>[\s\S]*?<\/figure>/)?.[0] ?? '';
    if (!visual.includes(`src="${escAttr(wantOg)}"`)) {
      acc.violate(`節日頁 ${f.slug} 未在正文顯示自己的分享卡（應為 ${wantOg}）`);
    }
    if (!visual.includes('width="1200"') || !visual.includes('height="630"')) {
      acc.violate(`節日頁 ${f.slug} 的正文分享卡缺少 1200×630 固定尺寸`);
    }
  },
  summary: false,
};

/**
 * 原不變量 5 的日期往返那半段（舊 L856-879）：title 上的國曆 M/D 做農曆往返驗證，
 * 或（固定日期型）等於 solar_date。節氣節日的國曆日由節氣表定、無農曆可往返，故只驗農曆型。
 */
export const festivalTitleDate = {
  id: 'festival/title-date',
  legacyIds: ['5'],
  title: 'title 的國曆日期存在，且轉回農曆等於 lunar_date（或等於固定 solar_date）',
  source: 'festivals',
  check(f, page, ctx, acc) {
    const title = page.title();
    const md = title.match(/(\d{1,2})\/(\d{1,2})/);
    if (!md && !f.date_note) {
      acc.violate(`節日頁 ${f.slug} title 缺國曆日期：${title}`);
    }
    if (md && f.lunar_date) {
      const mo = Number(md[1]);
      const day = Number(md[2]);
      const wantM = Number(f.lunar_date.slice(0, 2));
      const wantD = Number(f.lunar_date.slice(3));
      const nowYear = new Date().getUTCFullYear();
      const ok = [nowYear, nowYear + 1, nowYear + 2].some((y) => {
        let s;
        try { s = Solar.fromYmd(y, mo, day); } catch { return false; }
        const l = s.getLunar();
        if (l.getMonth() !== wantM) return false;
        if (l.getDay() === wantD) return true;
        return wantD === 30 && l.getDay() === 29 && isLunarMonthEnd(s.toYmd());
      });
      if (!ok) acc.violate(`節日頁 ${f.slug} title 國曆 ${mo}/${day} 轉回農曆不等於 ${f.lunar_date}`);
    }
    if (md && f.solar_date
        && `${String(md[1]).padStart(2, '0')}-${String(md[2]).padStart(2, '0')}` !== f.solar_date) {
      acc.violate(`節日頁 ${f.slug} title 國曆 ${md[1]}/${md[2]} 不等於固定日期 ${f.solar_date}`);
    }
  },
  summary: false,
};

/** 原本**沒有編號**（舊 L880-891）：中秋頁與祭孔頁必須互指，且各自有四天連假模組與掛源清單。 */
export const festivalCrossLinks = {
  id: 'festival/cross-links',
  legacyIds: [],
  title: '中秋頁與祭孔頁互指、四天連假模組與掛源準備清單都在',
  source: 'festivals',
  check(f, page, _ctx, acc) {
    if (f.slug === 'zhongqiu') {
      if (!page.html.includes('中秋拜拜準備清單') || !page.html.includes('zhongqiu_worship_checklist')) {
        acc.violate('中秋節頁缺少可操作的掛源準備清單');
      }
      if (!page.html.includes('中秋節與教師節共四天連假') || !page.html.includes('/festivals/kongzi-birthday/')) {
        acc.violate('中秋節頁缺少四天連假模組或祭孔頁連結');
      }
    }
    if (f.slug === 'kongzi-birthday'
        && (!page.html.includes('中秋節與教師節共四天連假') || !page.html.includes('/festivals/zhongqiu/'))) {
      acc.violate('祭孔頁缺少四天連假模組或中秋頁連結');
    }
  },
  summary: false,
};

/**
 * 原不變量 7③（2026-08-06 加）：節日頁的地方宗教慶典名單雙向。
 * ⚠️ 原本這一段把 68 個節日頁**再讀一次**；現在併進節日頁那一趟。
 */
export const festivalLocalCelebration = {
  id: 'festival/local-celebration',
  legacyIds: ['7'],
  title: '農曆日期歸屬本頁者必須列出同日地方慶典、非擁有者必須沒有',
  source: 'festivals',
  check(f, page, ctx, acc) {
    const has = page.html.includes('class="local-list"');
    const want = ctx.derived.localByFestival.get(f.slug) ?? [];
    if (want.length === 0) {
      if (has) acc.violate(`節日頁 ${f.slug} 不該有地方宗教慶典名單（同日名單歸屬於別頁或無資料）`);
      return;
    }
    if (!has) { acc.violate(`節日頁 ${f.slug} 缺地方宗教慶典名單（資料有 ${want.length} 項）`); return; }
    for (const x of want) {
      if (!page.html.includes(escText(x.name))) {
        acc.violate(`節日頁 ${f.slug} 地方宗教慶典未列出「${x.name}」`);
      }
    }
    if (!new RegExp(`共\\s*${want.length}\\s*項`).test(page.html)) {
      acc.violate(`節日頁 ${f.slug} 地方宗教慶典項數敘述與資料不符（資料 ${want.length} 項）`);
    }
  },
  summary: false,
};

/**
 * 2026-08-19 加：節日頁 `facts` 裡標為**逐字引用**的來源，其網址必須真的渲染在同一頁。
 *
 * 🔴 為什麼要驗這個：逐字引用的授權條件就是「標示資料來源連結」（內政部 2026-08-06、
 *    文化部 2026-08-09、國史館臺灣文獻館 2026-08-19 三次都是同一條）。連結沒渲染出來
 *    ＝違反授權，而那是**不會有任何錯誤訊息的違反**——同 5f 對內政部那批的理由。
 * ⚠️ 只驗「宣稱逐字」的那些：摘述本來就不受這條授權條件約束（判準與
 *    scripts/check-source-refs.mjs 的 claimsVerbatim 一致，改一邊要改兩邊）。
 */
const claimsVerbatim = (note) => note.includes('逐字') && !/非逐字|不逐字|未逐字|不可逐字|摘述/.test(note);

export const festivalVerbatimSourceLink = {
  id: 'festival/verbatim-source-link',
  title: '節日頁標為逐字引用的來源連結必須渲染在同一頁（授權條件）',
  source: 'festivals',
  check(f, page, _ctx, acc) {
    for (const fact of f.facts ?? []) {
      for (const src of fact.sources ?? []) {
        if (!claimsVerbatim(String(src.note ?? ''))) continue;
        const url = String(src.ref ?? '').match(/https?:\/\/\S+/)?.[0];
        if (!url) {
          acc.violate(`節日頁 ${f.slug} 的逐字來源「${src.note}」沒有可掛的網址`);
          continue;
        }
        if (!page.html.includes(escAttr(url))) {
          acc.violate(`節日頁 ${f.slug} 逐字引用了 ${url}，但該連結沒有渲染在頁面上（違反授權條件）`);
          continue;
        }
        acc.count('verbatim');
      }
    }
  },
  summary: (acc) => `另節日頁 ${acc.get('verbatim')} 處逐字引用的來源連結皆確實渲染在同一頁（授權條件）`,
};

/**
 * 2026-08-20 加：節日頁的辭典引文（國史館臺灣文獻館《臺灣民俗文物辭典》）。
 * 🔴 與 deity/th-dict、practice/th-dict 同一條規則：授權條件是標示資料來源連結，
 *    逐條掛源，缺連結是不會有錯誤訊息的違反，所以要逐頁驗。
 * ⚠️ 「無資料不得渲染」那半邊也要驗：空區塊會讓讀者以為我們有引用而其實沒有。
 */
export const festivalThDict = {
  id: 'festival/th-dict',
  title: '節日頁辭典引文逐字渲染且每條來源連結都在（授權條件），無資料不得渲染',
  source: 'festivals',
  check(f, page, _ctx, acc) {
    const td = f.th_dict ?? [];
    const has = page.html.includes('class="th-dict"');
    if (td.length === 0) {
      if (has) acc.violate(`節日頁 ${f.slug} 不該有辭典引文區塊（資料為空）`);
      return;
    }
    if (!has) { acc.violate(`節日頁 ${f.slug} 缺辭典引文區塊（資料有 ${td.length} 條辭條）`); return; }
    for (const q of td) {
      acc.count('festThDict');
      for (const t of q.excerpt) {
        if (!page.html.includes(escText(t))) {
          acc.violate(`節日頁 ${f.slug} 辭典引文未逐字出現（辭條「${q.title}」段落開頭：${t.slice(0, 20)}…）`);
        }
      }
      if (!page.html.includes(escAttr(q.url))) {
        acc.violate(`節日頁 ${f.slug} 辭條「${q.title}」缺來源連結 ${q.url}（授權條件，缺了就是違反授權）`);
      }
    }
  },
  summary: (acc) => `另節日頁辭典引文 ${acc.get('festThDict')} 條逐字相符且**每條的來源連結都在**（授權條件）`,
};
