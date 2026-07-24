#!/usr/bin/env node
// 內政部寺廟開放資料（data.gov.tw/dataset/8203、XML 端點 religion.moi.gov.tw/Report/temple.xml）
// → 「只回填目前缺座標（或垃圾座標）的廟」的可重複執行流程。**只碰座標、不動策展欄位。**
//
// ⚠️ MOI 端點擋境外 IP，本 server 與 GitHub Actions runner 皆在境外連不到，
//    故 XML 需台灣端下載後放到本機再指定路徑；不提供自動抓取。
//
// 用法：
//   node --experimental-strip-types scripts/refresh-temple-coords.ts <temple.xml 路徑> [--write]
//   預設乾跑（只報告不寫入）；--write 才回寫 src/data/temples.json 並加來源註記。
//
// 安全閘（與 2026-07-24 首次回填同源，防同名/跨村誤配塞入假座標）：
//   1. 只處理「lat/lng 為空」或「座標落在台灣範圍外（垃圾）」的廟。
//   2. MOI 記錄本身座標須落在台灣範圍內。
//   3. 匹配優先序：①地址完全相符 ②廟名完全相符＋同鄉鎮，且（長獨特名≥5字，或
//      非通用名＋里/村地名佐證）。通用名（全站≥5同名）無地名佐證一律不採。
//   4. 命中座標須落在該廟所屬縣市的經驗 bbox 內（由現有座標推算）。
//   不做子串/模糊比對（實測會把福德廟/保安宮跨村誤配）。無把握＝留空，絕不杜撰。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const xmlPath = args.find((a) => !a.startsWith('--'));
if (!xmlPath) {
  console.error('用法：node --experimental-strip-types scripts/refresh-temple-coords.ts <temple.xml> [--write]');
  process.exit(1);
}

type Temple = { id: string; name: string; district?: string; lat?: number; lng?: number; sources?: any[] };
const TEMPLES = join(root, 'src/data/temples.json');
const arr: Temple[] = JSON.parse(readFileSync(TEMPLES, 'utf8'));
const xml = readFileSync(resolve(xmlPath), 'utf8');

const norm = (s?: string) => (s || '').replace(/臺/g, '台').replace(/\s/g, '');
const cleanName = (s?: string) => norm(s).replace(/[（(【].*?[）)】]/g, '');
const countyOf = (d?: string) => norm(d).match(/^(.+?[縣市])/)?.[1] ?? norm(d);
const townOf = (d?: string) => norm(d).match(/^.+?[縣市](.+?[鄉鎮市區])/)?.[1] ?? '';
const inTaiwan = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= 21.5 && lat <= 26.5 && lng >= 118 && lng <= 122.5;
const locTokens = (addr?: string) => {
  const a = norm(addr); const t = new Set<string>();
  for (const m of a.matchAll(/([一-龥]{1,4}[里村])/g)) t.add(m[1]);
  for (const m of a.matchAll(/([一-龥]{1,5}[路街])/g)) t.add(m[1]);
  return t;
};
const shareLoc = (a?: string, b?: string) => { const A = locTokens(a), B = locTokens(b); for (const x of A) if (B.has(x)) return true; return false; };

// 全站廟名頻率（通用名偵測）
const freq: Record<string, number> = {};
for (const t of arr) { const n = norm(t.name); freq[n] = (freq[n] || 0) + 1; }

// 縣市經驗 bbox（由現有有效座標推算，外擴 0.03 度）
const bbox: Record<string, { a: number; b: number; c: number; d: number }> = {};
for (const t of arr) {
  if (t.lat == null || t.lng == null || !inTaiwan(t.lat, t.lng)) continue;
  const c = countyOf(t.district);
  const x = (bbox[c] ??= { a: 90, b: -90, c: 180, d: -180 });
  x.a = Math.min(x.a, t.lat); x.b = Math.max(x.b, t.lat); x.c = Math.min(x.c, t.lng); x.d = Math.max(x.d, t.lng);
}
for (const c in bbox) { const x = bbox[c]; x.a -= 0.03; x.b += 0.03; x.c -= 0.03; x.d += 0.03; }
const inCounty = (lat: number, lng: number, c: string) => {
  const x = bbox[c]; return x ? lat >= x.a && lat <= x.b && lng >= x.c && lng <= x.d : null;
};

