import { test, expect } from '@playwright/test';
import { FOODS } from '../dist/foods.js';
import { STORAGE_KEY } from '../dist/storage.js';

const date = '2026-10-19';
const sampleFoods = [['tortilla-maiz', 150], ['aguacate', 20], ['salmon-cocido', 100], ['manzana', 60]];
const sampleEnergy = sampleFoods.reduce((total, [id, grams]) => total + FOODS.find(food => food.id === id).per100.kcal * grams / 100, 0);
const displayed = value => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value);
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const rawState = page => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
const readState = async page => JSON.parse(await rawState(page));
const closeModal = page => page.locator('#modal .modal-head [data-action="close"]').click();

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.testErrors = errors;
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('#selected-date').fill(date);
});

test.afterEach(async ({ page }) => {
  expect(page.testErrors, 'No uncaught browser errors').toEqual([]);
});

async function fillProfile(page) {
  await action(page, 'profile').first().click();
  const form = page.locator('#profile-form');
  await form.locator('[name="name"]').fill('Ana');
  await form.locator('[name="age"]').fill('30');
  await form.locator('[name="sex"]').selectOption('female');
  await form.locator('[name="weight"]').fill('65');
  await form.locator('[name="height"]').fill('165');
  await form.locator('[name="goal"]').selectOption('maintain');
  await form.locator('[name="activity"]').selectOption('1.375');
  await form.locator('[name="baselineSteps"]').fill('5000');
  return form;
}

async function createProfile(page) {
  const form = await fillProfile(page);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.locator('.goal-number')).toContainText('1,884');
}

async function createMeal(page, name) {
  await action(page, 'new-meal').first().click();
  await page.locator('#meal-form [name="name"]').fill(name);
  await page.locator('#meal-form button[type="submit"]').click();
  await expect(page.locator('#food-search')).toBeVisible();
}

async function addFood(page, foodId, grams) {
  const food = FOODS.find(item => item.id === foodId);
  await page.locator('#food-search').fill(food.name);
  await page.locator(`[data-action="choose-food"][data-food="${foodId}"]`).click();
  await page.locator('#portion-grams').fill(String(grams));
  await page.locator('#portion-form button[type="submit"]').click();
  await expect(page.locator('#food-search')).toBeVisible();
}

async function example(page) {
  await action(page, 'example').click();
  await action(page, 'confirm-example').click();
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.locator('.entry')).toHaveCount(4);
}

async function importText(page, text) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#main [data-action="import"]').click();
  await (await chooser).setFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

async function expectNoOverflow(page) {
  const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  const expectedWidth = page.viewportSize().width;
  expect(result.width, `Mobile viewport was expanded by overflowing content: ${JSON.stringify(result)}`).toBeLessThanOrEqual(expectedWidth + 1);
  expect(result.scroll, `Document overflows viewport: ${JSON.stringify(result)}`).toBeLessThanOrEqual(expectedWidth + 1);
}

test('cancel buttons leave profile and meal data unchanged', async ({ page }) => {
  const before = await rawState(page);
  const form = await fillProfile(page);
  await form.locator('[data-action="close"]').click();
  await expect(page.locator('#modal')).not.toBeVisible();
  expect(await rawState(page)).toBe(before);
  await action(page, 'new-meal').first().click();
  await page.locator('#meal-form [name="name"]').fill('No debe guardarse');
  await page.locator('#meal-form [data-action="close"]').click();
  expect(await rawState(page)).toBe(before);
  await expect(page.locator('.meal')).toHaveCount(0);
});

