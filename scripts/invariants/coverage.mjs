// 原不變量 19 的第②～⑥段：黃曆首屏與滾動日、求籤入口首屏、鼓勵語文案、
// 中元普渡清單、流量 Top 宮廟圖片。
//
// 🔴 這五段原本全部塞在「不變量 19」一個編號底下，其中三段（求籤首屏／鼓勵語／中元清單）
//    在成功摘要裡完全隱形——也就是說它們有沒有真的比對到東西，人看不出來。
//    重構把它們各自獨立成一條並給了語意 id。
import { escText } from '../lib/astro-escape.mjs';

/** ② 黃曆首屏版面與滾動日的正文圖片覆蓋。 */
export const coverageAlmanacDays = {
  id: 'coverage/almanac-days',
  legacyIds: ['19'],
  title: '/almanac/ 存在、不得用大型裝飾圖，且指定天數的黃曆頁都有正文 <img>',
  source: 'none',
  run(ctx, acc) {
    const almanacHub = ctx.join(ctx.DIST, 'almanac', 'index.html');
    const almanacHubHtml = ctx.exists(almanacHub) ? ctx.read(almanacHub) : '';
    if (!almanacHubHtml) acc.violate('首屏版面：今日黃曆入口 /almanac/ 未建置');
    // 黃曆是高密度工具頁，首屏必須先看到日期導覽與今日資訊。曾因全站圖片覆蓋 gate
    // 把 1200×630 裝飾圖塞在 AlmanacDay 前面，桌機 1000px 高仍只看到圖與標題。
    if (almanacHubHtml.includes('class="almanac-visual"')) {
      acc.violate('首屏版面：/almanac/ 不得用大型裝飾圖把日期資訊推到折線下');
    }
    let date = ctx.TODAY;
    while (acc.get('days') < ctx.data.imagePriority.almanac_rolling_days) {
      const dated = ctx.join(ctx.DIST, 'almanac', date, 'index.html');
      const file = ctx.exists(dated) ? dated : date === ctx.TODAY ? almanacHub : dated;
      acc.count('days');
      if (!ctx.exists(file)) acc.violate(`正文圖片：黃曆 ${date} 未建置`);
      else if (!/<img\b/i.test(ctx.read(file))) acc.violate(`正文圖片：黃曆 ${date} 沒有 <img>`);
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      date = d.toISOString().slice(0, 10);
    }
  },
  summary: false, // 數字併在 sitewide/body-images 那一句裡
};

/**
 * ③ 求籤入口與煩惱籤頁的首屏版面（2026-08-16 用戶裁示：插圖是配角）。
 * 滿版主視覺會把「求一支籤」推離首屏。同批也驗 encdata 在頁上——
 * 缺了客戶端會靜默退回無鼓勵語的舊句，沒有東西會報錯。
 */
export const coverageQiugianHero = {
  id: 'coverage/qiugian-hero',
  legacyIds: ['19'],
  title: '/qiugian/ 與各煩惱籤頁主視覺必須維持 compact，且煩惱籤頁必有 encdata',
  source: 'none',
  run(ctx, acc) {
    const qiugianHub = ctx.join(ctx.DIST, 'qiugian', 'index.html');
    const qiugianHubHtml = ctx.exists(qiugianHub) ? ctx.read(qiugianHub) : '';
    if (!qiugianHubHtml) acc.violate('首屏版面：求籤入口 /qiugian/ 未建置');
    else if (!/class="lead-visual compact"/.test(qiugianHubHtml)) {
      acc.violate('首屏版面：/qiugian/ 主視覺必須維持 compact，不得把求籤選項推離首屏');
    }
    for (const cid of ctx.derived.allConcernIds) {
      const f = ctx.join(ctx.DIST, 'qiugian', cid, 'index.html');
      if (!ctx.exists(f)) { acc.violate(`首屏版面：煩惱籤頁 /qiugian/${cid}/ 未建置`); continue; }
      const html = ctx.read(f);
      if (!/class="lead-visual compact"/.test(html)) {
        acc.violate(`首屏版面：/qiugian/${cid}/ 主視覺必須維持 compact，不得把求籤按鈕推離首屏`);
      }
      if (!/id="encdata"/.test(html)) {
        acc.violate(`鼓勵語：/qiugian/${cid}/ 缺 encdata 資料塊（選擇題點了會退回無鼓勵語）`);
      }
    }
  },
  summary: false,
};