// 解析 MOI（只留有台灣有效座標者）
const field = (blk: string, tag: string) => blk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1].trim() ?? '';
type Moi = { name: string; addr: string; lat: number; lng: number; county: string; town: string };
const moi: Moi[] = [];
for (const m of xml.matchAll(/<OpenData_3>[\s\S]*?<\/OpenData_3>/g)) {
  const b = m[0];
  const lng = parseFloat(field(b, 'WGS84X')), lat = parseFloat(field(b, 'WGS84Y'));
  if (!inTaiwan(lat, lng)) continue;
  const addr = field(b, '地址');
  moi.push({ name: field(b, '寺廟名稱'), addr, lat, lng, county: countyOf(addr || field(b, '行政區')), town: townOf(addr) });
}

// 待處理：缺座標，或現有座標落在台灣外（垃圾）
const targets = arr.filter((t) => t.lat == null || t.lng == null || !inTaiwan(t.lat!, t.lng!));

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const fills: { t: Temple; rec: Moi; how: string }[] = [];
for (const t of targets) {
  const county = countyOf(t.district), town = townOf(t.district), dn = norm(t.district), nn = cleanName(t.name);
  let rec: Moi | null = null, how = '';

  const addrHit = moi.filter((m) => norm(m.addr) === dn && dn.length > 0);
  if (addrHit.length === 1) { rec = addrHit[0]; how = 'addr-exact'; }

  if (!rec) {
    let cands = moi.filter((m) => m.county === county && cleanName(m.name) === nn);
    if (town) cands = cands.filter((m) => m.town === town);
    const uniq: Moi[] = [];
    for (const c of cands) if (!uniq.some((u) => Math.abs(u.lat - c.lat) < 0.0005 && Math.abs(u.lng - c.lng) < 0.0005)) uniq.push(c);
    if (uniq.length === 1 && town) {
      const c = uniq[0];
      const distinctive = nn.length >= 5;
      const nonGeneric = freq[nn] < 5;
      if (distinctive) { rec = c; how = 'name+town-distinct'; }
      else if (nonGeneric && shareLoc(t.district, c.addr)) { rec = c; how = 'name+town+loc'; }
    }
  }

  if (rec && inCounty(rec.lat, rec.lng, county) === true) fills.push({ t, rec, how });
}

console.log(`MOI 有效座標記錄：${moi.length}｜待處理（缺/垃圾座標）：${targets.length}｜可回填：${fills.length}`);
for (const { t, rec, how } of fills) {
  console.log(`  [${how}] ${t.name}｜${t.district} → ${r6(rec.lat)},${r6(rec.lng)}（MOI「${rec.name}」${rec.addr}）`);
}

if (!WRITE) { console.log('\n（乾跑。加 --write 才回寫 temples.json）'); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
for (const { t, rec, how } of fills) {
  // 若原本是垃圾座標，先清掉再填
  t.lat = r6(rec.lat); t.lng = r6(rec.lng);
  (t.sources ??= []).push({
    type: 'gov',
    ref: '內政部全國宗教資訊網（data.gov.tw/dataset/8203）',
    note: `WGS84 座標；MOI 記錄「${rec.name}」${rec.addr}（${how} 校驗），${today}`,
  });
}
writeFileSync(TEMPLES, JSON.stringify(arr, null, 2) + '\n');
console.log(`\n已回寫 ${fills.length} 間至 temples.json。請跑 pnpm check:integrity && pnpm build，再 push＋notify。`);
