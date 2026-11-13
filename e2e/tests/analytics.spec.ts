import { test, expect, type APIResponse } from '@playwright/test';
import { collectPageProblems } from './_helpers';

test('analytics page renders KPIs, the world map and the garde histogram', async ({ page }, testInfo) => {
  const problems = collectPageProblems(page, testInfo);

  const analyticsResponse = page.waitForResponse(
    (r) => r.url().includes('/api/analytics') && r.request().method() === 'GET',
  );
  await page.goto('/analytics-terroirs');
  const res = await analyticsResponse;
  expect(res.ok()).toBe(true);
  const stats = (await res.json())?.data;

  await expect(page.getByTestId('analytics-page-title')).toBeVisible();

  // The KPI cards reflect the figures the API actually returned — a
  // zeroed-totals bug (e.g. a date-filtering regression) must fail this,
  // not just "some digit exists somewhere on the page".
  // #702: with no price at all, the valuation says so instead of 0 €.
  const nothingPriced = stats.totalActiveItems > 0 && stats.unpricedUnits >= stats.totalActiveItems;
  await expect(page.getByTestId('kpi-total-valuation')).toContainText(nothingPriced ? 'Prix non renseigné' : String(stats.totalValuation));
  await expect(page.getByTestId('kpi-liquid-stock')).toContainText(stats.totalLiquidLiters.toLocaleString('fr-FR'));
  await expect(page.getByTestId('kpi-cigar-humidor')).toContainText(String(stats.cigarCount));
  await expect(page.getByTestId('kpi-urgent-degustation')).toContainText(String(stats.urgentDegustationCount));

  // #848: the movement counters say they start at the update that brought the journal.
  await expect(page.getByTestId('movements-journal-start')).toContainText('journal des mouvements');

  // The garde histogram actually rendered its bars, not just "some SVGs
  // exist" (which the sidebar icons alone satisfy).
  if ((stats.gardeHistogram?.length ?? 0) > 0) {
    await expect(page.locator('svg').first()).toBeVisible();
  }

  await problems.dump();
  expect(problems.get(), problems.get().join('\n')).toEqual([]);
});

// Recette n°5 ter of #847: "Résultats correspondant aux filtres" listed a wine
// drunk 13 times as 13 rows, though it was no longer in the cellar. One row per
// wine, only the wines still in stock, with how many are left.
test('the list under the map shows one row per wine in stock', async ({ page }) => {
  const api = page.request;
  const okData = async <T>(res: APIResponse): Promise<T> => {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()).data as T;
  };
  const tag = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const kept = await okData<{ productId: string }>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E 5ter gardé ${tag}`, producer: 'Domaine E2E', vintage: 2018, region: 'Bordeaux', quantity: 21 },
  }));
  const gone = await okData<{ productId: string }>(await api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E 5ter tout bu ${tag}`, producer: 'Domaine E2E', vintage: 2015, region: 'Bordeaux', quantity: 3 },
  }));
  await okData(await api.post('/api/products/bulk-drink', {
    data: { items: [{ productId: kept.productId, count: 13 }, { productId: gone.productId, count: 3 }] },
  }));

  try {
    await page.goto('/analytics-terroirs');
    const rows = page.getByRole('button').filter({ has: page.getByTestId('map-asset-stock') });
    const keptRows = rows.filter({ hasText: `E2E 5ter gardé ${tag}` });
    await expect(keptRows).toHaveCount(1);
    await expect(keptRows.getByTestId('map-asset-stock')).toHaveText(/^8\s+bouteilles$/);
    await expect(rows.filter({ hasText: `E2E 5ter tout bu ${tag}` })).toHaveCount(0);
  } finally {
    for (const id of [kept.productId, gone.productId]) await api.delete(`/api/products/${id}`);
  }
});

