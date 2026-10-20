import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, NUTRIENT_UNITS, SMAE_GROUPS, CATALOG_METADATA } from '../dist/foods.js';
import { NUTRIENTS, calculateTargets, scaleFood, sumEntries } from '../dist/nutrition.js';
import { emptyState, exportBackup, parseBackup } from '../dist/storage.js';

const byId = id => {
  const food = FOODS.find(item => item.id === id);
  assert.ok(food, `Required food ${id} is available`);
  return food;
};
const close = (actual, expected, nutrient) => assert.ok(
  Math.abs(actual - expected) < 1e-9, `${nutrient}: ${actual} differs from ${expected}`,
);
const example = () => [
  { id: 'entry-tortilla', food: byId('tortilla-maiz'), grams: 150 },
  { id: 'entry-aguacate', food: byId('aguacate'), grams: 20 },
  { id: 'entry-salmon', food: byId('salmon-cocido'), grams: 100 },
  { id: 'entry-manzana', food: byId('manzana'), grams: 60 },
];

test('the requested four-food meal totals 596.2 kcal with cooked salmon', () => {
  // Independently calculated from pinned USDA source rows 18363, 09037,
  // 15237 and 09003 at 1.5, 0.2, 1 and 0.6 times their 100 g values.
  const expected = {
    kcal: 596.2, protein: 31.206, carbs: 76.952, fat: 19.659,
    fiber: 12.23, calcium: 142.5, iron: 2.367, magnesium: 146.8,
    potassium: 824.2, sodium: 130.5, zinc: 2.547, vitaminA: 72.2,
    vitaminC: 8.46, vitaminD: 13.1, vitaminB12: 2.8, folate: 59.5,
  };
  const result = sumEntries(example());
  assert.equal(result.count, 4);
  for (const [key, value] of Object.entries(expected)) {
    close(result.totals[key], value, key);
    assert.equal(result.coverage[key], 1, `${key} has source data for all four foods`);
  }
  const macroEnergy = expected.protein * 4 + expected.carbs * 4 + expected.fat * 9;
  assert.notEqual(result.totals.kcal, macroEnergy, 'Published food energy is not overwritten by generic 4/4/9 factors');
});

test('raw and cooked preparations remain separate and change the example appropriately', () => {
  const cooked = example();
  const raw = example();
  raw[2].food = byId('salmon-crudo');
  close(sumEntries(raw).totals.kcal, 598.2, 'raw salmon meal kcal');
  assert.notEqual(sumEntries(raw).totals.protein, sumEntries(cooked).totals.protein);
  for (const [rawId, cookedId] of [
    ['salmon-crudo', 'salmon-cocido'], ['nopal-crudo', 'nopal-cocido'], ['avena-seca', 'avena-cocida'],
  ]) {
    assert.notEqual(byId(rawId).source.code, byId(cookedId).source.code);
    assert.notEqual(byId(rawId).preparation, byId(cookedId).preparation);
  }
});

test('missing catalog nutrients remain unknown, including alongside a reported zero', () => {
  const shrimp = byId('camaron-cocido');
  const avocado = byId('aguacate');
  const single = sumEntries([{ food: shrimp, grams: 100 }]);
  assert.equal(single.totals.vitaminD, null);
  assert.equal(single.coverage.vitaminD, 0);
  const partial = sumEntries([{ food: shrimp, grams: 100 }, { food: avocado, grams: 20 }]);
  assert.equal(partial.totals.vitaminD, 0);
  assert.equal(partial.coverage.vitaminD, 0.5);
  assert.equal(partial.coverage.kcal, 1);
  assert.equal(scaleFood(byId('chia'), 30).folate, null);
  assert.equal(scaleFood(avocado, 20).vitaminD, 0);
});

test('catalog and domain share nutrient units, including RAE, DFE and micrograms', () => {
  assert.deepEqual(Object.keys(NUTRIENT_UNITS).sort(), Object.keys(NUTRIENTS).sort());
  for (const [key, definition] of Object.entries(NUTRIENTS)) {
    assert.equal(NUTRIENT_UNITS[key], definition.unit, key);
  }
  assert.equal(NUTRIENT_UNITS.vitaminA, 'µg RAE');
  assert.equal(NUTRIENT_UNITS.folate, 'µg DFE');
  assert.equal(NUTRIENT_UNITS.vitaminD, 'µg');
  assert.equal(NUTRIENT_UNITS.sodium, 'mg');
});

test('every offline food has traceable source data, valid amounts and a valid group', () => {
  assert.ok(FOODS.length >= 60);
  assert.equal(new Set(FOODS.map(food => food.id)).size, FOODS.length);
  assert.match(CATALOG_METADATA.sha256, /^[a-f0-9]{64}$/);
  assert.match(CATALOG_METADATA.note, /no es la base oficial completa del SMAE/);
  for (const food of FOODS) {
    assert.equal(new URL(food.source.url).hostname, 'www.ars.usda.gov', food.id);
    assert.match(food.source.code, /^\d{5}$/, food.id);
    assert.ok(food.source.description && food.preparation, food.id);
    assert.ok(Object.hasOwn(SMAE_GROUPS, food.smaeGroup), food.id);
    assert.deepEqual(Object.keys(food.per100).sort(), Object.keys(NUTRIENTS).sort(), food.id);
    for (const [key, value] of Object.entries(food.per100)) {
      assert.ok(value === null || (Number.isFinite(value) && value >= 0), `${food.id}: ${key}`);
      if (['kcal', 'protein', 'carbs', 'fat'].includes(key)) assert.notEqual(value, null, `${food.id}: ${key}`);
    }
    if (food.equivalentGrams !== null) {
      assert.ok(food.equivalentGrams > 0 && food.equivalentSource, `${food.id}: traceable SMAE portion`);
      assert.equal(new URL(food.equivalentSource).hostname, 'fisiologia.facmed.unam.mx');
    }
  }
  assert.equal(byId('tortilla-maiz').equivalentGrams, null, 'No gram equivalent is invented from a household portion');
});

test('adults without automatic targets can retain and calculate their food diary', () => {
  const profile = { name: 'Ana', sex: 'female', age: 30, height: 165, weight: 65, activity: 1.55, goal: 'maintain', baselineSteps: 4000, specialCondition: false };
  for (const change of [
    { specialCondition: true },
    { height: 180, weight: 50, goal: 'deficit' },
    { age: 70, height: 150, weight: 45, activity: 1.2, goal: 'deficit' },
    { age: 85 },
  ]) {
    const state = emptyState();
    state.profile = { ...profile, ...change };
    state.days['2026-10-19'] = { meals: [{ id: 'meal-1', name: 'Comida 1', entries: example() }], steps: 3000 };
    if (change.age === 85) assert.throws(() => calculateTargets(state.profile));
    else assert.equal(calculateTargets(state.profile).eligible, false);
    const restored = parseBackup(exportBackup(state));
    assert.deepEqual(restored.profile, state.profile);
    const entries = restored.days['2026-10-19'].meals.flatMap(meal => meal.entries);
    close(sumEntries(entries).totals.kcal, 596.2, 'restored diary kcal');
  }
});