test('profile, grams, multiple meals, edits and calendar survive a reload', async ({ page }, testInfo) => {
  await createProfile(page);
  await createMeal(page, 'Comida 1');
  for (const [id, grams] of sampleFoods) await addFood(page, id, grams);
  await closeModal(page);
  await expect(page.getByTestId('total-kcal')).toHaveText(displayed(sampleEnergy));
  const meal = page.locator('.meal').first();
  await expect(meal.locator('.entry')).toHaveCount(4);
  expect((await readState(page)).days[date].meals[0].entries.map(entry => entry.grams)).toEqual([150, 20, 100, 60]);
  await meal.locator('[data-action="edit-entry"]').first().click();
  await page.locator('#portion-grams').fill('200');
  await page.locator('#edit-entry-form button[type="submit"]').click();
  const extraTortillaEnergy = FOODS.find(food => food.id === 'tortilla-maiz').per100.kcal / 2;
  await expect(page.getByTestId('total-kcal')).toHaveText(displayed(sampleEnergy + extraTortillaEnergy));
  await createMeal(page, 'Comida 2');
  await addFood(page, 'manzana', 100);
  await closeModal(page);
  await expect(page.locator('.meal')).toHaveCount(2);
  const total = await page.getByTestId('total-kcal').textContent();
  await action(page, 'previous-day').click();
  await expect(page.getByTestId('total-kcal')).toHaveText('0');
  await expect(page.locator('.meal')).toHaveCount(0);
  await action(page, 'next-day').click();
  await expect(page.getByTestId('total-kcal')).toHaveText(total);
  await page.reload();
  await page.locator('#selected-date').fill(date);
  await expect(page.locator('.meal')).toHaveCount(2);
  await expect(page.getByTestId('total-kcal')).toHaveText(total);
  await expect(page.locator('.entry-detail').first()).toContainText('200 g');
  await page.locator('[data-view="history"]').click();
  await expect(page.locator(`[data-action="open-day"][data-date="${date}"]`).last()).toContainText(total);
  await page.locator(`[data-action="open-day"][data-date="${date}"]`).last().click();
  await page.screenshot({ path: testInfo.outputPath('meal-workflow.png'), fullPage: true });
});

test('custom foods keep omitted micronutrients unknown and steps never change energy', async ({ page }) => {
  await createProfile(page);
  await page.locator('[data-view="foods"]').click();
  await action(page, 'custom-food').click();
  const form = page.locator('#custom-food-form');
  await form.locator('[name="name"]').fill('Yogur de prueba');
  for (const [name, value] of Object.entries({ kcal: '80', protein: '5', carbs: '10', fat: '2' })) {
    await form.locator(`[name="${name}"]`).fill(value);
  }
  await form.locator('button[type="submit"]').click();
  await page.locator('#portion-grams').fill('150');
  await page.locator('#portion-form button[type="submit"]').click();
  await closeModal(page);
  await page.locator('[data-view="diary"]').click();
  await expect(page.getByTestId('total-kcal')).toHaveText('120');
  const custom = (await readState(page)).customFoods[0];
  expect(custom.per100.calcium).toBeNull();
  expect(custom.per100.fiber).toBeNull();
  expect(custom.per100.sodium).toBeNull();
  await action(page, 'micros').click();
  const calcium = page.locator('.nutrient-table tbody tr').filter({ hasText: 'Calcio' });
  await expect(calcium).toContainText('Datos incompletos');
  await expect(calcium.locator('td').nth(1)).toContainText('—');
  await expect(calcium.locator('td').nth(3)).toHaveText('—');
  await closeModal(page);
  await action(page, 'steps').click();
  await page.locator('#steps-form [name="steps"]').fill('6500');
  await page.locator('#steps-form button[type="submit"]').click();
  await expect(page.locator('.step-value')).toContainText('6,500');
  await expect(page.locator('.step-value')).toContainText('5,500');
  await expect(page.getByTestId('total-kcal')).toHaveText('120');
  expect((await readState(page)).days[date].steps).toBe(6500);
  await page.reload();
  await page.locator('#selected-date').fill(date);
  await expect(page.getByTestId('total-kcal')).toHaveText('120');
  await expect(page.locator('.step-value')).toContainText('6,500');
});

