/**
 * 「附近的廟」的格檔：`/temples/nearby/cells/<lat10>_<lng10>.json`。
 *
 * 由 `/temples/nearby/` 的 client script 於使用者按下定位後才抓，一次抓身邊 3×3（不夠再擴 5×5）。
 * 切格規則見 `src/lib/nearby-grid.ts`——**這裡不重寫任何格子數學**。
 *
 * ⚠️ 這些是資料檔不是頁面，已在 astro.config.mjs 的 sitemap filter 排除
 *    （提交 JSON 給搜尋引擎只會浪費抓取預算）。
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getTemples } from '../../../../lib/queries';
import { buildCells, type NearbyRow } from '../../../../lib/nearby-grid';

export const getStaticPaths = (async () => {
  const temples = await getTemples();
  const cells = buildCells(
    temples.map((t) => ({
      id: t.id,
      name: t.data.name,
      lat: t.data.lat,
      lng: t.data.lng,
      district: t.data.district,
      main_deity_raw: t.data.main_deity_raw,
    })),
  );
  return [...cells.entries()].map(([cell, rows]) => ({ params: { cell }, props: { rows } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify((props as { rows: NearbyRow[] }).rows), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
