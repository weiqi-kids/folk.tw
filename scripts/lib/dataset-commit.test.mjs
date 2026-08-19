// dataset-commit 的 fixture 測試 —— 本 repo 第二支測試。
//
// 為何存在：這支 adapter 的整個價值是「讓匯入器的合併與寫入邏輯可以在不碰
// src/data/ 的情況下被驗證」。測試若不落地成 gate，那個價值就只存在於口頭。
//
// 🔴 第 8 項（缺 path 直接丟錯）守的是本 repo 記過的失敗模式：寫入落點錯不會
//    紅燈，會安靜成功、隔天才發現沒資料。那條路必須是「炸」，不是「預設」。
//
// 跑法：pnpm test:dataset-commit（gate manifest 的 fast 層）。
import { readFileSync, existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachSource, cliFlags, commitDataset, decodeEntities, diffRecords, norm } from './dataset-commit.mjs';
// 暫存目錄自理：不吃 argv，才能當 gate 直接跑（pnpm test:dataset-commit）。
const DIR = process.argv[2] ?? join(tmpdir(), `dataset-commit-test-${process.pid}`);
rmSync(DIR, { recursive: true, force: true });
const P = `${DIR}/nested/out.json`;
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}`); };

// 1) 路徑可覆寫 + 首次寫入（父目錄自動建）
let r = commitDataset({ path: P, data: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }], write: true, reportDiff: false, doneNote: null });
t('首次寫入建立檔案', existsSync(P) && r.wrote && r.added === 2);
t('格式＝縮排 2 ＋結尾換行', readFileSync(P, 'utf8') === '[\n  {\n    "id": "a",\n    "v": 1\n  },\n  {\n    "id": "b",\n    "v": 1\n  }\n]\n');

// 2) 差異量：一更新、一新增、一未變
r = commitDataset({ path: P, data: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }], write: true, reportDiff: false, doneNote: null });
t('新增1/更新1/未變1', r.added === 1 && r.updated === 1 && r.unchanged === 1 && r.removed === 0);

// 3) 內容相同 → 不重寫
r = commitDataset({ path: P, data: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }], write: true, reportDiff: false, doneNote: null });
t('內容相同不重寫', r.wrote === false && r.identical === true);

// 4) 乾跑不落地
const before = readFileSync(P, 'utf8');
r = commitDataset({ path: P, data: [{ id: 'z', v: 9 }], write: false, reportDiff: false, dryNote: null });
t('乾跑不改檔、但算得出差異', readFileSync(P, 'utf8') === before && r.wrote === false && r.added === 1 && r.removed === 3);

// 5) 移除暫存檔（原子寫入不留垃圾）
t('原子寫入不留 .commit-tmp', !readdirSync(`${DIR}/nested`).some((f) => f.includes('commit-tmp')));

// 6) 信封物件走 items
const E = `${DIR}/env.json`;
r = commitDataset({ path: E, data: { source: { ref: 'x' }, items: [{ id: '1' }] }, write: true, reportDiff: false, doneNote: null });
t('信封物件以 items 逐筆比對', r.added === 1 && JSON.parse(readFileSync(E, 'utf8')).source.ref === 'x');

// 7) 沒有 id 的資料 → 退回整檔比對，不硬猜
t('無 id 退回整檔比對', diffRecords([{ x: 1 }], [{ x: 2 }]).byId === false);

// 8) 缺 path 要炸，不可默默寫到別處
let threw = false;
try { commitDataset({ data: [], write: true }); } catch { threw = true; }
t('缺 path 直接丟錯', threw);

// 9) attachSource 兩種去重判準
const n1 = {};
t('首次掛源', attachSource(n1, { ref: 'R', note: 'n' }) === true && n1.sources.length === 1);
t('完全相同不重複加', attachSource(n1, { ref: 'R', note: 'n' }) === false && n1.sources.length === 1);
t('ref 不同就會加', attachSource(n1, { ref: 'R2' }) === true && n1.sources.length === 2);
const n2 = { sources: [{ type: 'gov', ref: 'a cid=7 b' }] };
t('dedupeBy 片段命中就不加', attachSource(n2, { ref: 'a cid=7 c' }, { dedupeBy: 'cid=7' }) === false);
t('dedupeBy 片段沒中就加', attachSource(n2, { ref: 'a cid=8 c' }, { dedupeBy: 'cid=8' }) === true);

// 10) norm / decodeEntities
t('norm 臺→台＋刪全部空白', norm(' 臺 北\t保安宮 ') === '台北保安宮');
t('norm 對 null 安全', norm(null) === '' && norm(undefined) === '');
t('decodeEntities 數值型', decodeEntities('X&#63886;Y&#x4E00;Z') === 'X\u{F98E}Y一Z');
t('decodeEntities &amp; 放最後', decodeEntities('&amp;#39;') === '&#39;');
t('decodeEntities nbsp', decodeEntities('a&nbsp;b') === 'a b');

// 11) cliFlags 可注入 argv（＝可測）
const f = cliFlags(['--write', '--sample', '20']);
t('cliFlags 注入 argv', f.write === true && f.value('--sample') === '20' && f.verbose === false);
t('cliFlags 旗標在結尾時 value 回 null', cliFlags(['--sample']).value('--sample') === null);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${fail === 0 ? '✅' : '❌'} 通過 ${pass}／失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
