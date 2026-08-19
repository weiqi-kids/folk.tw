#!/usr/bin/env node
// 時事祈福後續發展的 render gate。
//
// topical-followup.mjs 會在事件仍為 active 時直接寫入 updates 並發 Slack；
// 因此不能只驗 memorial 頁。這裡對全部未併頁條目進行資料↔HTML
// 雙向比對，防止「通知已發，頁面卻看不到」再發生。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escText } from './lib/astro-escape.mjs';

const DIST = 'dist';
const topical = JSON.parse(readFileSync('src/data/topical.json', 'utf8'));
const violations = [];
// 🔴 跳脫規則不在本檔重寫：這裡原本有一份逐字副本，而 check-rendered.mjs 那 10 行
//    「逐字元補是錯的做法」的紅字警語根本沒涵蓋到它（2026-08-08 兩次假紅燈的教訓）。
//    現在兩支 gate 共用同一支，且那一支直接用 Astro 自己的 escapeHTML。見該檔檔頭。
const esc = escText;

let checked = 0;
let withTimeline = 0;
let activeWithUpdates = 0;

for (const item of topical) {
  if (item.mergedInto) continue;
  checked += 1;
  const file = join(DIST, 'qiugian', 'blessing', item.id, 'index.html');
  if (!existsSync(file)) {
    violations.push(`${item.id}：頁面未建置`);
    continue;
  }

  const html = readFileSync(file, 'utf8');
  const updates = (Array.isArray(item.updates) ? item.updates : [])
    .filter((update) => String(update?.text ?? '').trim());
  const timelineCount = (html.match(/aria-label="後續發展"/g) ?? []).length;
  const status = item.status ?? 'active';
  const shouldRenderTimeline = updates.length > 0 && status !== 'archived';

  if (!shouldRenderTimeline) {
    if (timelineCount !== 0) violations.push(`${item.id}：${status} 態不該渲染後續發展時間軸`);
    continue;
  }

  withTimeline += 1;
  if (status === 'active') activeWithUpdates += 1;
  if (timelineCount !== 1) {
    violations.push(`${item.id}：有 ${updates.length} 筆 updates，但後續發展時間軸數量為 ${timelineCount}`);
  }
  if (!/<h2[^>]*>\s*後續發展\s*<\/h2>/.test(html)) violations.push(`${item.id}：時間軸缺「後續發展」標題`);

  for (const [index, update] of updates.entries()) {
    if (!html.includes(esc(update.text))) violations.push(`${item.id}：未渲染 updates[${index}].text`);
    for (const source of (Array.isArray(update.sources) ? update.sources : [])) {
      if (source?.url && !html.includes(`href="${esc(source.url)}"`)) {
        violations.push(`${item.id}：updates[${index}] 未渲染來源 ${source.url}`);
      }
    }
  }

  if (status === 'active' && !html.includes('id="qifuBtn"')) {
    violations.push(`${item.id}：active 頁顯示後續時遺失集氣入口`);
  }
}

if (violations.length > 0) {
  console.error(`✗ 時事祈福後續發展 render 檢查失敗：${violations.length} 處`);
  for (const violation of violations.slice(0, 40)) console.error(`  ✗ ${violation}`);
  if (violations.length > 40) console.error(`  …另有 ${violations.length - 40} 處`);
  process.exit(1);
}

console.log(`✓ 時事祈福後續發展已雙向驗證：${checked} 頁，${withTimeline} 頁應有時間軸（含 ${activeWithUpdates} 頁 active）`);
