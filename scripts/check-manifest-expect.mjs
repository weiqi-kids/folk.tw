#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 發布前回測：manifest 的每一條 `expect`，拿本機真的有的樣本跑一次
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 這道 gate 為什麼存在（2026-08-20 事故）：
//    v18 送出去的 14 個 knowledge-list job，`expect.contains` 寫成未跳脫的
//    `Knowledge/Content?ci=2&cid=`，而來源 HTML 逐字輸出 `...&amp;cid=`。
//    結果 14 個 job **全部驗不過、一個 byte 都沒落地**，還因為台灣端「連續 5 次失敗
//    提前收工」的規則，每天餓死排在後面的所有 job。
//    最刺眼的是：**基準檔就躺在本機 inbox 裡**（cid=3，未跳脫 0 次／跳脫 212 次），
//    也就是那條規則從來沒有被任何東西驗證過就發給對方了。
//
// 🔴 判定用的是 scripts/lib/intake-expect.mjs 的同一支 checkExpect——
//    **不要在這裡重寫一份「差不多的」邏輯**，那就是本 repo 反覆記著的
//    「同一事實兩個真實來源」，兩邊遲早漂移，而漂移的那天沒有東西會報錯。
//
// 判定規則：
//   ① job 自己的檔在本機 → 一定回測，不過就紅燈。
//   ② job 自己的檔還沒收到，但有**結構同型**的既有樣本（SAMPLE_FOR）→ 一樣回測。
//      這是這道 gate 真正的價值：新 job 在發出去之前就被驗過。
//   ③ 兩者都沒有 → 只列出來提醒，不擋。全新型態的來源本來就無從事前回測。
//
// 用法：node scripts/check-manifest-expect.mjs [--verbose]
// ⚠️ 失敗一律 process.exit(1)（本 repo 明列的坑：process.exitCode 會被後續程式覆寫）。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { checkExpect } from './lib/intake-expect.mjs';

const INBOX = '/root/.config/folk-tw/intake/inbox';
const MANIFEST = 'docs/intake-manifest.json';
const VERBOSE = process.argv.includes('--verbose');

// 「結構同型的既有樣本」對照表。key＝job id 的正則，value＝inbox 內的相對路徑。
// 🔴 加一筆之前先確認**真的同型**（同一個站、同一個頁型），不是「看起來很像」——
//    拿不同型的樣本回測會產生假綠燈，比沒有這道 gate 更糟。
const SAMPLE_FOR = [
  {
    // 宗教知識+ 的 15 個分類列表頁：台灣端 2026-08-20 逐一驗過 14 個新分類與 cid=3
    // 結構完全相同（都有 <a href="/Knowledge/Content?ci=2&amp;cid=N"> 與 pageword），
    // 所以 cid=3 這份可以拿來回測其餘 14 個。
    re: /^knowledge-list-cid\d+$/,
    sample: 'misc/knowledge-deities-list-cid3.html',
    why: '宗教知識+ 分類列表頁（台灣端 2026-08-20 驗過 15 個分類同型）',
  },
];

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const jobKind = (j) => (j.url_list ? 'url_list' : j.paginate ? 'paginate' : j.dest ? 'file' : 'unknown');

/** 回傳 { path, expect, via } 或 null。via＝'own'（自己的檔）／'sibling'（同型樣本）。 */
function sampleFor(j) {
  const kind = jobKind(j);
  if (kind === 'file') {
    const own = join(INBOX, j.dest);
    if (existsSync(own)) return { path: own, expect: j.expect, via: 'own' };
  }
  if (kind === 'paginate') {
    const dir = join(INBOX, dirname(j.paginate.dest_template));
    const f = existsSync(dir) ? readdirSync(dir).find((x) => !x.endsWith('.sha256') && !x.endsWith('.meta.json')) : null;
    if (f) return { path: join(dir, f), expect: j.paginate.expect_per_page ?? j.expect, via: 'own' };
  }
  if (kind === 'url_list') {
    const dir = join(INBOX, j.dest_dir ?? '');
    const f = existsSync(dir) ? readdirSync(dir).find((x) => !x.endsWith('.sha256') && !x.endsWith('.meta.json')) : null;
    if (f) return { path: join(dir, f), expect: j.expect_per_item ?? j.expect, via: 'own' };
  }
  const sib = SAMPLE_FOR.find((s) => s.re.test(j.id));
  if (sib) {
    const p = join(INBOX, sib.sample);
    if (existsSync(p)) return { path: p, expect: j.expect, via: 'sibling', why: sib.why };
  }
  return null;
}

const failures = [];
const untested = [];
let tested = 0;

for (const j of manifest.jobs) {
  const expect = j.expect ?? j.expect_per_item ?? j.paginate?.expect_per_page;
  if (!expect) continue;
  const s = sampleFor(j);
  if (!s || !s.expect) { untested.push(j.id); continue; }

  // meta 只在自己的檔旁邊才有意義；同型樣本的 meta 是別的 job 的，不拿來驗 http_status。
  let meta = null;
  if (s.via === 'own' && existsSync(`${s.path}.meta.json`)) {
    try { meta = JSON.parse(readFileSync(`${s.path}.meta.json`, 'utf8')); } catch { /* 側檔壞掉不影響內容判定 */ }
  }
  const buf = readFileSync(s.path);
  const problems = checkExpect(buf, s.expect, null, meta);
  tested += 1;
  if (problems.length) {
    failures.push({ id: j.id, via: s.via, path: s.path, why: problems, sampleWhy: s.why });
  } else if (VERBOSE) {
    console.log(`  ✓ ${j.id.padEnd(26)} ${s.via === 'own' ? '自身樣本' : '同型樣本'} ${s.path.replace(INBOX + '/', '')}`);
  }
}

if (failures.length) {
  console.error(`✗ manifest expect 回測失敗 ${failures.length} 個 job：\n`);
  for (const f of failures) {
    console.error(`  ✗ ${f.id}`);
    console.error(`      樣本：${f.path.replace(INBOX + '/', '')}（${f.via === 'own' ? '自身' : `同型：${f.sampleWhy ?? ''}`}）`);
    for (const w of f.why) console.error(`      ${w}`);
  }
  console.error('\n🔴 這條 expect 送出去，台灣端會抓到檔卻一個 byte 都不落地，而且');
  console.error('   「連續 5 次失敗提前收工」會餓死排在後面的所有 job——每天都發生，直到你修好。');
  console.error('   ⚠️ 常見成因：來源 HTML 輸出的是 `&amp;` 而 expect 寫了 `&`。以樣本的原始 bytes 為準。');
  process.exit(1);
}

console.log(`✓ manifest expect 回測通過：${tested} 個 job 以本機樣本實跑判定`);
if (untested.length) {
  console.log(`  （另 ${untested.length} 個尚無可回測的樣本，屬預期：${untested.join('、')}）`);
  console.log('  要讓新 job 在發出去之前就被驗到，就在 SAMPLE_FOR 加一筆結構同型的既有樣本。');
}
