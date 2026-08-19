#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 把查源批次的 JSON 轉成 `src/data/events.json` 的活動頁條目。乾跑預設。
// ═══════════════════════════════════════════════════════════════════════════
//
// 為什麼要有這支（2026-08-19）：內政部地方宗教慶典清單有 30 項還沒有專屬頁，
// 分四批派工查源，每批回一份形狀相同的 JSON。手工把它們搬進 events.json 會出現
// 兩種錯：漏欄位、以及每批格式漂一點——那正是本 repo 反覆踩到的「同一件事做很多份」。
//
// 🔴 只搬 `verdict` 是「可產頁」的項目。**「部分可產」與「不可產頁」一律不搬**——
//    查無權威源就不產頁是本 repo 第一紅線，這支不提供繞過的方法。
// 🔴 caseId 一律比對 `src/data/nchdb-folklore-index.json`，對不上直接拒收整批。
//    （2026-08-19 的事故：三頁掛了不存在的 caseId 撐了約四個月，nchdb 前台驗不出來。）
//
// 用法：
//   node scripts/build-events-from-batch.mjs <batch.json>            # 乾跑
//   node scripts/build-events-from-batch.mjs <batch.json> --write    # 實際寫入

import { readFileSync, writeFileSync } from 'node:fs';

const EVENTS = 'src/data/events.json';
const INDEX = 'src/data/nchdb-folklore-index.json';
const [batchPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const WRITE = process.argv.includes('--write');
if (!batchPath) {
  console.error('用法：node scripts/build-events-from-batch.mjs <batch.json> [--write]');
  process.exit(2);
}

const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
const events = JSON.parse(readFileSync(EVENTS, 'utf8'));
const known = new Set(JSON.parse(readFileSync(INDEX, 'utf8')).items.map((x) => x.case_id));
const existing = new Set(events.map((e) => e.id));

const problems = [];
const built = [];

for (const it of batch.items ?? []) {
  const verdict = String(it.verdict ?? '');
  if (!verdict.includes('可產頁') || verdict.includes('不可產頁')) {
    console.log(`  ⏭  ${it.lc_id} ${it.name}：${verdict || '(無判定)'} → 不產頁`);
    continue;
  }
  if (verdict.startsWith('部分')) {
    console.log(`  ⏭  ${it.lc_id} ${it.name}：部分可產 → 本支不搬，缺的那塊要人判斷`);
    continue;
  }
  const id = it.suggested_event_id;
  if (!id) { problems.push(`${it.lc_id} 沒有 suggested_event_id`); continue; }
  if (existing.has(id)) { console.log(`  ⏭  ${id} 已存在，略過`); continue; }
  if (it.case_id && !known.has(it.case_id)) {
    problems.push(`${it.lc_id} 的 caseId ${it.case_id} 不在名錄快照內——掛源掛到不存在的個案`);
    continue;
  }

  // 公告欄位正規化：查源批次常直接把 nchdb 的原始物件貼過來
  // （classification／officialDocNo／registerDate），但 repo 的 schema 是
  // { date, doc, note } 且 doc 必填。不轉就會在 astro check 被擋（實測過）。
  const announcements = (it.announcements ?? [])
    .map((a) => ({
      date: String(a.date ?? a.registerDate ?? '').slice(0, 10),
      doc: String(a.doc ?? a.officialDocNo ?? ''),
      ...(a.note || a.classification ? { note: a.note || a.classification } : {}),
    }))
    .filter((a) => a.date && a.doc);

  const sources = (it.sources ?? []).map((s) => ({
    type: s.type ?? 'gov',
    ref: s.ref,
    ...(s.note ? { note: s.note } : {}),
  }));
  const facts = (it.facts ?? [])
    .filter((f) => f.text && f.source_ref)
    .map((f) => ({
      text: f.text,
      sources: [{ type: 'gov', ref: f.source_ref, ...(f.source_note ? { note: f.source_note } : {}) }],
    }));

  const entry = {
    id,
    name: it.name,
    ...(it.host_temple_id ? { host_temple: it.host_temple_id } : {}),
    main_deity: it.main_deity ?? 'mazu',
    type: it.type ?? [],
    chen_tou: [],
    cycle: it.cycle ?? 'annual',
    ke_rule: it.ke_rule ?? null,
    date_resolution: it.date_resolution ?? 'undetermined',
    ...(it.date_note ? { date_note: it.date_note } : {}),
    route_mode: it.route_mode ?? 'undetermined',
    // 🔴 沒有登錄個案就**不給 heritage**：掛一個空的「文化資產登錄資料」區塊會誤導
    //    （2026-08-19 實測過，那個區塊會渲染出來）。
    ...(it.case_id
      ? {
          heritage: {
            level: it.classify === '重要民俗' ? 'national_important' : 'municipal',
            ...(it.authority_ref ? { authority_ref: it.authority_ref } : {}),
            verified: true,
            case_id: it.case_id,
            ...(it.authority ? { authority: it.authority } : {}),
            ...(it.preservers?.length ? { preservers: it.preservers } : {}),
            ...(it.venue ? { venue: it.venue } : {}),
            ...(announcements.length ? { announcements } : {}),
            ...(it.register_reason ? { register_reason: it.register_reason } : {}),
            ...(it.history ? { history: it.history } : {}),
            ...(it.notices?.length ? { notices: it.notices } : {}),
          },
        }
      : {}),
    region: it.region ?? [],
    sources,
    draft: false,
    ...(facts.length ? { facts } : {}),
  };
  built.push(entry);
  console.log(`  ✔  ${id}　${it.name}（facts ${facts.length}｜caseId ${it.case_id ?? '無'}）`);
}

if (problems.length) {
  console.error(`\n✗ 有 ${problems.length} 個問題，整批不寫入：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`\n可產 ${built.length} 頁`);
if (!WRITE) {
  console.log('（乾跑，未寫檔。加 --write 才實際寫入）');
  process.exit(0);
}
events.push(...built);
writeFileSync(EVENTS, `${JSON.stringify(events, null, 2)}\n`);
console.log(`✓ 已寫入 ${EVENTS}（events 總數 ${events.length}）`);
