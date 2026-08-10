#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = {
  store: 'src/lib/poem-shelf.ts',
  shelf: 'src/components/PoemShelf.astro',
  detail: 'src/pages/poems/[id].astro',
  hub: 'src/pages/poems/index.astro',
  draw: 'src/pages/qiugian/[slug].astro',
  drawHub: 'src/pages/qiugian/index.astro',
};
const src = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8')]));
const failures = [];
const requireMatch = (key, re, message) => { if (!re.test(src[key])) failures.push(`${files[key]}：${message}`); };

requireMatch('store', /folk_poem_saved_v1/, '缺收藏 localStorage 版本鍵');
requireMatch('store', /folk_poem_recent_v1/, '缺最近查過 localStorage 版本鍵');
requireMatch('store', /MAX_SAVED_POEMS = 12/, '收藏上限需與靜態槽位同源');
requireMatch('store', /MAX_RECENT_POEMS = 8/, '最近查過上限需與靜態槽位同源');
if (/\b(?:fetch|sendBeacon|XMLHttpRequest)\b/.test(src.store)) failures.push(`${files.store}：本機收藏資料層不可對外傳送資料`);
requireMatch('shelf', /data-saved-slot/, '缺預渲染收藏槽位');
requireMatch('shelf', /data-recent-slot/, '缺預渲染最近查過槽位');
if (/innerHTML|insertAdjacentHTML|createElement/.test(src.shelf)) failures.push(`${files.shelf}：列表必須更新預渲染節點，不可動態注入 DOM`);
requireMatch('hub', /<PoemShelf\s*\/>/, '籤詩總覽缺「我的籤詩」入口');
requireMatch('drawHub', /\/poems\/#my-poems/, '求籤入口缺收藏與最近查過連結');
requireMatch('detail', /data-poem-save/, '籤詩詳情缺靜態收藏按鈕');
requireMatch('detail', /rememberPoem\(item\)/, '開啟籤詩未寫入最近查過');
requireMatch('detail', /save_poem/, '缺 save_poem 事件');
requireMatch('detail', /revisit_saved_poem/, '缺 revisit_saved_poem 事件');
requireMatch('draw', /rememberPoem\(\{/, '求籤完成未寫入最近查過');

if (failures.length) {
  console.error(`籤詩收藏 gate 失敗（${failures.length}）：\n${failures.map((x) => `- ${x}`).join('\n')}`);
  process.exit(1);
}
console.log('✓ 籤詩收藏 gate 通過：詳情收藏、求籤/開頁最近紀錄、靜態回訪槽與無外傳資料層均已接通。');
