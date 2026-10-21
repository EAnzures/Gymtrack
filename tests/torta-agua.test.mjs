import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../dist/foods.js';
import { scaleFood } from '../dist/nutrition.js';

test('torta de agua keeps all crumb and clearly discloses its unfilled bread approximation', () => {
  const torta = FOODS.find(food => food.id === 'torta-agua');
  const reference = FOODS.find(food => food.id === 'pan-frances');
  assert.ok(torta);
  assert.match(torta.name, /sin relleno.*con migajón/);
  assert.match(torta.preparation, /corteza y todo el migajón/);
  assert.match(torta.preparation, /Estimación con pan blanco tipo francés USDA/);
  assert.equal(torta.source.code, '18029');
  assert.equal(torta.source.description, 'Bread, french or vienna (includes sourdough)');
  assert.deepEqual(torta.per100, reference.per100, 'Keep the entire proxy composition, not invented regional values');
  assert.equal(torta.equivalentGrams, null, 'Do not assume a piece weight or remove crumb weight');
  // 80 g of complete bread: official USDA 18029 values scaled by 0.8.
  const portion = scaleFood(torta, 80);
  for (const [nutrient, expected] of Object.entries({
    kcal: 217.6, protein: 8.6, carbs: 41.504, fat: 1.936,
    sodium: 481.6, calcium: 41.6, iron: 3.128, folate: 136,
  })) assert.ok(Math.abs(portion[nutrient] - expected) < 1e-9, nutrient);
});
