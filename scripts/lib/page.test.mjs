// Page（吃 dist 的 gate 共用的 HTML 讀解層）的 fixture 測試 —— 純字串輸入，秒級。
//
// 為何存在：Page 的消費者全部吃 dist，而 dist 要 20 分鐘 build 才有；沒有這支
// 測試的話，「改一行讀法」的回饋迴圈就是一次完整 build。**手寫 HTML 字串**驗欄位
// 抽取，才能在秒級擋住讀法迴歸。
//
// 🔴 這支只驗「怎麼讀」，不驗「怎麼判」：括號幾種、http 怎麼認、報告截幾條
//    留在各 gate 自己身上（見 page.mjs 檔頭）。
//
// 跑法：node scripts/lib/page.test.mjs
// ⚠️ 2026-08-20 現況：**尚未登記進 gate manifest**（scripts/lib/gates.mjs）與 package.json，
//    所以沒有任何自動流程會跑它——正是 gates.mjs 檔頭「缺陷②」講的那種孤兒腳本。
//    要收編：package.json 加 "test:page": "node scripts/lib/page.test.mjs"，
//    並在 gates.mjs 加一條 { id: 'test:page', needs: 'source', speed: 'fast', stages: [...] }。
import { Page, decode, visibleText, attr } from './page.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}`); };

const HTML = `<!doctype html><html><head>
<title>大甲鎮瀾宮｜folk.tw</title>
<meta name="description" content="大甲鎮瀾宮位於臺中市大甲區，主祀天上聖母。">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:image" content="https://folk.tw/og/temples/x.png">
<link rel="canonical" href="https://folk.tw/temples/x/">
<script type="application/ld+json">{"@graph":[{"@type":"FAQPage"},{"@type":["Place","Temple"]}]}</script>
<script type="application/ld+json">{ 壞掉的 JSON </script>
</head><body>
<nav><a href="/">首頁</a></nav>
<main>
<h1>大甲鎮瀾宮</h1>
<section class="temple-qifu"><p>祈福區塊 <a href="/qiugian/">線上求籤</a></p></section>
<p>AT&amp;T 與 &quot;引號&quot;&nbsp;與零寬​字元</p>
<img src="/photos/a.jpg" alt="a"><img src="/photos/b.jpg" alt="b">
<a href="https://example.com"><img src="/i.png" alt="圖">  文化部
  國家文化資產網 </a>
<style>.x{color:red}</style><script>var hidden = 1;</script>
</main>
<footer><a href="/about/">關於</a></footer>
</body></html>`;

const page = new Page('dist/temples/x/index.html', HTML);

// 1) title / description 抽取
t('title 抽取', page.title() === '大甲鎮瀾宮｜folk.tw');
t('description 抽取', page.description() === '大甲鎮瀾宮位於臺中市大甲區，主祀天上聖母。');
t('無 title 頁回空字串', new Page('f', '<html><head></head></html>').title() === '');
t('無 description 頁回空字串', new Page('f', '<html><head></head></html>').description() === '');

// 2) meta / canonical
t('meta(name,robots)', page.meta('name', 'robots') === 'index,follow,max-image-preview:large');
t('meta(property,og:image)', page.meta('property', 'og:image') === 'https://folk.tw/og/temples/x.png');
t('meta 查無回空字串', page.meta('name', 'twitter:card') === '');
t('canonical 抽取', page.canonical() === 'https://folk.tw/temples/x/');
t('canonical 查無回空字串', new Page('f', '<html></html>').canonical() === '');

// 3) 🔴 刻意保留的讀法差異：內文含未跳脫角括號時，字面法完整、標籤法被截短。
//    這是 check-content-quality／runner（字面）與 check-discover（標籤）的實際分歧，
//    dist 上實測 4 頁命中。測試把它釘住，避免有人「順手統一」而無聲改變 gate 鬆緊度。
const ANGLE = '<html><head><meta name="description" content="渡海來台<台南州祠廟名鑑詳記>迄今三百年">'
  + '</head><body></body></html>';
