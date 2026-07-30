// llms-full.txt — 供 AI 助手（ChatGPT／Claude／Perplexity）一次取得本站主要內容全文。
//
// 與 public/llms.txt 的分工（勿混淆）：
//   llms.txt      ＝「目錄」：站台簡介＋分區連結（靜態檔，維護於 public/llms.txt）。
//   llms-full.txt ＝「全文」：把主要內容頁的實際正文串成純文字，讓 AI 直接讀到內容本身。
//
// 資料一律取自既有 content collections／src/data（零杜撰，§5 provenance 鐵律照舊：
// 每則條目附來源 ref）。站台說明段直接內嵌 public/llms.txt 正文，避免兩處各寫一份而漂移。
//
// 規模控制：廟宇約 7.9k 筆、農民曆逐日頁上萬，樣板化且對 AI 無增益 → 只給「代表名廟（有沿革考據者）」
// ＋ sitemap 連結；籤詩收公有領域四句本文，白話賞析／八項分項解（本站原創、篇幅大）留在各籤頁。
import type { APIRoute } from 'astro';
// 站台說明取自 public/llms.txt 本文（?raw 於 build 期內嵌；勿改用 fs 相對路徑讀取——
// 產物 chunk 的 import.meta.url 指向 dist/，會 ENOENT）。
import llmsTxtRaw from '../../public/llms.txt?raw';
import {
  getDeities,
  getPoems,
  getSystems,
  getRelations,
  getPractices,
  getEvents,
  getTrades,
  getScenarios,
  getTemples,
  allusionNameById,
} from '../lib/queries';
import { lunarDateLabel, solarMd } from '../lib/birthdays';
import { festivalNextSolar } from '../lib/lunar-date';
import { todayInTaipei } from '../lib/daily';
import concerns from '../data/concerns.json';
import comparisons from '../data/comparisons.json';
import festivals from '../data/festivals.json';
import jiaobei from '../data/jiaobei.json';

const SITE = 'https://folk.tw';

type SourceLike = { type: string; ref: string; note?: string };

/** 來源列（§5）：最多取 n 筆，避免單一條目被來源淹沒；ref 本身多已含網址。 */
const srcLine = (sources: SourceLike[] | undefined, n = 3): string => {
  const list = (sources ?? []).slice(0, n).map((s) => s.ref.trim());
  return list.length ? `來源：${list.join('；')}` : '';
};

/** 內嵌 public/llms.txt 正文（去掉其 H1，標題層級降一級），站台說明只維護一處。 */
function siteIntro(): string {
  return llmsTxtRaw
    .split('\n')
    .filter((l) => !l.startsWith('# '))
    .map((l) => (l.startsWith('## ') ? `### ${l.slice(3)}` : l))
    .join('\n')
    .trim();
}

