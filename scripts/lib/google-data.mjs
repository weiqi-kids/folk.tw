// 服務帳號自簽 JWT → 換存取權杖 → 唯讀拉 GA4（Data API）與 GSC（Search Console API）。
// 零外部依賴：Node 內建 crypto + 全域 fetch。
//
// 憑證（私鑰，務必勿進 repo）讀取優先序：
//   1. 環境變數 GOOGLE_SA_KEY        — 服務帳號 JSON 金鑰之「字串內容」
//   2. 環境變數 GOOGLE_APPLICATION_CREDENTIALS — JSON 金鑰之「檔案路徑」
//   3. scripts/.google-sa-key.json   — 本機金鑰檔（已 gitignore）
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

export function loadCredentials() {
  let raw;
  if (process.env.GOOGLE_SA_KEY) raw = process.env.GOOGLE_SA_KEY;
  else {
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(scriptsDir, '.google-sa-key.json');
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
export async function getAccessToken(scopes) {
  const { client_email, private_key } = loadCredentials();
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
  const token = await getAccessToken('https://www.googleapis.com/auth/analytics.readonly');
  const id = String(propertyId).replace(/^properties\//, '');
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
