#!/usr/bin/env node
// 籤詩「不同處境怎麼看」九個情境欄位的文字守門。
//
// 🔴 為什麼需要這支：這批內容是一段一段寫出來的（215 首 × 9 情境），
//    人工逐條看不現實。2026-08-21 首批就混進兩處外文——一處俄文（негативной）、
//    一處英文（可望轉good）——而且第一版字元檢查因為**允許 A-Za-z**（想留給專有名詞）
//    而漏掉後者。教訓：允許清單開太寬，等於沒檢查。
//
// 驗三件事：① 不得出現連續外文字母 ② 不得為空字串 ③ 長度合理（10~120 字）。
import { readFileSync, readdirSync } from 'node:fs';

const KEYS = ['換工作', '求職面試', '創業開店', '投資理財', '考試升學', '告白追求', '復合挽回', '分手離婚', '買房搬家'];
const dir = 'src/content/interpretations';
// 這個 collection 既有的其他欄位（不是情境，但合法）。
const KNOWN_OTHER = ['運勢', '求財', '姻緣', '六甲', '功名', '訴訟', '疾病', '行人', '失物', 'draft'];
const violations = [];
let checked = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
  const fm = (readFileSync(`${dir}/${f}`, 'utf8').split('---')[1] ?? '');
  // 🔴 欄位**名稱**也要驗：2026-08-21 實際踩到——guandi_lingqian-31 的 key 被打成
  //    「換жи作」（俄文字母混進 key），而第一版只比對已知 key 的**值**，
  //    於是那一整段靜默消失、總數少一段也沒人發現。
  //    這裡先抓「長得像情境 key 但不在清單裡」的行，再驗值。
  for (const line of fm.split('\n')) {
    const looksLikeKey = line.match(/^([^\s:"]{2,6}):\s*"/);
    if (looksLikeKey) {
      const k = looksLikeKey[1];
      if (!KEYS.includes(k) && !KNOWN_OTHER.includes(k)) {
        violations.push(`${f}：未知欄位名「${k}」——是不是打錯字？`);
      }
    }
  }
  for (const line of fm.split('\n')) {
    const m = line.match(new RegExp(`^(${KEYS.join('|')}):\\s*"(.*)"\\s*$`));
    if (!m) continue;
    checked += 1;
    const [, key, text] = m;
    const foreign = text.match(/[A-Za-zА-Яа-яЁё]{2,}/g);
    if (foreign) violations.push(`${f} ${key}：混入外文 ${JSON.stringify(foreign)}`);
    if (!text.trim()) violations.push(`${f} ${key}：空字串`);
    else if ([...text].length < 10 || [...text].length > 120) {
      violations.push(`${f} ${key}：長度 ${[...text].length} 不在 10~120 之間`);
    }
  }
}

if (violations.length) {
  console.error(`\n✗ 情境文字檢查失敗 ${violations.length} 處：`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`✓ 情境文字檢查通過：掃 ${checked} 段，無外文混入、無空值、長度皆在範圍內`);
