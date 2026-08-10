#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  aggregateTempleCohorts,
  classifyQuery,
  fetchAllGscRows,
  positionBucket,
  templeIdFromPage,
  templeProfile,
} from './lib/temple-ctr-cohorts.mjs';

const temple = {
  id: 'dajia_zhenlan',
  name: '大甲鎮瀾宮',
  district: '臺中市大甲區順天路158號',
  main_deity_raw: '天上聖母',
};
const deity = { name: '媽祖', aliases: ['天后'] };
const profile = templeProfile(temple, deity, temple.name);

assert.equal(classifyQuery('大甲鎮瀾宮遶境', profile), 'festival_service');
assert.equal(classifyQuery('台中 大甲鎮瀾宮', profile), 'region_temple');
assert.equal(classifyQuery('大甲鎮瀾宮', profile), 'temple_name');
assert.equal(classifyQuery('大甲媽祖', profile), 'region_deity');
assert.equal(classifyQuery('附近古蹟', profile), 'other');
assert.deepEqual([1, 3.1, 10.1, 28].map(positionBucket), ['1–3', '4–10', '11–20', '21+']);
assert.equal(templeIdFromPage('https://folk.tw/temples/dajia_zhenlan/'), temple.id);
assert.equal(templeIdFromPage('https://folk.tw/temples/region/taichung/'), null);

const page = 'https://folk.tw/temples/dajia_zhenlan/';
const aggregate = aggregateTempleCohorts(
  [
    { page, query: '大甲鎮瀾宮', clicks: 2, impressions: 100, position: 2 },
    { page, query: '鎮瀾宮遶境', clicks: 1, impressions: 50, position: 8 },
    { page: 'https://folk.tw/temples/', query: '廟', clicks: 10, impressions: 10, position: 1 },
  ],
  new Map([[temple.id, profile]]),
  { minImpressions: 1 },
);
assert.equal(aggregate.acceptedRows, 2);
assert.equal(aggregate.acceptedPages, 1);
assert.equal(aggregate.skippedNonDetail, 1);
assert.equal(aggregate.cohorts.find((row) => row.intent === 'temple_name').ctr, 0.02);
assert.equal(aggregate.cohorts.find((row) => row.intent === 'temple_name').weightedPosition, 2);

const starts = [];
const fakeQuery = async (_site, body) => {
  starts.push(body.startRow);
  const all = [{ keys: ['a'] }, { keys: ['b'] }, { keys: ['c'] }];
  return { rows: all.slice(body.startRow, body.startRow + body.rowLimit) };
};
const paged = await fetchAllGscRows(fakeQuery, 'sc-domain:folk.tw', {}, { pageSize: 2, maxRows: 10 });
assert.deepEqual(starts, [0, 2]);
assert.equal(paged.rows.length, 3);
assert.equal(paged.exhausted, true);
assert.equal(paged.truncated, false);

console.log('✓ temple CTR cohort 分類、詳情頁過濾、加權統計與 GSC 分頁 gate 通過');
