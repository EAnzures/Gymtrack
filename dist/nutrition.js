/**
 * Pure nutrition calculations. Food values are per 100 g of edible portion.
 * Unknown nutrients remain null; they are never silently treated as zero.
 * Reference methodology and limitations: docs/TARGETS.md.
 */
export const NUTRIENTS = Object.freeze(Object.fromEntries(Object.entries({
  kcal: { label: 'Energía', unit: 'kcal' },
  protein: { label: 'Proteína', unit: 'g' },
  carbs: { label: 'Carbohidratos', unit: 'g' },
  fat: { label: 'Grasas', unit: 'g' },
  fiber: { label: 'Fibra', unit: 'g' },
  calcium: { label: 'Calcio', unit: 'mg' },
  iron: { label: 'Hierro', unit: 'mg' },
  magnesium: { label: 'Magnesio', unit: 'mg' },
  potassium: { label: 'Potasio', unit: 'mg' },
  sodium: { label: 'Sodio', unit: 'mg' },
  zinc: { label: 'Zinc', unit: 'mg' },
  vitaminA: { label: 'Vitamina A', unit: 'µg RAE' },
  vitaminC: { label: 'Vitamina C', unit: 'mg' },
  vitaminD: { label: 'Vitamina D', unit: 'µg' },
  vitaminB12: { label: 'Vitamina B12', unit: 'µg' },
  folate: { label: 'Folato', unit: 'µg DFE' },
}).map(([key, value]) => [key, Object.freeze(value)])));

const ODS = 'https://ods.od.nih.gov/factsheets/';
export const MICRO_REFERENCES = Object.freeze({
  fiber: { type: 'reference', basis: 'AI', url: 'https://www.ncbi.nlm.nih.gov/books/NBK208874/' },
  calcium: { type: 'reference', basis: 'RDA', url: `${ODS}Calcium-HealthProfessional/` },
  iron: { type: 'reference', basis: 'RDA', url: `${ODS}Iron-HealthProfessional/` },
  magnesium: { type: 'reference', basis: 'RDA', url: `${ODS}Magnesium-HealthProfessional/` },
  potassium: { type: 'reference', basis: 'AI', url: `${ODS}potassium-healthprofessional/` },
  sodium: { type: 'limit', basis: 'OMS: menos de 2,000 mg/día', url: 'https://www.who.int/news-room/fact-sheets/detail/sodium-reduction' },
  zinc: { type: 'reference', basis: 'RDA', url: `${ODS}Zinc-HealthProfessional/` },
  vitaminA: { type: 'reference', basis: 'RDA', url: `${ODS}VitaminA-HealthProfessional/` },
  vitaminC: { type: 'reference', basis: 'RDA', url: `${ODS}VitaminC-HealthProfessional/` },
  vitaminD: { type: 'reference', basis: 'RDA', url: `${ODS}VitaminD-HealthProfessional/` },
  vitaminB12: { type: 'reference', basis: 'RDA', url: `${ODS}VitaminB12-HealthProfessional/` },
  folate: { type: 'reference', basis: 'RDA', url: `${ODS}Folate-HealthProfessional/` },
});

