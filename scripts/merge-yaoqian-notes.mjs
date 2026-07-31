#!/usr/bin/env node
// 合併 11 個 agent 產出的醫師四段 → src/data/yaoqian-notes.json
//
// 用法：node scripts/merge-yaoqian-notes.mjs <batches 目錄>
//
// ⚠️ 這支刻意做「硬驗證」而非盡力而為：
//   - id 必須存在於 yaoqian.import.json（防 agent 自己編 id）
//   - 四段皆不得為空（缺一段就整筆不收，寧可該首不顯示醫師解說，也不要半套）
//   - 不得重複 id
//   - 缺漏會逐筆列出，退出碼非 0——不讓「330 首只併進 200 首」這種事默默過去
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('用法：node scripts/merge-yaoqian-notes.mjs <batches 目錄>'); process.exit(2); }

const slips = JSON.parse(readFileSync('src/data/yaoqian.import.json', 'utf8'));
const validIds = new Set(slips.map((s) => s.id));
const FIELDS = ['specialty', 'safety_flags', 'why_not_self_medicate', 'modern_care_pathway', 'physician_note'];

const out = new Map();
const problems = [];
for (const f of readdirSync(dir).filter((f) => /^out-\d+\.json$/.test(f)).sort()) {
  let arr;
  try { arr = JSON.parse(readFileSync(join(dir, f), 'utf8')); }
  catch (e) { problems.push(`${f}：JSON 解析失敗 ${e.message}`); continue; }
  if (!Array.isArray(arr)) { problems.push(`${f}：不是陣列`); continue; }
  for (const n of arr) {
    if (!validIds.has(n.id)) { problems.push(`${f}：id 不存在於資料集 → ${n.id}`); continue; }
    if (out.has(n.id)) { problems.push(`${f}：id 重複 → ${n.id}`); continue; }
    const empty = FIELDS.filter((k) => !n[k] || !String(n[k]).trim());
    if (empty.length) { problems.push(`${f}：${n.id} 缺欄位 ${empty.join(',')}`); continue; }
    out.set(n.id, Object.fromEntries([['id', n.id], ...FIELDS.map((k) => [k, String(n[k]).trim()])]));
  }
}

const merged = slips.map((s) => out.get(s.id)).filter(Boolean);
writeFileSync('src/data/yaoqian-notes.json', JSON.stringify(merged, null, 1) + '\n');

const missing = slips.filter((s) => !out.has(s.id));
console.log(`合併 ${merged.length} / ${slips.length} 首`);
if (problems.length) { console.log(`\n問題 ${problems.length} 筆：`); for (const p of problems.slice(0, 30)) console.log('  ✗', p); }
if (missing.length) {
  console.log(`\n缺 ${missing.length} 首：`);
  const byCat = {};
  for (const m of missing) (byCat[m.category] ??= []).push(m.no);
  for (const [k, v] of Object.entries(byCat)) console.log(`  ${k}: ${v.join(',')}`);
}
process.exit(missing.length || problems.length ? 1 : 0);
