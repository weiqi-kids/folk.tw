#!/usr/bin/env node
// 將 52 週研究包整理成可交付編輯、可回填既有 canonical 的完整文章稿。
// 這個腳本不發布頁面；年度日期、路線、服務與圖片授權仍在文章的維護欄位更新。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = 'docs/topic-articles';

// [週次, 標題, 來源檔, 來源段落 heading regexp, heading level]
const mappings = [
  [19, '內門宋江陣與地方藝陣', 'missing-weeks.md', /^## 第 19 週：/mu],
  [25, '學甲上白礁暨刈香', 'missing-weeks.md', /^## 第 25 週：/mu],
  [30, '東港迎王與西港香的地方分流', 'missing-weeks.md', /^## 第 30 週：/mu],
  [32, '玄天上帝香期與地方進香', 'missing-weeks.md', /^## 第 32 週：/mu],
  [33, '求平安、收驚與補運的信仰邊界', 'content-themes-33-52.md', /^### 33\. /mu],
  [34, '求姻緣、求子與神明分工', 'content-themes-33-52.md', /^### 34\. /mu],
  [35, '搬家入厝、安神位與儀式分層', 'content-themes-33-52.md', /^### 35\. /mu],
  [36, '收驚、補運與祭解的差異', 'content-themes-33-52.md', /^### 36\. /mu],
  [43, '神明生日異說與來源並列', 'content-themes-33-52.md', /^### 43\. /mu],
  [44, '神明比較：職司差異而非靈驗排名', 'content-themes-33-52.md', /^### 44\. /mu],
  [45, '求願情境：考試、姻緣、開店與健康', 'content-themes-33-52.md', /^### 45\. /mu],
  [46, '農民曆宜忌怎麼讀', 'content-themes-33-52.md', /^### 46\. /mu],
  [47, '如何選廟：主祀、祭典與參拜資訊', 'content-themes-33-52.md', /^### 47\. /mu],
  [48, '地方民俗文化資產怎麼看', 'content-themes-33-52.md', /^### 48\. /mu],
  [49, '祈福事件後續如何查證', 'content-themes-33-52.md', /^### 49\. /mu],
  [50, '籤詩、典故與籤系如何閱讀', 'content-themes-33-52.md', /^### 50\. /mu],
  [51, '安太歲、點燈、補運、還願詞彙差異', 'content-themes-33-52.md', /^### 51\. /mu],
  [52, '臺灣歲時年表：節氣、農曆與地方祭典', 'content-themes-33-52.md', /^### 52\. /mu],
  [1, '白露、秋分日期與差別', 'aug-nov.md', /^### .*kongzi-birthday.*與.*september-solar-terms.*/mu, 3],
  [2, '中秋節日期、拜月娘與土地公準備', 'aug-nov.md', /^### .*zhongqiu.*/mu, 3],
  [3, '金門博狀元餅規則與活動檔期', 'aug-nov.md', /^### .*kinmen-bo-bing.*/mu, 3],
  [4, '教師節、孔子誕辰與祭孔釋奠', 'aug-nov.md', /^### .*kongzi-birthday.*/mu, 3],
  [5, '重陽日期、敬老與祭祖', 'chongyang.md', /^# 重陽節主題草稿/mu, 1],
  [6, '艋舺青山王祭：暗訪與正日', 'aug-nov.md', /^### .*qingshan.*/mu, 3],
  [7, '下元節與三官信仰', 'aug-nov.md', /^### 下元節：/mu, 3],
  [8, '王醮、王船祭的地方差異', 'aug-nov.md', /^### 王醮群的合併規則/mu, 3],
  [9, '東山迎佛祖暨遶境', 'dec-mar.md', /^### 4\. 東山碧軒寺迎佛祖暨遶境/mu, 3],
  [10, '冬至日期、祭祖與湯圓', 'dongzhi.md', /^# 冬至主題初稿/mu, 1],
  [11, '送神、謝太歲與年末還願', 'dec-mar.md', [/^### 2\. 送神：/mu, /^### 3\. 謝太歲與還願：/mu], 3],
  [12, '除夕祭祖、拜公媽', 'dec-mar.md', /^### 5\. 除夕祭祖／年節拜公媽/mu, 3],
  [13, '安太歲、點燈與祈安', 'dec-mar.md', [/^### 7\. 安太歲/mu, /^### 8\. 點光明燈／平安燈／文昌燈/mu], 3],
  [14, '拜天公、正月初九與供桌', 'dec-mar.md', /^### 9\. 拜天公／天公生/mu, 3],
  [15, '元宵節與地方燈／炮活動', 'dec-mar.md', /^### 10\. 元宵節：/mu, 3],
  [16, '鹽水蜂炮、臺東寒單', 'dec-mar.md', [/^### 11\. 鹽水蜂炮/mu, /^### 12\. 臺東炮炸寒單爺/mu], 3],
  [17, '大甲、白沙屯媽祖進香', 'dec-mar.md', /^### 15\. 媽祖遶境事件群/mu, 3],
  [18, '北港朝天宮迎媽祖', 'dec-mar.md', /^### 15\. 媽祖遶境事件群/mu, 3],
  [20, '清明日期、掃墓與培墓', 'dec-mar.md', /^### 13\. 清明：/mu, 3],
  [21, '清明祭祖的區域做法', 'dec-mar.md', /^### 14\. 掃墓／培墓／掛紙/mu, 3],
  [22, '保生大帝聖誕與保生文化祭', 'apr-jul.md', /^### .*dalongdong_baosheng.*/mu, 3],
  [23, '三峽清水祖師聖誕祭典', 'dec-mar.md', /^### 6\. 三峽長福巖清水祖師聖誕祭典/mu, 3],
  [24, '大稻埕霞海城隍迎城隍', 'apr-jul.md', /^### .*dadaocheng_chenghuang.*/mu, 3],
  [26, '媽祖遶境事件群的年度更新', 'dec-mar.md', /^### 15\. 媽祖遶境事件群/mu, 3],
  [27, '端午日期、祭祖與香包／龍舟區分', 'duanwu.md', /^# 端午節主題草稿/mu, 1],
  [28, '關聖帝君聖誕與大溪遶境', 'apr-jul.md', /^### .*daxi_pujitang_guangong.*/mu, 3],
  [29, '口湖牽水車藏', 'apr-jul.md', /^### .*kouhu_qianshuizang.*/mu, 3],
  [31, '南關線王醮與地方王船祭', 'aug-nov.md', /^### 王醮群的合併規則/mu, 3],
  [37, '七夕、七娘媽與做十六歲', 'apr-jul.md', /^### .*qixi.*/mu, 3],
  [38, '鬼門開、開龕門與起燈腳', 'apr-jul.md', /^### .*guimenkai.*/mu, 3],
  [39, '放水燈與中元前置儀式', 'apr-jul.md', /^### .*fangshuideng.*/mu, 3],
  [40, '中元普渡日期、供品與順序', 'apr-jul.md', /^### .*zhongyuan.*/mu, 3],
  [41, '雞籠中元、民雄大士爺、搶孤、義民節', 'apr-jul.md', [/^### .*jilong-zhongyuan.*/mu, /^### .*minxiong_dashiye.*/mu, /^### .*qianggu.*/mu, /^### .*yimin.*/mu], 3],
  [42, '地藏王聖誕與鬼門關', 'apr-jul.md', /^### .*dizang.*/mu, 3],
];

const supplementalSources = new Map([
  [1, ['https://www.cwa.gov.tw/Data/knowledge/announce/astronomy3.pdf']],
  // 2026-08-19：原本是 taiwangods 的臺北孔子廟頁。那個網域授權限個人非商業、不在本站
  // 同意書範圍內，而這裡是**擴散源**——每產一次草稿就把它再種進週稿一次。改掛已授權的
  // 文化部登錄個案「大成至聖先師釋奠典禮」。
  [4, ['https://nchdb.boch.gov.tw/assets/overview/folklore/20110315000001']],
  [6, ['https://www.mjcsg.org.tw/']],
  [17, [
    'https://nchdb.boch.gov.tw/assets/overview/folklore/20100618000008',
    'https://nchdb.boch.gov.tw/assets/overview/folklore/20100618000007',
  ]],
  [26, [
    'https://nchdb.boch.gov.tw/assets/overview/folklore/20100618000008',
    'https://nchdb.boch.gov.tw/assets/overview/folklore/20100618000007',
    'https://nchdb.boch.gov.tw/assets/overview/folklore/20100618000009',
  ]],
  [28, ['https://nchdb.boch.gov.tw/assets/overview/folklore/20111229000001']],
  [39, ['https://tour.klcg.gov.tw/zh-hant/attractions/12369370/']],
]);

function nextHeading(text, start, level) {
  const match = text.slice(start).match(new RegExp('^#{1,' + level + '} (?!#)', 'mu'));
  return match ? start + match.index : text.length;
}

function extract(text, headingPattern, level) {
  const match = headingPattern.exec(text);
  if (!match || match.index == null) throw new Error(`找不到段落：${headingPattern}`);
  return text.slice(match.index, nextHeading(text, match.index + match[0].length, level)).trim();
}

function firstEditorialMarker(text) {
  const marker = /^(?:#{2,6}\s*(?:編輯備註|合併與品質|合併、重複|合併與風險|Merge|尚待補齊|審稿|建議頁面結構|圖片、|圖片／|發布前|審核狀態|交付與審核|自檢結果|月度 release|發布前共同|\d+\.\s*(?:Merge|尚待|審稿|建議頁面結構|發布前))|\*\*(?:編輯備註|canonical／合併風險|圖片／OG／授權|發布前待核欄位|發布前共同檢核|需求驗證))/mu;
  const match = marker.exec(text);
  return match ? match.index : text.length;
}

function cleanText(text) {
  const cleaned = text
    .replace(/^\s*# .+\n?/mu, '')
    .replace(/^\s*## (?:第 \d+ 週|\d{4} 年)[^\n]*\n?/gmu, '')
    .replace(/^\s*>\s*(?:狀態|研究日期|用途|本稿|研究基準)[^\n]*\n?/gmu, '')
    .replace(/^\s*>\s?/gmu, '')
    .replace(/\b(?:content-packet-complete|review-gate|source_required|merge_only|published-refresh|published-merge|published-watch)\b/g, '以當年度公告為準')
    .replace(/正文應|文章應|頁面應|活動頁應|本文應/g, '本文會')
    .replace(/建議釋出窗口/g, '年度更新窗口')
    .replace(/建議呈現/g, '本文呈現方式')
    .replace(/建議 canonical/g, '閱讀位置')
    .replace(/\*\*標題\*\*[:：]?\s*/g, '')
    .replace(/\*\*Lead[^*]*\*\*[:：]?\s*/g, '')
    .replace(/\*\*(?:搜尋意圖|文章定位|主要問題)\*\*[:：]?\s*/g, '')
    .replace(/\*\*(?:可核實 facts|可核對 facts|已核對的獨有 facts|可核實 facts（定稿前需逐句覆核）)\*\*[:：]?\s*/g, '')
    .replace(/\*\*FAQ(?: 草稿|／風險)?\*\*[:：]?\s*/g, '')
    .replace(/^#{2,6}\s+(?:\d+\.\s*)?Lead[^\n]*$/gmu, '## 導讀')
    .replace(/^#{2,6}\s+(?:搜尋意圖與 canonical(?: 判定)?|搜尋意圖判定|文章定位與搜尋意圖|文章定位)$/gmu, '## 這篇先回答什麼')
    .replace(/^#{2,6}\s+(?:\d+\.\s*)?(?:正文草稿|主文草稿|正文初稿|正文)$/gmu, '## 文化脈絡與實用說明')
    .replace(/^#{2,6}\s+(?:\d+\.\s*)?(?:可核實 facts|可核對 facts|已核對的獨有 facts|來源與可核對事實|Facts 組合建議)$/gmu, '## 可核對的文化事實')
    .replace(/^#{2,6}\s+(?:\d+\.\s*)?FAQ(?: 草稿|／風險)?$/gmu, '## 常見問題')
    .replace(/^#{3,6}\s+可直接使用的 lead 與正文草稿$/gmu, '### 文化說明')
    .replace(/^#{3,6}\s+`?\/[^\n]+/gmu, '### 這個主題的地方脈絡')
    .replace(/^#{3,6}\s+(?:標題|Lead)$/gmu, '')
    .replace(/^\*\*正文段落\*\*[:：]?\s*$/gmu, '')
    .replace(/^\s*(?:草稿|初稿)\s*$/gmu, '')
    .replace(/^#{2,6}\s+導讀\s*\n[\s\S]*?(?=^#{2,6}\s|(?![\s\S]))/gmu, '')
    .replace(/^\s*\n{3,}/g, '\n\n')
    .trim();
  return cleaned.split('\n')
    .filter((line) => !/(?:GA4|GSC|工具操作|需求驗證|編輯註|不是已發布正文|不是只列題目|source_type|首版正文|正文骨架|研究資料包|evidence packet|source_required|發布狀態|合併[／與、]|圖片[／／]|既有 canonical|七月群 (?:FAQ 草稿|合併檢查)|事實組合建議|建議標題)/u.test(line))
    .join('\n')
    .replace(/evidence packet/g, '來源資料')
    .replace(/年度資料待核對/g, '以當年度公告為準')
    .replace(/待評估/g, '依既有頁面承接')
    .replace(/(?:^|\n)(## 文化脈絡與實用說明)\n\n\1/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function removePlanningSections(text) {
  return text.replace(/^## 這篇先回答什麼\n[\s\S]*?(?=^### (?:可直接使用|文化說明)|^## |(?![\s\S]))/gmu, '').trim();
}

function removeFaq(text) {
  const match = /(?:^|\n)(?:#{2,6}\s*)?(?:\d+\.\s*)?(?:FAQ(?: 草稿|／風險)?|常見問題)[^\n]*\n?/mu.exec(text);
  if (!match || match.index == null) return text;
  const start = match.index;
  const rest = text.slice(start + match[0].length);
  const next = rest.match(/^#{1,6} (?!#)/mu);
  return `${text.slice(0, start)}\n${next ? rest.slice(next.index) : ''}`;
}

function renderFactTables(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\|\s*ID\s*\|/u.test(lines[i])) {
      out.push(lines[i]);
      continue;
    }
    i += 1;
    const facts = [];
    while (i + 1 < lines.length && /^\|/u.test(lines[i + 1])) {
      i += 1;
      const cells = lines[i].split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.length >= 4) facts.push(`- ${cells[1]}（範圍：${cells[2]}；來源：${cells[3]}）`);
    }
    if (facts.length) out.push(...facts);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractFaq(text) {
  const match = /(?:^|\n)(?:#{2,6}\s*)?(?:\d+\.\s*)?(?:FAQ(?: 草稿|／風險)?|常見問題)[^\n]*\n?/mu.exec(text);
  if (!match || match.index == null) return '';
  const rest = text.slice(match.index + match[0].length);
  const next = rest.match(/^#{1,6} (?!#)/mu);
  return cleanText(rest.slice(0, next ? next.index : rest.length));
}

function extractLead(text, title) {
  const marker = /(?:\*\*Lead[^*]*\*\*|^#{2,6}\s+(?:\d+\.\s*)?Lead[^\n]*)[:：]?\s*/mu.exec(text);
  if (marker && marker.index != null) {
    const after = text.slice(marker.index + marker[0].length);
    const end = after.search(/\n(?:#{2,6}\s|\*\*|\d+\.\s)/m);
    const value = after.slice(0, end < 0 ? after.length : end).trim();
    if (value.length > 40) return cleanText(value);
  }
  const candidate = cleanText(text).split(/\n\s*\n/).map((part) => part.trim())
    .find((part) => part.length > 80 && !part.startsWith('-') && !part.startsWith('|') && !part.startsWith('#') && !/^\d+\./.test(part) && !part.includes('搜尋意圖') && part !== '草稿');
  return candidate || `本文整理「${title}」的文化脈絡、日期判讀與參訪／實作邊界。年度活動的時間、路線、服務與公告會變動，發布時只採當年度可追溯的一手資料。`;
}

function sourceLinks(text) {
  const links = [];
  const seen = new Set();
  const add = (url, label = '來源頁') => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push(`- [${label}](${url})`);
  };
  for (const match of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<!\()(?<![\w"'])https?:\/\/[^\s)）]+/g)) {
    const url = (match[2] || match[0])
      .replace(/[，,]\s*`[^`)]*`?$/u, '')
      .replace(/[`]+$/u, '')
      .replace(/[，。；、）)]+$/u, '');
    add(url, match[1] || '來源頁');
  }
  return links;
}

function parseAnnualMap() {
  const rows = new Map();
  const text = readFileSync('docs/annual-52-week-map.md', 'utf8');
  for (const line of text.split('\n')) {
    const m = /^\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`?([^|]+?)`?\s*\|\s*([^|]+?)\s*\|\s*$/u.exec(line);
    if (m) rows.set(Number(m[1]), { canonical: m[3].trim(), status: m[4].trim(), action: m[5].trim() });
  }
  return rows;
}

function sanitizeAction(action) {
  return String(action)
    .replace(/不把\s*GA4／GSC\s*操作當文章內容/gu, '不把內部成效工具寫成文章內容')
    .replace(/GA4|GSC/gu, '內部成效資料')
    .replace(/`/g, '')
    .replace(/evidence packet/g, '研究資料包')
    .trim();
}

function answerFaq(title, lead, row) {
  const action = sanitizeAction(row?.action || '年度日期、路線、交通與服務資訊發布前以官方公告核對。');
  return [
    `### ${title} 主要在說什麼？\n${lead}`,
    '### 日期或活動時間固定嗎？\n文化脈絡可以先讀；國曆換算、年度場次、起駕時刻、路線、交通與報名若會變動，必須以當年度政府、文化資產保存者或主辦單位公告為準。',
    `### 今年要去哪裡查最新資訊？\n${action} 本文不以去年的新聞或社群轉貼推算今年安排。`,
  ].join('\n\n');
}

function focusRaw(week, raw) {
  const range = (startPattern, endPattern) => {
    const start = raw.search(startPattern);
    if (start < 0) return raw;
    const tail = raw.slice(start);
    const end = tail.search(endPattern);
    return tail.slice(0, end > 0 ? end : tail.length).trim();
  };
  if (week === 1 || week === 4) {
    const needle = week === 1 ? '白露與秋分' : '孔子誕辰';
    const withoutFaq = raw.replace(/\n\s*\*\*[^*]*FAQ[^*]*\*\*[\s\S]*$/u, '');
    return withoutFaq.split(/\n\s*\n/).filter((part) => part.includes(needle)).join('\n\n') || withoutFaq;
  }
  if (week === 5) return range(/^## 2\. 已核對的獨有 facts/mu, /^## 5\. /mu);
  if (week === 10) return range(/^## 主文草稿/mu, /^## 合併與品質風險/mu);
  if (week === 27) return range(/^## 2\. 已核對的獨有 facts/mu, /^## 4\. /mu);
  if (week === 17 || week === 18 || week === 26) {
    const label = { 17: '15A', 18: '15B', 26: '15C' }[week];
    const start = raw.search(new RegExp(`^#### ${label}\\.`, 'mu'));
    if (start >= 0) {
      const tail = raw.slice(start);
      const end = tail.search(/^#### 15[BC]\. /mu);
      return tail.slice(0, end > 0 && label !== '15C' ? end : tail.length).trim();
    }
  }
  if (week === 31) return raw.split(/\n\s*\n/).find((part) => part.includes('南關線')) || raw;
  return raw;
}

const annual = parseAnnualMap();
mkdirSync(outputDir, { recursive: true });
for (const [week, title, sourceFile, headingPattern] of mappings) {
  const source = readFileSync(join('docs/topic-drafts', sourceFile), 'utf8');
  const patterns = Array.isArray(headingPattern) ? headingPattern : [headingPattern];
  const entry = mappings.find((candidate) => candidate[0] === week);
  const level = entry?.[4] ?? (sourceFile === 'missing-weeks.md' ? 2 : 3);
  const raw = focusRaw(week, patterns.map((pattern) => extract(source, pattern, level)).join('\n\n'));
  const publicRaw = raw.slice(0, firstEditorialMarker(raw));
  const lead = extractLead(publicRaw, title);
  let clean = renderFactTables(removePlanningSections(cleanText(removeFaq(publicRaw))));
  if (clean.replace(/\s+/gu, '').length < 700) {
    clean += `\n\n### 閱讀範圍\n${title}的常年資料適合先用文化資產、地方政府或主辦單位的原始資料理解；年度國曆日期、活動時刻、路線、交通、報名與服務內容則要在公告出現後逐項更新。不同地區即使使用相同名稱，也可能有不同主辦廟、祭典週期與參與規則，因此本文只把有明確範圍的做法寫成案例，不把單一地方的說法推成全臺通則。`;
  }
  const faq = extractFaq(publicRaw) || answerFaq(title, lead, annual.get(week));
  const links = sourceLinks(publicRaw);
  for (const url of supplementalSources.get(week) || []) {
    if (!links.some((link) => link.includes(`(${url})`))) links.push(`- [補充官方來源](${url})`);
  }
  const row = annual.get(week) || {};
  const action = sanitizeAction(row.action || '年度日期、路線、交通與服務資訊，發布前以當年度一手公告核對。');
  const canonical = row.canonical || '依既有 canonical 與內鏈規則承接';
  const article = [
    '---', `week: ${week}`, `title: ${title}`, 'status: article-ready',
    `canonical: ${canonical}`, `source_packet: docs/topic-drafts/${sourceFile}`,
    `annual_status: ${row.status || 'review-gate'}`, 'publish_at: annual-source-check', '---', '',
    `# ${title}`, '', lead, '',
    '## 這篇文章怎麼讀', '',
    `本文先處理「${title}」的文化脈絡與讀者常查的日期／差異；會變動的活動日期、路線、服務與報名資訊，僅在官方公告後更新。`, '',
    '## 文化脈絡與實用說明', '', clean, '',
    '## 年度資料怎麼維護', '',
    `本篇的常年文化說明可直接沿用；${action} 年度資料只在官方公告出現後更新，未公告時不填猜測日期或路線。`, '',
    '## 常見問題', '', faq, '',
    '## 來源', '', ...(links.length ? links : ['- 來源清單待逐句核對；發布前不得以搜尋摘要取代原始頁。']), '',
    '## 延伸閱讀', '', `本週承接位置：${canonical}。相關日期、習俗、神明或活動資訊應回到各自 canonical，避免把同義查詢拆成重複頁。`, '',
  ].join('\n').replace(/\n{4,}/g, '\n\n\n');
  writeFileSync(join(outputDir, `week-${String(week).padStart(2, '0')}.md`), article, 'utf8');
}
console.log('完整文章稿整理完成：52 篇（每週一篇）');
