#!/usr/bin/env node
// 觀光署景點資料 → temples.json 的 intro／open_time／website。
//
// 用途：站上 7,891 間廟只有 22 間有沿革（`history`，逐間查證的敘述句）。
//       交通部觀光署「觀光資訊資料庫－景點」（政府資料開放平臺 7777，OGDL 1.0）
//       對部分宮廟有官方介紹文字、開放時間與官網，授權乾淨（可再散布、需標示出處）。
//
// 🔴 為什麼不是用內政部全國宗教資訊網的「歷史沿革」（4,325 筆，量大 30 倍）：
//    那份**不在任何開放資料集裡**，只存在於網站的 GetUploadFile；該站版權宣告第三條
//    明禁未經書面同意轉載、重製、散布。已於 2026-08-05 送出洽詢函，未獲同意前不匯入。
//    詳見 docs/taiwan-host-handoff.md §「授權盤點」。
//
// 規則一律走 scripts/lib/tourism-intro.mjs（**匯入器與 check:integrity 共用**，勿在此重寫）。
//
// 用法：
//   node scripts/import-tourism.mjs              # 乾跑（預設，只印報告不寫檔）
//   node scripts/import-tourism.mjs --write      # 實際寫回 src/data/temples.json
//   node scripts/import-tourism.mjs --file <zip> # 用本機既有 zip，不連外
//
// ⚠️ 不覆蓋既有資料：`history` 一個字都不碰（那 22 間品質高於觀光文案，顯示層永遠讓它優先）；
//    `website` 只補**空值**；重跑 idempotent。
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TOURISM_SOURCE, acceptIntro, TEMPLE_NAME_END, tw, coreName, normAddr,
} from './lib/tourism-intro.mjs';

const ZIP_URL = 'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip';
const TEMPLES = 'src/data/temples.json';
const WRITE = process.argv.includes('--write');
const fileArg = process.argv.indexOf('--file');
const LOCAL = fileArg > -1 ? process.argv[fileArg + 1] : null;

// ── 取得來源 ────────────────────────────────────────────────────────────────
function loadAttractions() {
  const dir = mkdtempSync(join(tmpdir(), 'folk-tourism-'));
  const zip = LOCAL ?? join(dir, 'a.zip');
  if (!LOCAL) {
    execFileSync('curl', ['-sSL', '--max-time', '180', '-o', zip, ZIP_URL]);
  }
  if (!existsSync(zip)) throw new Error(`來源 zip 不存在：${zip}`);
  execFileSync('unzip', ['-o', '-q', zip, 'AttractionList.json', '-d', dir]);
  const raw = readFileSync(join(dir, 'AttractionList.json'), 'utf8').replace(/^﻿/, '');
  const j = JSON.parse(raw);
  if (!Array.isArray(j.Attractions)) throw new Error('AttractionList.json 結構非預期（缺 Attractions 陣列）');
  return { rows: j.Attractions, updated: j.UpdateTime ?? '' };
}

// ── 對映：地址精確優先，其次縣市內廟名唯一 ────────────────────────────────────
// 🔴 刻意不放寬到模糊比對。同 docs/festival-data-import.md 的裁示：同名無法消歧者一律捨棄，
//    張冠李戴（把 A 廟的沿革掛到 B 廟）比沒有資料更糟。
function buildMatcher(temples) {
  const byAddr = new Map();
  const byName = new Map();
  for (const t of temples) {
    const a = normAddr(t.district);
    (byAddr.get(a) ?? byAddr.set(a, []).get(a)).push(t);
    const k = `${tw(t.district).slice(0, 3)}|${coreName(t.name)}`;
    (byName.get(k) ?? byName.set(k, []).get(k)).push(t);
  }
  return (r) => {
    const pa = r.PostalAddress ?? {};
    const full = normAddr(`${pa.City ?? ''}${pa.Town ?? ''}${pa.StreetAddress ?? ''}`);
    const a = byAddr.get(full);
    if (a?.length === 1) return { temple: a[0], how: '地址' };
    const n = byName.get(`${tw(pa.City ?? '').slice(0, 3)}|${coreName(r.AttractionName)}`);
    if (n?.length === 1) return { temple: n[0], how: '廟名' };
    return null;
  };
}

