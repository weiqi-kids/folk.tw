#!/usr/bin/env node
// §9.6 內政部寺廟開放資料 → 廟宇實體 的可重複執行轉換流程，並輸出主祀神祇對映率報表。
//
// 來源：政府資料開放平臺 data.gov.tw/dataset/8203；XML 端點
//   https://religion.moi.gov.tw/Report/temple.xml
// 依「政府資料開放授權條款」使用、標示來源。
//
// 用法：
//   node --experimental-strip-types scripts/import-temples.ts [來源URL或本地xml路徑] [--write]
//   預設來源為上述 MOI 端點；--write 會輸出 src/data/temples.import.json（供人工審後併入）。
//
// 設計：欄位名稱以多重候選比對（MOI 欄位偶有調整），主祀神祇以 deities.json 的
// name+aliases 建白名單對映（R5）；未匹配者留 main_deity_ref 空並列入報表。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOI_URL = 'https://religion.moi.gov.tw/Report/temple.xml';

// ── 主祀神祇 → deity.id 對映白名單（由 deities.json 的 name+aliases 構建）──
function buildDeityIndex(): Map<string, string> {
  const deities = JSON.parse(readFileSync(join(root, 'src/data/deities.json'), 'utf8'));
  const idx = new Map<string, string>();
  for (const d of deities) {
    idx.set(d.name, d.id);
    for (const a of d.aliases ?? []) idx.set(a, d.id);
  }
  return idx;
}

/** 主祀神祇原始自由文字 → deity.id（R5 對映；無把握回 null 進未匹配報表） */
function mapDeity(raw: string, idx: Map<string, string>): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
  if (idx.has(s)) return idx.get(s)!;
  // 去常見尾綴後再試
  const stripped = s.replace(/(尊神|大帝|帝君|聖王|元帥|將軍|夫人|娘娘|尊王|王爺|公|媽|佛祖)$/u, '');
  for (const [k, v] of idx) {
    if (s.includes(k) || (stripped && k.includes(stripped) && stripped.length >= 2)) return v;
  }
  return null;
}

// ── 簡易 XML 記錄解析（扁平記錄集；欄位多候選名）──
function pick(record: string, names: string[]): string | undefined {
  for (const n of names) {
    const m = record.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, 'i'));
    if (m) return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  }
  return undefined;
}

function parseRecords(xml: string): Record<string, string>[] {
  // 取最內層重複節點作為一筆（MOI 現行為 <OpenData_3>；舊版/他集為 <Info>/<Row>/<temple> 等）
  const tag = (xml.match(/<(OpenData_3|Info|Row|temple|Temple|Item)\b/i) ?? [])[1] ?? 'Info';
  const blocks = [...xml.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'))].map((m) => m[0]);
  return blocks.map((b) => ({
    name: pick(b, ['name', '寺廟名稱', '團體名稱', 'temple_name']) ?? '',
    deity: pick(b, ['主祀神祇', 'god', 'main_god', '主神']) ?? '',
    // 地址較行政區精細（含區里），優先取地址；行政區為備援。
    district: pick(b, ['地址', 'address', '行政區', 'area', 'district']) ?? '',
    // MOI 現行座標欄為 WGS84X(經度)／WGS84Y(緯度)；保留舊候選名。
    lng: pick(b, ['WGS84X', '經度', 'lng', 'lon', 'longitude', 'wgs84_lng']) ?? '',
    lat: pick(b, ['WGS84Y', '緯度', 'lat', 'latitude', 'wgs84_lat']) ?? '',
    uid: pick(b, ['統一編號', 'uid', 'id']) ?? '',
  }));
}

function slug(name: string, i: number): string {
  return `moi_${i}_${name.replace(/[^一-龥A-Za-z0-9]/g, '').slice(0, 8) || 'temple'}`;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const srcArg = args.find((a) => !a.startsWith('--'));
  const src = srcArg ?? MOI_URL;

  let xml: string;
  if (src.startsWith('http')) {
    console.log(`抓取 MOI 開放資料：${src}`);
    const res = await fetch(src);
    if (!res.ok) throw new Error(`抓取失敗 HTTP ${res.status}`);
    xml = await res.text();
  } else {
    xml = readFileSync(resolve(src), 'utf8');
  }

  const idx = buildDeityIndex();
  const records = parseRecords(xml);
  const temples = records.map((r, i) => {
    const ref = mapDeity(r.deity, idx);
    const lng = parseFloat(r.lng);
    const lat = parseFloat(r.lat);
    return {
      id: slug(r.name, i),
      name: r.name,
      main_deity_raw: r.deity || undefined,
      main_deity_ref: ref ?? undefined,
      district: r.district || undefined,
      ...(Number.isFinite(lng) && lng !== 0 ? { lng } : {}),
      ...(Number.isFinite(lat) && lat !== 0 ? { lat } : {}),
      sources: [
        { type: 'gov', ref: '內政部全國宗教資訊網（data.gov.tw/dataset/8203）', note: '政府資料開放授權條款' },
      ],
    };
  });

  // ── 主祀神祇對映率報表（§9.6 / R5）──
  const withRaw = temples.filter((t) => t.main_deity_raw);
  const matched = temples.filter((t) => t.main_deity_ref).length;
  const unmatched = [...new Set(withRaw.filter((t) => !t.main_deity_ref).map((t) => t.main_deity_raw))];
  console.log('\n=== 主祀神祇對映率報表（R5 / §9.6）===');
  console.log(`  廟宇總數：${temples.length}`);
  console.log(`  有主祀神祇欄：${withRaw.length}`);
  console.log(`  對映到 deity 節點：${matched}（${withRaw.length ? ((matched / withRaw.length) * 100).toFixed(1) : '—'}%）`);
  console.log(`  未匹配主祀（前 30 種）：${unmatched.slice(0, 30).join('、') || '無'}`);
  if (unmatched.length > 30) console.log(`  …另 ${unmatched.length - 30} 種未匹配`);

  if (write) {
    const out = join(root, 'src/data/temples.import.json');
    writeFileSync(out, JSON.stringify(temples, null, 2) + '\n');
    console.log(`\n✓ 已輸出 ${out}（${temples.length} 筆；供人工審核後併入 temples.json）`);
  } else {
    console.log('\n（未加 --write，僅輸出報表；加 --write 產出 temples.import.json）');
  }
}

main().catch((e) => {
  console.error('匯入失敗：', e.message);
  process.exit(1);
});
