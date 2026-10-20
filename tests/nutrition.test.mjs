import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { calculateTargets, localDate, scaleFood, sumEntries, NUTRIENTS, MICRO_REFERENCES } from '../dist/nutrition.js';

const profile = {
  name: 'Ana', sex: 'female', age: 30, height: 165, weight: 65,
  activity: 1.55, goal: 'maintain', baselineSteps: 4000, specialCondition: false,
};
const food = { name: 'Alimento de prueba', per100: { kcal: 200, protein: 10, carbs: 30, fat: 4, sodium: 0, vitaminD: null } };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('scales edible grams without mutating the original; keeps unknown and measured zero distinct', () => {
  const actual = scaleFood(food, 150);
  assert.equal(actual.kcal, 300);
  assert.equal(actual.protein, 15);
  assert.equal(actual.carbs, 45);
  assert.equal(actual.sodium, 0);
  assert.equal(actual.vitaminD, null);
  assert.equal(actual.folate, null);
  assert.equal(food.per100.kcal, 200);
  assert.equal(scaleFood(food, 0.1).kcal, 0.2);
  assert.equal(scaleFood(food, 5000).kcal, 10000);
});

test('totals disclose coverage for partial data, never invent missing nutrients', () => {
  const result = sumEntries([
    { food, grams: 150 },
    { food: { per100: { kcal: 100, sodium: null, vitaminC: 10 } }, grams: 50 },
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.totals.kcal, 350);
  assert.equal(result.coverage.kcal, 1);
  assert.equal(result.totals.sodium, 0);
  assert.equal(result.coverage.sodium, 0.5);
  assert.equal(result.totals.vitaminC, 5);
  assert.equal(result.coverage.vitaminC, 0.5);
  assert.equal(result.totals.vitaminD, null);
  assert.equal(result.coverage.vitaminD, 0);
});

test('an empty day has no consumed nutrients and no data coverage', () => {
  const result = sumEntries([]);
  assert.equal(result.count, 0);
  for (const key of Object.keys(NUTRIENTS)) {
    assert.equal(result.totals[key], 0);
    assert.equal(result.coverage[key], 0);
  }
});

test('invalid grams and corrupted food values cannot enter a calculation', () => {
  for (const grams of [0, -1, 0.01, 5000.1, NaN, Infinity, '100', null]) {
    assert.throws(() => scaleFood(food, grams), /gramos/);
  }
  for (const kcal of [-2, Infinity, NaN, '300']) {
    assert.throws(() => scaleFood({ per100: { kcal } }, 100), /energía/);
  }
  assert.throws(() => scaleFood({}, 100), /100 g/);
  assert.throws(() => sumEntries([null]), /registro/);
});

test('Mifflin estimate and macro energy arithmetic are internally consistent', () => {
  const result = calculateTargets(profile);
  assert.equal(result.bmr, 1370.25);
  assert.equal(result.maintenance, 2124);
  assert.equal(result.kcal, 2124);
  assert.equal(result.adjustment, 0);
  assert.equal(result.steps, 4500);
  assert.equal(result.eligible, true);
  close(result.protein * 4 + result.carbs * 4 + result.fat * 9, result.kcal);
  close(result.protein * 4 / result.kcal, 0.2);
  close(result.carbs * 4 / result.kcal, 0.5);
  close(result.fat * 9 / result.kcal, 0.3);
  assert.equal(calculateTargets({ ...profile, sex: 'male' }).bmr, 1536.25);
});

test('deficit and surplus apply bounded adjustments to the same maintenance estimate', () => {
  const deficit = calculateTargets({ ...profile, goal: 'deficit' });
  const surplus = calculateTargets({ ...profile, goal: 'surplus' });
  assert.equal(deficit.kcal, 1912);
  assert.equal(deficit.adjustment, -212);
  assert.equal(surplus.kcal, 2230);
  assert.equal(surplus.adjustment, 106);
  const high = { ...profile, sex: 'male', weight: 140, height: 190, activity: 1.9 };
  assert.equal(calculateTargets({ ...high, goal: 'deficit' }).adjustment, -300);
  assert.equal(calculateTargets({ ...high, goal: 'surplus' }).adjustment, 200);
});

test('special conditions disable all automated nutrition and movement goals', () => {
  const result = calculateTargets({ ...profile, specialCondition: true });
  assert.equal(result.eligible, false);
  assert.match(result.reason, /embarazo/);
  for (const key of ['bmr', 'maintenance', 'kcal', 'protein', 'carbs', 'fat', 'steps', 'adjustment']) {
    assert.equal(result[key], null);
  }
  assert.ok(Object.values(result.micros).every(value => value === null));
});

test('low BMI blocks deficit; a below-floor target is unavailable and is never clamped', () => {
  const lowBMI = calculateTargets({ ...profile, height: 180, weight: 50, goal: 'deficit' });
  assert.equal(lowBMI.eligible, false);
  assert.match(lowBMI.reason, /IMC/);
  assert.equal(lowBMI.kcal, null);
  const lowEstimate = calculateTargets({ ...profile, age: 70, height: 150, weight: 45, activity: 1.2, goal: 'deficit' });
  assert.equal(lowEstimate.eligible, false);
  assert.match(lowEstimate.reason, /1200/);
  assert.equal(lowEstimate.kcal, null);
  assert.notEqual(lowEstimate.maintenance, 1200);
});

test('profile ranges reject impossible inputs and exclude unsupported ages', () => {
  for (const [field, value] of [
    ['age', 17], ['age', 80], ['age', 30.5], ['age', NaN],
    ['height', 119], ['height', 231], ['weight', 29], ['weight', 351],
    ['activity', 1.19], ['activity', 1.91], ['baselineSteps', -1],
    ['baselineSteps', 20001], ['baselineSteps', 0.2], ['sex', 'other'],
    ['goal', 'rapid-loss'], ['specialCondition', 'false'],
  ]) assert.throws(() => calculateTargets({ ...profile, [field]: value }), Error, `${field}=${value}`);
});

test('step suggestion progresses gently and does not alter energy targets', () => {
  const kcal = calculateTargets(profile).kcal;
  for (const [baselineSteps, expected] of [[0, 500], [4000, 4500], [6800, 7000], [7000, 7000], [10000, 10000], [20000, 20000]]) {
    const result = calculateTargets({ ...profile, baselineSteps });
    assert.equal(result.steps, expected);
    assert.equal(result.kcal, kcal);
  }
});

test('micronutrient references follow age boundaries, sex and measurement units', () => {
  const micros = (age, sex = 'female') => calculateTargets({ ...profile, age, sex, activity: 1.9 }).micros;
  assert.equal(micros(18).calcium, 1300);
  assert.equal(micros(18).iron, 15);
  assert.equal(micros(18).potassium, 2300);
  assert.equal(micros(18).zinc, 9);
  assert.equal(micros(18).fiber, 26);
  assert.equal(micros(19).calcium, 1000);
  assert.equal(micros(19).iron, 18);
  assert.equal(micros(30).magnesium, 310);
  assert.equal(micros(31).magnesium, 320);
  assert.equal(micros(50).iron, 18);
  assert.equal(micros(51).iron, 8);
  assert.equal(micros(51).calcium, 1200);
  assert.equal(micros(70, 'male').calcium, 1000);
  assert.equal(micros(71, 'male').calcium, 1200);
  assert.equal(micros(70).vitaminD, 15);
  assert.equal(micros(71).vitaminD, 20);
  assert.equal(micros(30).sodium, 2000);
  assert.equal(MICRO_REFERENCES.sodium.type, 'limit');
  assert.equal(NUTRIENTS.vitaminA.unit, 'µg RAE');
  assert.equal(NUTRIENTS.folate.unit, 'µg DFE');
});

test('calendar date uses local midnight even when UTC is a different day', () => {
  assert.equal(localDate(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
  assert.equal(localDate(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  assert.throws(() => localDate(new Date('invalid')), /fecha/);
  const moduleURL = new URL('../dist/nutrition.js', import.meta.url).href;
  const script = `import {localDate} from ${JSON.stringify(moduleURL)}; process.stdout.write(localDate(new Date('2026-10-20T02:00:00Z')));`;
  const date = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/Mexico_City' }, encoding: 'utf8',
  });
  assert.equal(date, '2026-10-19');
});
