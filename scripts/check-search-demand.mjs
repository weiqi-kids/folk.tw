#!/usr/bin/env node
import assert from 'node:assert/strict';
import { summarizeSearchDemand, searchDemandMarkdown } from './lib/search-demand.mjs';

const row = (event, term, events, users) => ({
  dimensionValues: [{ value: event }, { value: term }],
  metricValues: [{ value: String(events) }, { value: String(users) }],
});
const report = summarizeSearchDemand([
  row('search_zero_results', '某某王爺廟', 3, 2),
  row('search_zero_results', '[redacted:other]', 5, 4),
  row('view_search_results', '媽祖', 8, 6),
  row('search_result_click', '媽祖', 4, 3),
]);
assert.equal(report.zeroResults[0].term, '[redacted:other]');
assert.equal(report.zeroResults[1].events, 3);
assert.equal(report.searches[0].term, '媽祖');
assert.equal(report.resultClicks[0].users, 3);
const markdown = searchDemandMarkdown(report);
assert.match(markdown, /某某王爺廟：3 次/);
assert.match(markdown, /\[redacted:\*\]/);
console.log('✓ 站內搜尋需求彙整檢查通過：零結果、有效搜尋、結果點擊與隱私標記皆正確。');