const has = (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);

// ── 主流程 ──────────────────────────────────────────────────────────────────
const temples = JSON.parse(readFileSync(TEMPLES, 'utf8'));
const { rows, updated } = loadAttractions();
const cand = rows.filter((r) => TEMPLE_NAME_END.test(r.AttractionName ?? ''));
const match = buildMatcher(temples);

const stat = { matched: 0, byAddr: 0, byName: 0, intro: 0, introSkipHistory: 0, open: 0, site: 0, siteKept: 0 };
const rejects = new Map();
const changes = [];
const seen = new Set();

for (const r of cand) {
  const m = match(r);
  if (!m) continue;
  if (seen.has(m.temple.id)) continue; // 同一間廟只採第一筆（地址優先於廟名）
  seen.add(m.temple.id);
  stat.matched++;
  stat[m.how === '地址' ? 'byAddr' : 'byName']++;
  const t = m.temple;
  const diff = [];

  // intro：有 history 就不寫（那 22 間是逐間查證的敘述句，品質高於觀光文案）
  const verdict = acceptIntro(r.Description);
  if (!verdict.ok) {
    rejects.set(verdict.why, (rejects.get(verdict.why) ?? 0) + 1);
  } else if (has(t.history)) {
    stat.introSkipHistory++;
  } else if (t.intro !== verdict.text) {
    diff.push(['intro', verdict.text.slice(0, 40) + '…']);
    if (WRITE) t.intro = verdict.text;
    stat.intro++;
  }

  // open_time：純事實短句（「每日開放」「08:00-17:00」），不需文風過濾
  const ot = String(r.ServiceTimeInfo ?? '').trim();
  if (ot && t.open_time !== ot) {
    diff.push(['open_time', ot]);
    if (WRITE) t.open_time = ot;
    stat.open++;
  }

  // website：只補空值，既有的一個字都不動
  const url = String(r.WebsiteURL ?? '').trim();
  if (url && /^https?:\/\//.test(url)) {
    if (has(t.website)) stat.siteKept++;
    else {
      diff.push(['website', url]);
      if (WRITE) t.website = url;
      stat.site++;
    }
  }

  // 來源標註（OGDL 1.0 要求標示出處）：只要這間廟採用了任一欄位就補一筆，重跑不重複加
  if (diff.length) {
    changes.push({ id: t.id, name: t.name, how: m.how, diff });
    if (WRITE) {
      t.sources = t.sources ?? [];
      if (!t.sources.some((s) => (s.ref ?? '').includes(TOURISM_SOURCE))) {
        t.sources.push({
          type: 'gov',
          ref: `${TOURISM_SOURCE}（政府資料開放平臺 dataset 7777）`,
          note: `政府資料開放授權條款－第1版；資料更新時間 ${updated || '未提供'}`,
        });
      }
    }
  }
}

// ── 報告 ────────────────────────────────────────────────────────────────────
console.log(`來源：觀光署景點 ${rows.length} 筆（更新 ${updated}）→ 名稱結尾為宮廟字者 ${cand.length} 筆`);
console.log(`對映站上 ${temples.length} 間：命中 ${stat.matched}（地址 ${stat.byAddr}／廟名 ${stat.byName}）`);
console.log(`採用：intro ${stat.intro}　open_time ${stat.open}　website ${stat.site}`);
console.log(`略過：已有 history 故不寫 intro ${stat.introSkipHistory}　已有 website 故保留原值 ${stat.siteKept}`);
console.log(`intro 被規則剔除：${[...rejects].map(([k, v]) => `${k} ${v}`).join('、') || '無'}`);
console.log(`實際異動 ${changes.length} 間`);
for (const c of changes.slice(0, 8)) {
  console.log(`  ${c.id}（${c.how}）：${c.diff.map(([k, v]) => `${k}=${v}`).join('　')}`);
}
if (changes.length > 8) console.log(`  …其餘 ${changes.length - 8} 間略`);

if (WRITE) {
  writeFileSync(TEMPLES, `${JSON.stringify(temples, null, 2)}\n`);
  console.log(`\n✓ 已寫回 ${TEMPLES}`);
} else {
  console.log('\n（乾跑，未寫檔。加 --write 才實際寫入）');
}