/**
 * ④ 鼓勵語文案 gate（2026-08-16）：8 型人格×4 選擇的矩陣一格都不能缺——
 * 缺格時客戶端會靜默退回無鼓勵語的舊句，沒有東西會報錯。
 * 「——」硬擋（用戶抓到）：初版 64 段幾乎每段拿破折號當轉折，是句型級 AI 腔。
 * ⚠️ 這條只管 qian-encourage.json——站上其他散文合法用「——」，所以不進 copy-voice 的全域清單。
 */
export const coverageEncourageCopy = {
  id: 'coverage/encourage-copy',
  legacyIds: ['19'],
  title: '鼓勵語禁破折號轉折、前 6 字不得撞句、8 人格×4 選擇矩陣一格不缺',
  source: 'none',
  run(ctx, acc) {
    const encRows = ctx.data.encourage.filter((e) => e.text);
    const encHeads = new Map();
    for (const e of encRows) {
      if (e.text.includes('——')) {
        acc.violate(`鼓勵語 AI 腔：${e.persona}×${e.choice} 含「——」（qian-encourage.json 禁用破折號轉折）`);
      }
      // 前 6 字撞句檢查：擋模板感回潮——兩段同開頭，連抽兩支就穿幫。
      // 實證有效：上線當天就抓到兩輪人工審稿都漏掉的「你選再等等，」×2。
      const head = e.text.slice(0, 6);
      if (encHeads.has(head)) {
        acc.violate(`鼓勵語模板感：${encHeads.get(head)} 與 ${e.persona}×${e.choice} 同以「${head}」開頭`);
      }
      encHeads.set(head, `${e.persona}×${e.choice}`);
    }
    for (const pt of ctx.data.personas.types.map((t) => t.id)) {
      for (const ch of ['push', 'pause', 'ask', 'wait']) {
        if (!encRows.some((e) => e.persona === pt && e.choice === ch)) {
          acc.violate(`鼓勵語矩陣缺格：${pt}×${ch}（qian-encourage.json）`);
        }
      }
    }
  },
  summary: false,
};

/**
 * ⑤ 中元普渡清單是依 pudu 的掛源 offerings／joss_paper 欄位產生；
 * 雙向驗證可防清單與頁面資料漂移，也鎖住複製、分享與 attribution 埋點。
 */
export const coverageZhongyuanChecklist = {
  id: 'coverage/zhongyuan-checklist',
  legacyIds: ['19'],
  title: '中元普渡清單的埋點與掛源項目逐項在，且 canonical 未被 attribution 汙染',
  source: 'none',
  run(ctx, acc) {
    const file = ctx.join(ctx.DIST, 'festivals', 'zhongyuan', 'index.html');
    const html = ctx.exists(file) ? ctx.read(file) : '';
    const pudu = ctx.data.practices.find((practice) => practice.id === 'pudu');
    if (!html) { acc.violate('中元普渡清單：/festivals/zhongyuan/ 未建置'); return; }
    for (const mark of [
      'data-pudu-checklist', 'data-checklist-copy', 'data-checklist-share',
      'checklist_copy', 'checklist_share', 'utm_campaign', 'zhongyuan_pudu_checklist',
    ]) {
      if (!html.includes(mark)) acc.violate(`中元普渡清單：渲染產物缺少 ${mark}`);
    }
    for (const item of [...(pudu?.offerings ?? []), ...(pudu?.joss_paper ?? [])]) {
      if (!html.includes(escText(item))) acc.violate(`中元普渡清單：缺少掛源項目「${item}」`);
    }
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
    if (canonical !== 'https://folk.tw/festivals/zhongyuan/') {
      acc.violate(`中元普渡清單：canonical 被 attribution 汙染（${canonical || '缺少'}）`);
    }
  },
  summary: false,
};

/** ⑥ image-priority.json 的 top_temples 每一間都建置且有正文 <img>。 */
export const coverageTopTemples = {
  id: 'coverage/top-temples',
  legacyIds: ['19'],
  title: '流量 Top 宮廟頁都建置且有正文 <img>',
  source: 'none',
  run(ctx, acc) {
    for (const row of ctx.data.imagePriority.top_temples) {
      const file = ctx.join(ctx.DIST, 'temples', row.id, 'index.html');
      acc.count('temples');
      if (!ctx.exists(file)) acc.violate(`正文圖片：流量優先宮廟 ${row.id} 未建置`);
      else if (!/<img\b/i.test(ctx.read(file))) acc.violate(`正文圖片：流量優先宮廟 ${row.id} 沒有 <img>`);
    }
  },
  summary: false, // 數字併在 sitewide/body-images 那一句裡
};
