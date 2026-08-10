#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const base = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf8');
const search = readFileSync(new URL('../src/pages/search.astro', import.meta.url), 'utf8');
const linePage = readFileSync(new URL('../src/pages/line/index.astro', import.meta.url), 'utf8');
const lineCta = readFileSync(new URL('../src/components/LineCta.astro', import.meta.url), 'utf8');
const growth48h = readFileSync(new URL('./growth-48h.mjs', import.meta.url), 'utf8');
const lineFamilies = [
  '../src/pages/index.astro',
  '../src/pages/festivals/[slug].astro',
  '../src/pages/almanac/index.astro',
  '../src/pages/almanac/[date].astro',
  '../src/pages/good-days/index.astro',
  '../src/pages/good-days/[slug].astro',
  '../src/pages/qiugian/[slug].astro',
].map((path) => [path, readFileSync(new URL(path, import.meta.url), 'utf8')]);

const actions = [...home.matchAll(/data-intent-action="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(actions.sort(), ['nearby_temples', 'qiugian', 'today']);
for (const href of ['/almanac/', '/qiugian/', '/temples/nearby/']) assert.ok(home.includes(`href="${href}"`));
// GA4 48h 樣本不足時不得撤掉當期主卡；GSC 已出現中元查詢則用次入口提早承接，
// 並獨立標記 placement，後續報表才能判斷是否值得保留。
assert.match(home, /data-early-zhongyuan/);
assert.match(home, /data-growth-placement="home_secondary"/);
assert.match(home, /data-growth-campaign=\{zhongyuanCampaign\.festivalSlug\}/);
assert.ok(home.indexOf('data-seasonal-campaign') < home.indexOf('class="intent-actions"'),
  '首頁節日戰役必須在手機三張常青卡之前，否則主版位會被推離首屏');
assert.match(base, /gtag\('event', 'intent_click'/);
assert.match(base, /intent_id:/);
assert.match(search, /'search_zero_results'/);
assert.match(search, /'view_search_results'/);
assert.match(search, /'search_result_click'/);
assert.match(search, /\[redacted:\$\{topicOf\(term\)\}\]/);
assert.match(search, /sensitive\.test\(term\)/);

// LINE 官方帳號網站入口：不可只放一個無脈絡的頁尾連結；核心功能頁必須在使用情境中接入。
assert.match(linePage, /LINE 官方帳號 · @616yhksm/);
assert.match(linePage, /群組也能用/);
assert.match(linePage, /平常不推播/);
assert.match(linePage, /data-line-placement="line_page_hero"/);
assert.match(linePage, /data-line-placement="line_page_bottom"/);
assert.match(lineCta, /https:\/\/line\.me\/R\/ti\/p\/@616yhksm/);
assert.match(lineCta, /data-line-add/);
assert.match(lineCta, /data-line-placement=\{placement\}/);
for (const [path, source] of lineFamilies) assert.match(source, /LineCta/, `${path} 缺 LINE 情境入口`);
const qiugian = lineFamilies.find(([path]) => path.includes('qiugian'))[1];
assert.match(qiugian, /id="lineAfterDraw" hidden/);
assert.match(qiugian, /getElementById\('lineAfterDraw'\)!\.hidden = false/);
assert.match(base, /gtag\('event', 'line_add_click'/);
assert.match(base, /line_placement:/);
assert.match(base, /href="\/line\/">神酷 LINE（@616yhksm）/);
assert.match(growth48h, /customEvent:line_placement/);
assert.match(growth48h, /line_add_click/);
assert.match(growth48h, /dimensionStatus/);
assert.match(growth48h, /customEvent:campaign_placement/);
assert.match(growth48h, /x\.pagePath === '\/'/);
assert.match(growth48h, /sitewideCampaignClicks/);
for (const placement of ['home_image', 'home_title', 'home_cta', 'home_secondary']) {
  assert.ok(growth48h.includes(placement), `48h 報表缺 campaign 版位 ${placement}`);
}
for (const eventName of ['checklist_toggle', 'checklist_copy', 'checklist_share', 'checklist_reset']) {
  assert.ok(growth48h.includes(eventName), `48h 報表缺普渡清單事件 ${eventName}`);
}
for (const landing of ['jilong-zhongyuan', 'qianggu', 'fangshuideng', 'dizang']) {
  assert.ok(growth48h.includes(`/festivals/${landing}/`), `48h 報表缺季節 landing ${landing}`);
}

console.log('✓ 常青成長入口檢查通過：首頁 3 個固定意圖、搜尋需求與隱私閘、LINE 8 類入口、campaign 首頁 CTR／版位、普渡清單事件與季節 landing 報表皆存在。');