test('import rejects invalid grams without replacing data and restores valid backups only after confirmation', async ({ page }) => {
  await createProfile(page);
  await example(page);
  const original = await rawState(page);
  const invalid = JSON.parse(original);
  invalid.days[date].meals[0].entries[0].grams = 0.01;
  await page.locator('[data-view="goals"]').click();
  await importText(page, JSON.stringify(invalid));
  await expect(page.locator('#toast')).toContainText('gramos debe estar entre 0.1 y 5000');
  expect(await rawState(page)).toBe(original);
  await expect(page.locator('#modal')).not.toBeVisible();
  const valid = JSON.parse(original);
  valid.profile.name = 'Ana restaurada';
  await importText(page, JSON.stringify(valid));
  await expect(page.locator('#modal-title')).toHaveText('Revisar respaldo');
  expect(await rawState(page)).toBe(original);
  await action(page, 'confirm-import').click();
  await expect(page.locator('#modal')).not.toBeVisible();
  expect((await readState(page)).profile.name).toBe('Ana restaurada');
  await page.locator('[data-view="diary"]').click();
  await expect(page.getByTestId('total-kcal')).toHaveText(displayed(sampleEnergy));
});

test('cached app opens and saves meals while offline', async ({ page, context }) => {
  await createProfile(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('standalone');
  await context.setOffline(true);
  await page.reload();
  await page.locator('#selected-date').fill(date);
  await example(page);
  await expect(page.getByTestId('total-kcal')).toHaveText(displayed(sampleEnergy));
  await page.reload();
  await page.locator('#selected-date').fill(date);
  await expect(page.locator('.entry')).toHaveCount(4);
  await expect(page.getByTestId('total-kcal')).toHaveText(displayed(sampleEnergy));
  await context.setOffline(false);
});

test('favorites persist and deleting foods or meals requires confirmation', async ({ page }) => {
  await example(page);
  await page.locator('[data-view="foods"]').click();
  await page.locator('#catalog-search').fill('Tortilla de maíz');
  await page.locator('[data-action="favorite"][data-food="tortilla-maiz"]').click();
  await expect(page.locator('[data-action="favorite"][data-food="tortilla-maiz"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.locator('[data-view="foods"]').click();
  await page.locator('[data-action="filter"][data-filter="Favoritos"]').click();
  await expect(page.locator('.catalog-food')).toHaveCount(1);
  await expect(page.locator('.catalog-food h3')).toHaveText('Tortilla de maíz');
  await page.locator('[data-action="favorite"][data-food="tortilla-maiz"]').click();
  await expect(page.locator('.catalog-food')).toHaveCount(0);
  expect((await readState(page)).favorites).toEqual([]);
  await page.locator('[data-view="diary"]').click();
  await page.locator('#selected-date').fill(date);
  await action(page, 'delete-entry').first().click();
  await page.locator('#modal .modal-actions [data-action="close"]').click();
  await expect(page.locator('.entry')).toHaveCount(4);
  await action(page, 'delete-entry').first().click();
  await action(page, 'confirm-delete-entry').click();
  await expect(page.locator('.entry')).toHaveCount(3);
  const tortillaEnergy = FOODS.find(food => food.id === 'tortilla-maiz').per100.kcal * 1.5;
  await expect(page.getByTestId('total-kcal')).toHaveText(displayed(sampleEnergy - tortillaEnergy));
  await action(page, 'delete-meal').click();
  await page.locator('#modal .modal-actions [data-action="close"]').click();
  await expect(page.locator('.meal')).toHaveCount(1);
  await action(page, 'delete-meal').click();
  await action(page, 'confirm-delete-meal').click();
  await expect(page.locator('.meal')).toHaveCount(0);
  await expect(page.getByTestId('total-kcal')).toHaveText('0');
  await page.reload();
  await page.locator('#selected-date').fill(date);
  await expect(page.locator('.meal')).toHaveCount(0);
  expect((await readState(page)).days[date].meals).toEqual([]);
});

test('diary, navigation and dialogs fit the viewport @layout', async ({ page }, testInfo) => {
  await createProfile(page);
  await example(page);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`diary-${testInfo.project.name}.png`), fullPage: true });
  for (const view of ['history', 'foods', 'goals', 'diary']) {
    await page.locator(`[data-view="${view}"]`).click();
    await expectNoOverflow(page);
  }
  await action(page, 'add-food').first().click();
  await expectNoOverflow(page);
  const bounds = await page.locator('#modal').boundingBox();
  const width = page.viewportSize().width;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  await closeModal(page);
  await action(page, 'micros').click();
  await expectNoOverflow(page);
});
