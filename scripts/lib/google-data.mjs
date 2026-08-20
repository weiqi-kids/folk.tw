// 服務帳號自簽 JWT → 換存取權杖 → 唯讀拉 GA4（Data API）與 GSC（Search Console API）。
// 零外部依賴：Node 內建 crypto + 全域 fetch。
//
// 憑證（私鑰，務必勿進 repo）讀取優先序：
//   1. 環境變數 GOOGLE_SA_KEY        — 服務帳號 JSON 金鑰之「字串內容」
//   2. 環境變數 GOOGLE_APPLICATION_CREDENTIALS — JSON 金鑰之「檔案路徑」
//   3. /root/.config/folk-tw/gsc-sa.json —— **folk.tw 自己的金鑰，站主指定之後一律用這把**
//      （服務帳號 folk-indexing@folk-tw.iam.gserviceaccount.com，專案 folk-tw，2026-08-20 起）。
//
// 🔴 為什麼換（2026-08-20 事故）：那天把 folk.tw 的 GSC 與 Indexing 切到自己的 GCP 專案，
//    在 GSC 加新服務帳號為擁有者的同時，舊的共用金鑰 ga4-sa 被移出 folk.tw 的使用者名單，
//    **對 GSC 直接變成 403**。當時只改了 seo-ops 的 sites/folk.tw.json，
//    沒想到還有一批工具是走本檔「預設值」拿金鑰的（folk-outreach、growth-48h、
//    search-demand、temple-ctr-cohorts…），它們當天全部靜默壞掉。
//    實測：`ga4-sa.json` 打 sc-domain:folk.tw 得「User does not have sufficient permission」，
//    `gsc-sa.json` 正常回資料。
//
// ✅ 2026-08-20 收尾：站主已把該服務帳號加進 GA4 資源 542419964（檢視者），
//    GSC 與 GA4 兩邊都實測通過，**folk.tw 只剩這一把金鑰**，過渡期的退回機制已移除。
//    舊的共用金鑰 ga4-sa.json 仍留在主機供其他站台使用，folk.tw 不再碰它。
//
// 設定（非機密）讀取優先序：env GA4_PROPERTY_ID / GSC_SITE_URL，
//   否則 scripts/.google-config.json（已 gitignore），GSC 預設 sc-domain:folk.tw。

import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, '..');

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// folk.tw 自己的金鑰（GSC／Indexing／GA4 全部走這一把）。env 一律優先於此。
export const FOLK_KEY = '/root/.config/folk-tw/gsc-sa.json';

export function loadCredentials(keyPath) {
  let raw;
  if (!keyPath && process.env.GOOGLE_SA_KEY) raw = process.env.GOOGLE_SA_KEY;
  else {
    const path = keyPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || FOLK_KEY;
    if (!existsSync(path)) {
      throw new Error(
        `找不到服務帳號金鑰。請設 GOOGLE_SA_KEY 環境變數，或把 JSON 金鑰存到 ${path}（已 gitignore）。`,
      );
    }
    raw = readFileSync(path, 'utf8');
  }
  const key = JSON.parse(raw);
  if (!key.client_email || !key.private_key) throw new Error('金鑰缺 client_email / private_key。');
  return key;
}

export function loadConfig() {
  let cfg = {};
  const path = join(scriptsDir, '.google-config.json');
  if (existsSync(path)) cfg = JSON.parse(readFileSync(path, 'utf8'));
  const ga4PropertyId = process.env.GA4_PROPERTY_ID || cfg.ga4PropertyId || '';
  const gscSiteUrl = process.env.GSC_SITE_URL || cfg.gscSiteUrl || 'sc-domain:folk.tw';
  return { ga4PropertyId, gscSiteUrl };
}

/** 服務帳號 JWT-bearer 流程 → 取存取權杖 */
export async function getAccessToken(scopes, keyPath) {
  const { client_email, private_key } = loadCredentials(keyPath);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: client_email,
      scope: Array.isArray(scopes) ? scopes.join(' ') : scopes,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = b64url(signer.sign(private_key));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`取權杖失敗：${data.error} ${data.error_description || ''}`);
  return data.access_token;
}

/** GA4 Data API runReport（唯讀） */
export async function ga4RunReport(propertyId, body) {
  if (!propertyId) throw new Error('缺 GA4_PROPERTY_ID（GA4 數值資源 ID，非 G- 評量 ID）。');
  const id = String(propertyId).replace(/^properties\//, '');
  const token = await getAccessToken('https://www.googleapis.com/auth/analytics.readonly');
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GA4 API：${data.error?.message || res.status}`);
  return data;
}

/** Search Console searchAnalytics.query（唯讀） */
export async function gscQuery(siteUrl, body) {
  const token = await getAccessToken('https://www.googleapis.com/auth/webmasters.readonly');
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`GSC API：${data.error?.message || res.status}`);
  return data;
}

/** Search Console URL Inspection（唯讀）：回單一網址之索引狀態 indexStatusResult */
export async function inspectUrl(siteUrl, inspectionUrl) {
  const token = await getAccessToken('https://www.googleapis.com/auth/webmasters.readonly');
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`URL Inspection：${data.error?.message || res.status}`);
  return data.inspectionResult?.indexStatusResult ?? {};
}

/** Search Console Sitemaps 清單（唯讀）：回各 sitemap 之提交數/錯誤/警告/最後下載 */
export async function sitemapsList(siteUrl) {
  const token = await getAccessToken('https://www.googleapis.com/auth/webmasters.readonly');
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sitemaps：${data.error?.message || res.status}`);
  return data.sitemap ?? [];
}
