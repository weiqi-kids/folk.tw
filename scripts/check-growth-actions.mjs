#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const base = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf8');
const search = readFileSync(new URL('../src/pages/search.astro', import.meta.url), 'utf8');

const actions = [...home.matchAll(/data-intent-action="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(actions.sort(), ['nearby_temples', 'qiugian', 'today']);
for (const href of ['/almanac/', '/qiugian/', '/temples/nearby/']) assert.ok(home.includes(`href="${href}"`));
assert.match(base, /gtag\('event', 'intent_click'/);
assert.match(base, /intent_id:/);
assert.match(search, /'search_zero_results'/);
assert.match(search, /'view_search_results'/);
assert.match(search, /'search_result_click'/);
assert.match(search, /\[redacted:\$\{topicOf\(term\)\}\]/);
assert.match(search, /sensitive\.test\(term\)/);
console.log('✓ 常青成長入口檢查通過：首頁 3 個固定意圖、共用 intent_click、搜尋需求與隱私閘皆存在。');