// #961: a bottle in stock the world map cannot place is never silently left
// out: the line under the map counts it, names its region, and links to the
// bottles list filtered on "Pas sur la carte". Spellings of one region are one
// place; a wine without a region is placed by a known appellation.
test('the bottles the map cannot place are counted under it and listed with "Pas sur la carte"', async ({ page }) => {
  const api = page.request;
  const okData = async <T>(res: APIResponse): Promise<T> => {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()).data as T;
  };
  const tag = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const unknownRegion = `Terroir Imaginaire ${tag}`;
  const create = (name: string, extra: Record<string, unknown>) => api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E 961 ${name} ${tag}`, producer: 'Domaine E2E', vintage: 2019, ...extra },
  }).then((res) => okData<{ productId: string }>(res));
  const unplaced = await create('inconnu', { region: unknownRegion, quantity: 3 });
  const spelt = await create('minuscules', { region: 'nouvelle aquitaine ', quantity: 2 });
  const byAppellation = await create('appellation', { appellation: 'Pomerol', quantity: 1 });

  try {
    const stats = await okData<{ regionCategoryBreakdown: { region: string }[] }>(await api.get('/api/analytics'));
    const regions = stats.regionCategoryBreakdown.map((r) => r.region);
    expect(regions).toContain('Nouvelle-Aquitaine');
    expect(regions).not.toContain('nouvelle aquitaine');
    expect(regions).toContain('Pomerol');
    expect(regions).toContain(unknownRegion);

    await page.goto('/analytics-terroirs');
    const line = page.getByTestId('map-not-located');
    // The line names at most 5 regions (unit-tested): its count and link are what matter here.
    await expect(line).toContainText('ne sont pas sur la carte');
    await line.getByRole('link', { name: 'Voir ces bouteilles' }).click();
    await expect(page).toHaveURL(/\/bottles\?filter=notLocated$/);

    // Narrowed to this test's wines: only the one the map cannot place.
    await page.goto(`/bottles?filter=notLocated&q=${encodeURIComponent(tag)}`);
    const cards = page.getByTestId('family-card');
    await expect(cards.filter({ hasText: `E2E 961 inconnu ${tag}` })).toHaveCount(1);
    await expect(cards.filter({ hasText: `E2E 961 minuscules ${tag}` })).toHaveCount(0);
    await expect(cards.filter({ hasText: `E2E 961 appellation ${tag}` })).toHaveCount(0);
  } finally {
    for (const { productId } of [unplaced, spelt, byAppellation]) await api.delete(`/api/products/${productId}`);
  }
});

// FEAT-114 (#989): the world map zooms (controls, wheel), moves by dragging,
// comes back to the cellar with "Recentrer", follows the region list, and shows
// full screen with the region's list over it; Escape closes the wine drawer,
// then the list, then full screen, the zoom kept all along.
test('the world map zooms, recenters and shows full screen without losing its zoom', async ({ page }) => {
  const api = page.request;
  const okData = async <T>(res: APIResponse): Promise<T> => {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()).data as T;
  };
  const tag = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
  const create = (name: string, region: string) => api.post('/api/inventory', {
    data: { category: 'wine', name: `E2E 989 ${name} ${tag}`, producer: 'Domaine E2E', vintage: 2020, region, quantity: 1 },
  }).then((res) => okData<{ productId: string }>(res));
  const created = [await create('Morgon', 'Beaujolais'), await create('Volnay', 'Bourgogne')];

  try {
    await page.goto('/analytics-terroirs');
    const map = page.getByTestId('world-map');
    await expect(map.locator('[data-testid="map-marker"], [data-testid="map-cluster"]').first()).toBeVisible();
    const zoomOf = async () => Number(await map.getAttribute('data-zoom'));
    const centerOf = () => map.getAttribute('data-center');
    const opening = { zoom: await zoomOf(), center: await centerOf() };
    expect(opening.zoom).toBeGreaterThan(1);

    const zoomIn = page.getByRole('button', { name: 'Agrandir la carte' });
    const zoomOut = page.getByRole('button', { name: 'Réduire la carte' });
    // Out to the whole world, where − stops, then in again.
    while (await zoomOut.isEnabled()) await zoomOut.click();
    await expect(map).toHaveAttribute('data-zoom', '1');
    await zoomIn.click();
    await expect(map).toHaveAttribute('data-zoom', '2');

    // The wheel zooms the map, not the page.
    await map.scrollIntoViewIfNeeded();
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, -400);
    await expect.poll(zoomOf).toBeGreaterThan(2);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    // Dragging moves it.
    const centerBeforeDrag = await centerOf();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    await expect.poll(centerOf).not.toBe(centerBeforeDrag);

    // "Recentrer" brings back exactly the opening framing (nothing else changed the markers).
    await page.getByRole('button', { name: 'Recentrer sur ma cave' }).click();
    await expect(map).toHaveAttribute('data-zoom', String(opening.zoom));
    await expect(map).toHaveAttribute('data-center', opening.center!);

    // Choosing Beaujolais in the region list centres and enlarges the map on it.
    const regionTrigger = page.locator('button[data-slot="trigger"]', { hasText: 'Région' }).filter({ visible: true }).first();
    await regionTrigger.click();
    await page.getByRole('option', { name: 'Beaujolais', exact: true }).click();
    await expect.poll(zoomOf).toBeGreaterThanOrEqual(6);
    const [lng, lat] = (await centerOf())!.split(',').map(Number);
    expect(Math.abs(lng - 4.65)).toBeLessThan(1);
    expect(Math.abs(lat - 46.12)).toBeLessThan(1);
    // At the maximum zoom nothing stays grouped: Bourgogne and Beaujolais are two markers.
    while (await zoomIn.isEnabled()) await zoomIn.click();
    await expect(map).toHaveAttribute('data-zoom', '8');
    await expect(map.getByTestId('map-cluster')).toHaveCount(0);
    await expect(map.locator('[data-region="Bourgogne"]')).toHaveCount(1);
    await expect(map.locator('[data-region="Beaujolais"]')).toHaveCount(1);
    const focused = { zoom: await zoomOf(), center: await centerOf() };

    // Full screen: same zoom, controls in it.
    await page.getByRole('button', { name: 'Afficher la carte en plein écran' }).click();
    const fullScreen = page.getByRole('dialog', { name: 'Carte du monde en plein écran' });
    await expect(fullScreen).toBeVisible();
    await expect(fullScreen.getByRole('button', { name: 'Agrandir la carte' })).toBeVisible();
    await expect(fullScreen.getByRole('button', { name: 'Quitter le plein écran' })).toBeVisible();
    expect(await zoomOf()).toBeCloseTo(focused.zoom, 6);

    // A region chosen in full screen opens its list over the map; a wine opens its drawer over it.
    await fullScreen.locator('button[data-slot="trigger"]', { hasText: 'Région' }).click();
    await page.getByRole('option', { name: 'Bourgogne', exact: true }).click();
    const list = fullScreen.getByRole('region', { name: /Bourgogne/ });
    await expect(list).toBeVisible();
    // The region list and the view-type switch stay usable with the list open
    // (a click on a covered control fails Playwright's actionability check).
    await fullScreen.getByRole('button', { name: 'Carte de chaleur par type' }).click();
    await fullScreen.getByRole('button', { name: 'Marqueurs' }).click();
    await fullScreen.locator('button[data-slot="trigger"]', { hasText: 'Région' }).click();
    await page.getByRole('option', { name: 'Bourgogne', exact: true }).click();
    await expect(list).toBeVisible();
    await list.getByText(`E2E 989 Volnay ${tag}`).click();
    const drawer = page.getByRole('dialog').filter({ has: page.locator('#inventory-detail-title') });
    await expect(drawer.locator('#inventory-detail-title')).toHaveText(`E2E 989 Volnay ${tag}`);
    const zoomInFullScreen = await zoomOf();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(fullScreen).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(fullScreen).toHaveCount(0);
    expect(await zoomOf()).toBeCloseTo(zoomInFullScreen, 6);
    // The region stays selected: its list shows under the map.
    await expect(page.getByText(`E2E 989 Volnay ${tag}`)).toBeVisible();
  } finally {
    for (const { productId } of created) await api.delete(`/api/products/${productId}`);
  }
});
