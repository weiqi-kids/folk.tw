// IndexNow 提交（Bing / Yandex / Seznam / Naver 共用即時收錄協定）。
// ⚠ Google 不吃 IndexNow——Google 靠 robots.txt 的 Sitemap 行 + GSC 提交自行爬。
// 預設：抓 $SITE_URL 的 sitemap，把全部 URL 批次 POST 給 api.indexnow.org（新站/小站適用）。
//   高頻內容站請改為只送當次「變動」URL（把變動網址當參數傳入；範式見 dreamer868 的 CI diff 做法）。
// 用法：
//   node scripts/indexnow-submit.mjs                 # 送 sitemap 全部 URL
//   node scripts/indexnow-submit.mjs <url|/path>...  # 只送指定 URL（相對路徑補成正式網址）
//   加 --dry 只印不送。
// 環境變數：SITE_URL（含 https://）、INDEXNOW_KEY（32 hex，對應 public/<key>.txt）。
// 任何失敗都 exit 0，不擋部署。

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const urlArgs = args.filter((a) => a !== "--dry");

const SITE_URL = process.env.SITE_URL;
const KEY = process.env.INDEXNOW_KEY;
if (!SITE_URL || !KEY) {
  console.error("缺 SITE_URL 或 INDEXNOW_KEY，略過 IndexNow。");
  process.exit(0);
}
const site = new URL(SITE_URL);
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

/**
 * 全站頁面清單（build 產出，見 scripts/gen-indexnow-urls.mjs）。
 * 優先用它而非 sitemap：sitemap 少了刻意排除的 2,122 頁（土地公廟／未來農民曆），
 * 那些頁照樣公開可爬卻從未經 IndexNow 提交，Bing Webmaster 因此報「重要頁未提交」。
 * 讀不到就退回 sitemap（部署順序或舊版本仍可運作，不會整個掛掉）。
 */
async function allPageUrls() {
  try {
    const r = await fetch(new URL("indexnow-urls.txt", site).href);
    if (!r.ok) return null;
    const list = (await r.text()).split("\n").map((x) => x.trim()).filter(Boolean);
    return list.length ? list : null;
  } catch { return null; }
}

async function sitemapUrls() {
  let maps = [];
  try {
    const r = await fetch(new URL("sitemap-index.xml", site).href);
    if (r.ok) maps = locs(await r.text());
  } catch {}
  if (!maps.length) maps = [new URL("sitemap-0.xml", site).href];
  const urls = [];
  for (const m of maps) {
    try {
      const r = await fetch(m);
      if (r.ok) urls.push(...locs(await r.text()));
    } catch {}
  }
  return [...new Set(urls)];
}

const toUrl = (a) => (/^https?:\/\//.test(a) ? a : new URL(a.replace(/^\.?\//, ""), site).href);

const urlList = urlArgs.length ? urlArgs.map(toUrl) : ((await allPageUrls()) ?? (await sitemapUrls()));
if (!urlList.length) {
  console.log("無 URL 可送。");
  process.exit(0);
}

const payload = {
  host: site.host,
  key: KEY,
  keyLocation: new URL(`/${KEY}.txt`, site).href,
  urlList,
};
console.log(`IndexNow：${urlList.length} 個 URL → ${payload.keyLocation}`);
if (dry) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

try {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  console.log(`IndexNow 回應：${res.status}（200/202 為受理）`);
} catch (e) {
  console.error(`IndexNow 送出失敗（不擋部署）：${e.message}`);
}
process.exit(0);