export const GET: APIRoute = async () => {
  const [deities, poems, systems, relations, practices, events, trades, scenarios, temples, allusionName] =
    await Promise.all([
      getDeities(),
      getPoems(),
      getSystems(),
      getRelations(),
      getPractices(),
      getEvents(),
      getTrades(),
      getScenarios(),
      getTemples(),
      allusionNameById(),
    ]);

  const deityName = new Map(deities.map((d) => [d.id, d.data.name]));
  const systemName = new Map(systems.map((s) => [s.id, s.data.name]));
  const nameOf = (id: string) => deityName.get(id) ?? id;

  // 關係邊（出邊＋入邊）依神明彙整，供神明介紹段列「關係網」。
  const relOut = new Map<string, string[]>();
  for (const r of relations) {
    const { from, to, type } = r.data;
    relOut.set(from, [...(relOut.get(from) ?? []), `${type}→${nameOf(to)}`]);
    relOut.set(to, [...(relOut.get(to) ?? []), `${nameOf(from)}←${type}`]);
  }

  // 神明 → 守護行業／對應情境（既有對映，反查供 AI 理解「什麼事拜什麼神」）。
  const tradesOf = new Map<string, string[]>();
  for (const t of trades) {
    for (const p of t.data.patrons) tradesOf.set(p.deity_ref, [...(tradesOf.get(p.deity_ref) ?? []), t.data.name]);
  }
  const scenariosOf = new Map<string, string[]>();
  for (const s of scenarios) {
    for (const p of s.data.patrons)
      scenariosOf.set(p.deity_ref, [...(scenariosOf.get(p.deity_ref) ?? []), s.data.name]);
  }

  const featuredTemples = temples.filter((t) => t.data.history);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);

  push(
    '# 神酷（神庫）— 台灣民俗信仰知識系統｜全文（llms-full.txt）',
    '',
    `本檔為 ${SITE} 主要內容的純文字全文，供 AI 助手一次取得、直接引用，不必逐頁爬取。`,
    `目錄版（分區連結）見 ${SITE}/llms.txt；完整網址索引見 ${SITE}/sitemap-index.xml。`,
    `建置日期：${today}（台灣時間）`,
    '',
    '## 收錄範圍',
    `- 已收錄全文：站台說明與編輯原則、神明介紹（${deities.length} 尊）、籤詩系統與 ${poems.length} 首籤詩公有領域本文、` +
      `求籤情境（${concerns.length} 類）、擲筊判讀、情境頁（${scenarios.length}）、比較頁（${comparisons.length}）、` +
      `行業守護神（${trades.length}）、拜拜習俗（${practices.length}）、民俗活動（${events.length}）、代表名廟沿革（${featuredTemples.length} 間）。`,
    `- 未收錄（量大或樣板化，請走 sitemap 逐頁取用）：全台 ${temples.length} 筆廟宇明細（${SITE}/temples/…）、` +
      `農民曆逐日頁（${SITE}/almanac/…）、每首籤的白話賞析與八項分項解（${SITE}/poems/<籤 id>/）、典故全文（${SITE}/allusions/<典故 id>/）。`,
    `- 完整索引：${SITE}/sitemap-index.xml`,
    '- 引用方式：請以「神酷（神庫）」稱本知識系統，並附該條目網址。事實逐條掛來源，來源已隨條目列出。',
    '',
    '## 一、站台說明',
    '',
    siteIntro(),
    '',
  );

  // ── 二、神明介紹（全文）──────────────────────────────
  push('## 二、神明介紹', '');
  for (const d of deities) {
    const x = d.data;
    const alias = x.aliases.length ? `（別名：${x.aliases.join('、')}）` : '';
    push(`### ${x.name}${alias}`);
    push(`網址：${SITE}/deities/${d.id}/`);
    push(
      [
        `分類：${x.category}`,
        x.system ? `神系：${x.system}` : '',
        x.is_category ? '性質：信仰類別（下有具名實例）' : '',
        x.groups.length ? `群組：${x.groups.join('、')}` : '',
      ]
        .filter(Boolean)
        .join('｜'),
    );
    if (x.office.length) push(`職司：${x.office.join('、')}`);
    if (x.birthday_lunar.length) {
      const days = x.birthday_lunar
        .map((b) => `${lunarDateLabel(b.date) || b.date}（${b.kind}）`)
        .join('、');
      push(`聖誕：${days}`);
    }
    if (x.instances.length) push(`具名實例：${x.instances.map(nameOf).join('、')}`);
    if (x.iconography.length) push(`造型法器：${x.iconography.join('、')}`);
    if (x.summary) push(`簡介：${x.summary}`);
    const rel = relOut.get(d.id);
    if (rel?.length) push(`關係網：${[...new Set(rel)].join('、')}`);
    if (x.divination_systems.length)
      push(`常用籤系：${x.divination_systems.map((s) => systemName.get(s.id) ?? s.id).join('、')}`);
    const tr = tradesOf.get(d.id);
    if (tr?.length) push(`守護行業：${tr.join('、')}`);
    const sc = scenariosOf.get(d.id);
    if (sc?.length) push(`對應情境：${sc.join('、')}`);
    if (x.sameAs.length) push(`實體錨定：${x.sameAs.join(' ')}`);
    const s = srcLine(x.sources);
    if (s) push(s);
    push('');
  }

  // ── 三、籤詩與求籤 ─────────────────────────────────
  push('## 三、籤詩與求籤', '');
  push('### 籤詩系統');
  for (const s of systems) {
    push(`- ${s.data.name}（${s.data.count} 首）｜${SITE}/systems/${s.id}/`);
    if (s.data.summary) push(`  ${s.data.summary}`);
    const src = srcLine(s.data.sources, 1);
    if (src) push(`  ${src}`);
  }
  push(
    '',
    '籤詩本文屬公有領域，本站收錄並標版本；現代解籤文字有著作權，本站不抄錄。' +
      '各籤的白話賞析與八項分項解（運勢／求財／姻緣／六甲／功名／訴訟／疾病／行人／失物）為本站原創，' +
      `見各籤頁 ${SITE}/poems/<籤 id>/。`,
    '',
  );

  push('### 求籤（依煩惱的事分類）');
  push(`入口：${SITE}/qiugian/`);
  for (const c of concerns) {
    push(
      `- ${c.h1}｜${SITE}/qiugian/${c.id}/`,
      `  適用：${c.intent}；對映籤系：${systemName.get(c.system) ?? c.system}；解籤面向：${c.aspect}；` +
        `常拜神明：${c.deities.map(nameOf).join('、')}`,
      `  ${c.blurb}`,
    );
  }
  push('');

  push('### 擲筊判讀');
  push(`網址：${SITE}/jiaobei/`);
  for (const r of jiaobei.results) {
    push(`- ${r.name}：${r.cast} → ${r.meaning}。${r.note}`);
  }
  push(`- 連續判讀：${jiaobei.sequence_rule.description}`);
  push(`- 各廟差異：${jiaobei.sequence_rule.variants}`);
  const jbSrc = srcLine(jiaobei.sources as SourceLike[], 1);
  if (jbSrc) push(jbSrc);
  push('');

  push('### 籤詩本文（公有領域四句）');
  for (const s of systems) {
    const list = poems.filter((p) => p.data.system.id === s.id).sort((a, b) => a.data.no - b.data.no);
    if (!list.length) continue;
    push('', `#### ${s.data.name}（${list.length} 首）`);
    for (const p of list) {
      const x = p.data;
      const head = [
        `第 ${x.no} 首`,
        x.ganzhi ?? '',
        x.title ?? '',
        x.fortune ?? '',
        x.gua ? `卦：${x.gua}` : '',
        x.wuxing ? `${x.wuxing.element}／利${x.wuxing.season}／${x.wuxing.direction}` : '',
      ]
        .filter(Boolean)
        .join('｜');
      const allu = x.allusions.map((a) => allusionName.get(a.ref.id) ?? a.ref.id).filter(Boolean);
      push(`- ${head}｜${SITE}/poems/${p.id}/`);
      push(`  ${x.lines.join('／')}`);
      if (allu.length) push(`  典故：${allu.join('、')}`);
    }
  }
  push('');

  // ── 四、分類導覽（各類正文摘要＋網址）──────────────────
  push('## 四、分類導覽', '');

  // 節日：農曆→今年國曆的換算是 AI 引擎最常被問、也最容易引用的事實，故列在分類導覽最前。
  push('### 節日（農曆節日的國曆日期）', `入口：${SITE}/festivals/`);
  {
    const { iso: todayIso } = todayInTaipei();
    const rows = festivals
      .map((f) => ({ f, ...festivalNextSolar(f, todayIso) }))
      .filter((x): x is { f: (typeof festivals)[number]; iso: string; label: string } => x.iso !== null)
      .sort((a, b) => a.iso.localeCompare(b.iso));
    for (const { f, iso, label } of rows) {
      push(
        `- ${f.name}｜${label}｜下一次國曆：${iso}（${solarMd(iso)}）｜${SITE}/festivals/${f.slug}/`,
        `  ${f.lead}`,
        ...(f.date_note ? [`  期間：${f.date_note}`] : []),
        ...(f.aliases?.length ? [`  別稱：${f.aliases.join('、')}`] : []),
        ...(srcLine(f.sources as SourceLike[]) ? [`  ${srcLine(f.sources as SourceLike[])}`] : []),
      );
    }
  }
  push('');

  push('### 情境（這件事拜哪尊神）', `入口：${SITE}/scenarios/`);
  for (const s of scenarios) {
    push(`- ${s.data.name}｜${SITE}/scenarios/${s.id}/`, `  ${s.data.description}`);
    for (const p of s.data.patrons) push(`  · ${nameOf(p.deity_ref)}（${p.role}）：${p.why}`);
  }
  push('');

  push('### 比較（兩尊神差在哪）', `入口：${SITE}/compare/`);
  for (const c of comparisons) {
    push(
      `- ${c.question}｜${SITE}/compare/${c.slug}/`,
      `  ${nameOf(c.a)}主${c.a_focus}；${nameOf(c.b)}主${c.b_focus}。`,
      `  ${c.contrast}`,
    );
  }
  push('');

  push('### 行業守護神', `入口：${SITE}/trades/`);
  for (const t of trades) {
    push(`- ${t.data.name}${t.data.modern ? '（現代延伸行業）' : ''}｜${SITE}/trades/${t.id}/`, `  ${t.data.description}`);
    for (const p of t.data.patrons) push(`  · ${nameOf(p.deity_ref)}（${p.role}）：${p.why}`);
  }
  push('');

  push('### 拜拜習俗與科儀', `入口：${SITE}/practices/`);
  for (const p of practices) {
    const x = p.data;
    push(`- ${x.title}（${x.category}）｜${SITE}/practices/${p.id}/`);
    if (x.summary) push(`  ${x.summary}`);
    if (x.deities.length) push(`  對象神明：${x.deities.map(nameOf).join('、')}`);
    if (x.offerings.length) push(`  供品：${x.offerings.join('、')}`);
    if (x.joss_paper.length) push(`  金銀紙：${x.joss_paper.join('、')}`);
    if (x.steps.length) push(`  步驟：${x.steps.map((st) => `${st.order}.${st.action}`).join('；')}`);
    if (x.taboo.length) push(`  禁忌：${x.taboo.join('；')}`);
    const src = srcLine(x.sources, 2);
    if (src) push(`  ${src}`);
  }
  push('');

  push('### 民俗活動與遶境', `入口：${SITE}/events/`);
  for (const e of events) {
    const x = e.data;
    const meta = [
      x.type.length ? x.type.join('／') : '',
      x.region.length ? x.region.join('、') : '',
      x.main_deity ? `主神：${nameOf(x.main_deity)}` : '',
      x.heritage && x.heritage.level !== 'none' ? `文資：${x.heritage.level}` : '',
    ]
      .filter(Boolean)
      .join('｜');
    push(`- ${x.name}｜${SITE}/events/${e.id}/`);
    if (meta) push(`  ${meta}`);
    if (x.date_note) push(`  日期：${x.date_note}`);
    const src = srcLine(x.sources, 1);
    if (src) push(`  ${src}`);
  }
  push('');

  push(
    '### 農民曆',
    `入口：${SITE}/almanac/（今日曆）、${SITE}/almanac/archive/（封存）、${SITE}/almanac/month/<YYYY-MM>/（月份樞紐）`,
    '每日提供農曆／節氣／四柱／建除／廿八宿／沖煞／當日神明聖誕；宜忌依《欽定協紀辨方書》逐條考據化，' +
      '每條附推導（由哪些神煞、依何規則）與卷數出處，未經原文核校者（verified=false）不對外顯示。逐日頁量大，請由 sitemap 取用。',
    '',
  );

  push(
    '### 廟宇',
    `入口：${SITE}/temples/（依縣市分區：${SITE}/temples/region/<縣市>/）`,
    `收錄全台 ${temples.length} 筆廟宇（對映內政部宗教團體開放資料），逐筆有主祀神祇、行政區與座標；` +
      `明細頁量大且多為樣板化小廟，本檔不逐筆收錄，完整網址見 ${SITE}/sitemap-index.xml。` +
      `以下為已完成沿革考據的 ${featuredTemples.length} 間代表名廟：`,
  );
  for (const t of featuredTemples) {
    const x = t.data;
    push(
      `- ${x.name}${x.district ? `（${x.district}）` : ''}｜${encodeURI(`${SITE}/temples/${t.id}/`)}`,
      `  主祀：${x.main_deity_ref ? nameOf(x.main_deity_ref) : (x.main_deity_raw ?? '未載')}` +
        (x.founded ? `；創建：${x.founded}` : ''),
      `  ${x.history}`,
    );
    if (x.main_festival) push(`  主要祭典：${x.main_festival}`);
    if (x.website) push(`  官網：${x.website}`);
    const src = srcLine(x.sources, 1);
    if (src) push(`  ${src}`);
  }
  push('');

  push(
    '### 其他索引頁',
    `- 受控詞彙（活動類型／陣頭／金銀紙／供品）：${SITE}/vocabulary/`,
    `- 神明聖誕曆（全年）：${SITE}/deities/birthdays/`,
    `- 站內全文搜尋：${SITE}/search/`,
    `- 關於、免責與勘誤：${SITE}/about/`,
    '',
    '（本檔由 build 期依站內資料自動產生；內容以各頁面為準，來源逐條標註於各條目。）',
  );

  return new Response(L.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