const anglePage = new Page('f', ANGLE);
t('角括號：description() 完整', anglePage.description() === '渡海來台<台南州祠廟名鑑詳記>迄今三百年');
t('角括號：meta() 被截短（既有差異，非 bug 修正）', anglePage.meta('name', 'description') === '渡海來台<台南州祠廟名鑑詳記>');

// 4) section 命中與未命中（含 sectionStats 統計）
const stats = new Map();
const p2 = new Page('dist/temples/x/index.html', HTML, { sectionStats: stats });
t('section 命中回內文', /祈福區塊/.test(p2.section('temple-qifu') ?? ''));
t('section 未命中回 undefined', p2.section('temple-festivals') === undefined);
t('sectionStats 記命中', stats.get('temple-qifu')?.hit === 1 && stats.get('temple-qifu')?.miss === 0);
t('sectionStats 記落空', stats.get('temple-festivals')?.miss === 1 && stats.get('temple-festivals')?.hit === 0);
p2.section('temple-qifu');
t('section 快取：重複問不重複計數', stats.get('temple-qifu').hit === 1);

// 5) anchors 的可見文字
const anchors = page.anchors();
t('anchors 全頁都掃到（nav/main/footer）', anchors.length === 4);
t('anchors 去巢狀標籤只留可見文字', anchors[2].text === '文化部 國家文化資產網');
t('anchors 保留原始內文供各 gate 自判', anchors[2].inner.includes('<img'));
t('anchors 純文字項', anchors[0].text === '首頁' && anchors[1].text === '線上求籤' && anchors[3].text === '關於');

// 6) HTML entity 還原
t('decode &amp;', decode('AT&amp;T') === 'AT&T');
t('decode &quot; &#39; &apos;', decode('&quot;a&#39;b&apos;c&quot;') === '"a\'b\'c"');
t('decode &lt; &gt; &nbsp;', decode('&lt;p&gt;a&nbsp;b') === '<p>a b');
t('decode 對 null 安全', decode(null) === '' && decode(undefined) === '');
t('visibleText 會 decode', page.mainText().includes('AT&T 與 "引號" 與零寬字元'));

// 7) 可見文字：去 script/style、去零寬、收斂空白
t('mainText 去掉 script 內容', !page.mainText().includes('var hidden'));
t('mainText 去掉 style 內容', !page.mainText().includes('color:red'));
t('mainText 不含 nav／footer 文字', !page.mainText().includes('首頁') && !page.mainText().includes('關於'));
t('text() 含 nav／footer 文字', page.text().includes('首頁') && page.text().includes('關於'));
t('visibleText 去零寬字元', visibleText('a​b﻿c') === 'abc');
t('無 <main> 時 main() 回空字串', new Page('f', '<body><p>x</p></body>').main() === '');

// 8) h1 / img / JSON-LD
t('h1 文字', page.h1() === '大甲鎮瀾宮');
t('mainH1Count', page.mainH1Count() === 1);
t('h1 去巢狀標籤', new Page('f', '<h1><span>甲</span>乙</h1>').h1() === '甲乙');
t('mainImages 只算 main 內的', page.mainImages().length === 3);
t('jsonLdTypes 去重排序＋略過壞區塊',
  page.jsonLdTypes().join(',') === 'FAQPage,Place,Temple');

// 9) route 與 attr
t('route 去掉 dist 前綴', page.route === '/temples/x/index.html');
t('route 根路徑', new Page('dist', '').route === '/');
t('attr 屬性順序無關', attr('<meta content="c" name="description">', 'name') === 'description');
t('attr 查無回空字串', attr('<meta name="x">', 'content') === '');

console.log(`\n${fail === 0 ? '✅' : '❌'} 通過 ${pass}／失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
