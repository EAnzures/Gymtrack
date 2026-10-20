import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, exportBackup, loadState, MAX_BACKUP_BYTES, parseBackup, saveState, STORAGE_KEY } from '../dist/storage.js';
import { FOODS } from '../dist/foods.js';

function food() {
  return {
    id: 'custom-tortilla', name: 'Tortilla de maíz', category: 'Cereales',
    preparation: 'Lista para comer', emoji: '🌽',
    source: { name: 'Etiqueta del usuario', url: '', code: 'custom' },
    smaeGroup: null, equivalentGrams: null,
    per100: {
      kcal: 220, protein: 5.7, carbs: 44.6, fat: 2.9, fiber: 6.3,
      calcium: 81, iron: 1.2, magnesium: null, potassium: null,
      sodium: 45, zinc: null, vitaminA: null, vitaminC: null,
      vitaminD: null, vitaminB12: null, folate: null,
    },
  };
}

function sample() {
  const state = emptyState();
  state.profile = { name: 'Ana', sex: 'female', age: 30, height: 165, weight: 65, activity: 1.375, goal: 'maintain', baselineSteps: 5000, specialCondition: false };
  state.days['2026-10-19'] = {
    meals: [{ id: 'meal-1', name: 'Comida 1', entries: [{ id: 'entry-1', food: food(), grams: 150 }] }],
    steps: 6200,
  };
  state.customFoods = [food()];
  state.favorites = ['custom-tortilla'];
  return state;
}

const roundTrip = (value) => parseBackup(JSON.stringify(value));

test('backup preserves profiles, meals, snapshots and missing micronutrients', () => {
  const original = sample();
  assert.deepEqual(parseBackup(exportBackup(original)), original);
  const restored = roundTrip(original);
  restored.days['2026-10-19'].meals[0].entries[0].food.per100.kcal = 1;
  assert.equal(original.days['2026-10-19'].meals[0].entries[0].food.per100.kcal, 220);
});

test('every catalog food survives backup and restore as a historical snapshot', () => {
  for (const catalogFood of FOODS) {
    const state = sample();
    state.days['2026-10-19'].meals[0].entries[0].food = catalogFood;
    const restored = roundTrip(state);
    assert.deepEqual(restored.days['2026-10-19'].meals[0].entries[0].food, catalogFood);
  }
});

test('empty storage creates independent state; save and load retain records', () => {
  const stored = new Map();
  globalThis.localStorage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  assert.deepEqual(loadState(), emptyState());
  saveState(sample());
  assert.ok(stored.has(STORAGE_KEY));
  assert.deepEqual(loadState(), sample());
});

test('corrupt data and unavailable storage surface an error without erasing anything', () => {
  let writes = 0;
  globalThis.localStorage = { getItem: () => '{broken', setItem: () => { writes += 1; } };
  assert.throws(() => loadState(), /Conservamos los datos originales/);
  assert.equal(writes, 0);
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; } };
  assert.throws(() => loadState(), /no está disponible/);
  assert.throws(() => saveState(sample()), /No hay espacio suficiente/);
  delete globalThis.localStorage;
});

test('malformed, unsupported, oversized or polluted backups are rejected', () => {
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /5 MB/);
  assert.throws(() => roundTrip({ ...emptyState(), version: 2 }), /versión/);
  assert.throws(() => parseBackup('{"version":1,"profile":null,"days":{},"customFoods":[],"favorites":[],"__proto__":{"polluted":true}}'), /desconocido/);
  assert.throws(() => parseBackup('{"version":1,"profile":null,"days":{"constructor":{}},"customFoods":[],"favorites":[]}'), /desconocido/);
  assert.equal({}.polluted, undefined);
});

test('negative grams, wrong types, impossible dates and duplicate IDs are rejected', () => {
  const cases = [
    (state) => { state.days['2026-10-19'].meals[0].entries[0].grams = -1; },
    (state) => { state.days['2026-10-19'].meals[0].entries[0].grams = '150'; },
    (state) => { state.days['2026-10-19'].steps = 1.5; },
    (state) => { state.days['2026-02-30'] = state.days['2026-10-19']; },
    (state) => { state.days['2026-10-19'].meals[0].entries.push(state.days['2026-10-19'].meals[0].entries[0]); },
    (state) => { state.profile.specialCondition = 'false'; },
    (state) => { state.profile.name = 'x'.repeat(81); },
    (state) => { state.profile.activity = 3; },
    (state) => { state.customFoods.push(state.customFoods[0]); },
    (state) => { state.favorites = ['custom-missing']; },
  ];
  for (const mutate of cases) {
    const state = sample();
    mutate(state);
    assert.throws(() => roundTrip(state), /Respaldo no válido/);
  }
});

test('imported grams use the same supported limits as the nutrition calculator', () => {
  for (const grams of [0.01, 0.099, 5000.01, 20000]) {
    const state = sample();
    state.days['2026-10-19'].meals[0].entries[0].grams = grams;
    assert.throws(() => roundTrip(state), /gramos debe estar entre 0.1 y 5000/);
  }
  for (const grams of [0.1, 5000]) {
    const state = sample();
    state.days['2026-10-19'].meals[0].entries[0].grams = grams;
    assert.equal(roundTrip(state).days['2026-10-19'].meals[0].entries[0].grams, grams);
  }
});

test('unrecognized nutrients, wrong macro units, invalid sources and prototype keys are rejected', () => {
  const cases = [
    (item) => { item.per100.unknown = 4; },
    (item) => { item.per100.kcal = null; },
    (item) => { item.per100.protein = 150; },
    (item) => { item.per100.fiber = -1; },
    (item) => { item.per100.sodium = '12'; },
    (item) => { delete item.per100.iron; },
    (item) => { item.source.url = 'javascript:alert(1)'; },
    (item) => { item.source.url = 'https://user:password@example.com'; },
    (item) => { item.source.constructor = 'bad'; },
  ];
  for (const mutate of cases) {
    const state = sample();
    mutate(state.customFoods[0]);
    assert.throws(() => roundTrip(state), /Respaldo no válido/);
  }
});

test('historical food snapshots remain valid after their custom food is removed', () => {
  const state = sample();
  state.customFoods = [];
  state.favorites = [];
  assert.equal(roundTrip(state).days['2026-10-19'].meals[0].entries[0].food.name, 'Tortilla de maíz');
});