function numberInRange(value, min, max, label, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)
      || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} debe ser ${integer ? 'un número entero' : 'un número'} entre ${min} y ${max}.`);
  }
  return value;
}

/** Calendar date in the device's timezone, never UTC slicing. */
export function localDate(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('La fecha no es válida.');
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function micronutrientReferences(sex, age) {
  const male = sex === 'male';
  const eighteen = age === 18;
  return {
    fiber: male ? (age <= 50 ? 38 : 30) : (eighteen ? 26 : age <= 50 ? 25 : 21),
    calcium: eighteen ? 1300 : (age >= 71 || (!male && age >= 51) ? 1200 : 1000),
    iron: eighteen ? (male ? 11 : 15) : (male || age >= 51 ? 8 : 18),
    magnesium: eighteen ? (male ? 410 : 360) : (male ? (age <= 30 ? 400 : 420) : (age <= 30 ? 310 : 320)),
    potassium: eighteen ? (male ? 3000 : 2300) : (male ? 3400 : 2600),
    sodium: 2000,
    zinc: male ? 11 : (eighteen ? 9 : 8),
    vitaminA: male ? 900 : 700,
    vitaminC: eighteen ? (male ? 75 : 65) : (male ? 90 : 75),
    vitaminD: age >= 71 ? 20 : 15,
    vitaminB12: 2.4,
    folate: 400,
  };
}

/**
 * Estimates for generally healthy adults, not a diagnosis or prescription.
 * bmr is the unrounded Mifflin–St Jeor resting expenditure.
 * maintenance, kcal and adjustment are integer kcal; macros retain precision.
 * Ineligible profiles return null goals and an actionable Spanish reason.
 */
export function calculateTargets(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Completa tu perfil para calcular una referencia.');
  }
  const { sex, goal } = profile;
  if (!['male', 'female'].includes(sex)) throw new Error('Selecciona el sexo usado en la fórmula.');
  if (!['maintain', 'deficit', 'surplus'].includes(goal)) throw new Error('Selecciona mantenimiento, déficit o superávit.');
  const age = numberInRange(profile.age, 18, 79, 'La edad', true);
  const height = numberInRange(profile.height, 120, 230, 'La estatura en cm');
  const weight = numberInRange(profile.weight, 30, 350, 'El peso en kg');
  const activity = numberInRange(profile.activity, 1.2, 1.9, 'El factor de actividad');
  const baselineSteps = numberInRange(profile.baselineSteps, 0, 20000, 'Los pasos habituales', true);
  if (profile.specialCondition !== undefined && typeof profile.specialCondition !== 'boolean') {
    throw new Error('Indica si existe una condición que requiere atención profesional.');
  }

  const micros = micronutrientReferences(sex, age);
  const ineligible = (reason, bmr = null, maintenance = null) => ({
    bmr, maintenance, kcal: null, protein: null, carbs: null, fat: null,
    steps: null, adjustment: null, eligible: false, reason,
    micros: Object.fromEntries(Object.keys(micros).map(key => [key, null])),
  });
  if (profile.specialCondition) {
    return ineligible('Durante el embarazo, la lactancia o una condición médica, define tus objetivos con un profesional. Puedes seguir registrando tus alimentos.');
  }
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
  const maintenance = Math.round(bmr * activity);
  const bmi = weight / ((height / 100) ** 2);
  if (goal === 'deficit' && bmi < 18.5) {
    return ineligible('El déficit automático no está disponible con un IMC menor a 18.5. Revisa tu objetivo con un profesional; puedes seguir registrando tus alimentos.', bmr, maintenance);
  }
  const adjustment = goal === 'deficit' ? -Math.min(Math.round(maintenance * 0.1), 300)
    : goal === 'surplus' ? Math.min(Math.round(maintenance * 0.05), 200) : 0;
  const kcal = maintenance + adjustment;
  const floor = sex === 'male' ? 1500 : 1200;
  if (kcal < floor) {
    return ineligible(`El cálculo queda por debajo de ${floor} kcal, fuera del rango de esta calculadora. Un profesional puede definir una meta adecuada; puedes seguir registrando tus alimentos.`, bmr, maintenance);
  }
  return {
    bmr, maintenance, kcal,
    protein: kcal * 0.2 / 4,
    carbs: kcal * 0.5 / 4,
    fat: kcal * 0.3 / 9,
    steps: baselineSteps >= 7000 ? baselineSteps : Math.min(baselineSteps + 500, 7000),
    adjustment, eligible: true, reason: '', micros,
  };
}

/** Scale a food snapshot; grams refer to the preparation shown on that food. */
export function scaleFood(food, grams) {
  numberInRange(grams, 0.1, 5000, 'La cantidad en gramos');
  if (!food || typeof food !== 'object' || !food.per100 || typeof food.per100 !== 'object') {
    throw new Error('El alimento necesita información nutricional por 100 g.');
  }
  const result = {};
  for (const key of Object.keys(NUTRIENTS)) {
    const value = food.per100[key];
    if (value === null || value === undefined) result[key] = null;
    else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`El valor de ${NUTRIENTS[key].label.toLowerCase()} no es válido.`);
      }
      result[key] = value * grams / 100;
    }
  }
  return result;
}

/**
 * Sum known amounts without imputing unknown values.
 * coverage = fraction of entries with a known value, not a mass/energy fraction.
 * Empty day: zero totals and zero coverage. Nonempty all-unknown nutrient: null.
 */
export function sumEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('Los registros deben ser una lista de alimentos.');
  const totals = Object.fromEntries(Object.keys(NUTRIENTS).map(key => [key, 0]));
  const known = Object.fromEntries(Object.keys(NUTRIENTS).map(key => [key, 0]));
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('Hay un registro de alimento no válido.');
    const scaled = scaleFood(entry.food, entry.grams);
    for (const key of Object.keys(NUTRIENTS)) {
      if (scaled[key] !== null) {
        totals[key] += scaled[key];
        known[key]++;
      }
    }
  }
  const coverage = {};
  for (const key of Object.keys(NUTRIENTS)) {
    coverage[key] = entries.length ? known[key] / entries.length : 0;
    if (entries.length && known[key] === 0) totals[key] = null;
  }
  return { totals, coverage, count: entries.length };
}
