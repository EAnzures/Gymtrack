export const STORAGE_KEY = 'gymtrack.v1';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const NUTRIENTS = [
  'kcal', 'protein', 'carbs', 'fat', 'fiber', 'calcium', 'iron',
  'magnesium', 'potassium', 'sodium', 'zinc', 'vitaminA', 'vitaminC',
  'vitaminD', 'vitaminB12', 'folate',
];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const invalid = (message) => { throw new Error(`Respaldo no válido: ${message}.`); };

export function emptyState() {
  return { version: 1, profile: null, days: {}, customFoods: [], favorites: [] };
}

function record(value, field, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} debe ser un objeto`);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || (allowed && !allowed.includes(key))) invalid(`${field} contiene un campo desconocido`);
  }
  return value;
}

function string(value, field, max, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    invalid(`${field} debe ser texto de hasta ${max} caracteres`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) invalid(`${field} contiene caracteres de control`);
  return value;
}

function id(value, field) {
  string(value, field, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) || FORBIDDEN_KEYS.has(value)) invalid(`${field} no es un identificador permitido`);
  return value;
}

function number(value, field, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    invalid(`${field} debe estar entre ${min} y ${max}${integer ? ' y ser entero' : ''}`);
  }
  return value;
}

function list(value, field, max) {
  if (!Array.isArray(value) || value.length > max) invalid(`${field} debe ser una lista de hasta ${max} elementos`);
  return value;
}

function oneOf(value, field, options) {
  if (!options.includes(value)) invalid(`${field} no tiene un valor permitido`);
  return value;
}

function boolean(value, field) {
  if (typeof value !== 'boolean') invalid(`${field} debe ser verdadero o falso`);
  return value;
}

function validateProfile(value) {
  if (value === null) return null;
  record(value, 'perfil', ['name', 'sex', 'age', 'height', 'weight', 'activity', 'goal', 'baselineSteps', 'specialCondition']);
  return {
    name: string(value.name, 'nombre del perfil', 80, true),
    sex: oneOf(value.sex, 'sexo del perfil', ['male', 'female']),
    // Keep valid adults outside the calculator's supported range so the UI can
    // preserve their entries and explain why an automatic target is unavailable.
    age: number(value.age, 'edad', 1, 120, true),
    height: number(value.height, 'estatura', 50, 250),
    weight: number(value.weight, 'peso', 10, 500),
    activity: number(value.activity, 'factor de actividad', 1.2, 1.9),
    goal: oneOf(value.goal, 'objetivo', ['maintain', 'deficit', 'surplus']),
    baselineSteps: number(value.baselineSteps, 'pasos habituales', 0, 20000, true),
    specialCondition: boolean(value.specialCondition, 'condición especial'),
  };
}

function validateFood(value, field) {
  record(value, field, ['id', 'name', 'category', 'preparation', 'emoji', 'source', 'smaeGroup', 'equivalentGrams', 'equivalentSource', 'per100']);
  const source = record(value.source, `${field}: fuente`, ['name', 'url', 'code', 'description']);
  const url = string(source.url, `${field}: URL`, 2048, true);
  if (url && !/^https?:\/\//i.test(url)) invalid(`${field}: la fuente debe usar una URL http o https`);
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password || !parsed.hostname) invalid(`${field}: URL incorrecta`);
    } catch {
      invalid(`${field}: URL incorrecta`);
    }
  }
  const raw = record(value.per100, `${field}: nutrientes`, NUTRIENTS);
  const per100 = {};
  for (const nutrient of NUTRIENTS) {
    if (!own(raw, nutrient)) invalid(`${field}: falta el nutriente ${nutrient}`);
    const isMacro = ['kcal', 'protein', 'carbs', 'fat'].includes(nutrient);
    const max = nutrient === 'kcal' ? 1000 : ['protein', 'carbs', 'fat', 'fiber'].includes(nutrient) ? 100 : 1000000;
    per100[nutrient] = raw[nutrient] === null && !isMacro
      ? null
      : number(raw[nutrient], `${field}: ${nutrient}`, 0, max);
  }
  const clean = {
    id: id(value.id, `${field}: identificador`),
    name: string(value.name, `${field}: nombre`, 160),
    category: string(value.category, `${field}: categoría`, 80),
    preparation: string(value.preparation, `${field}: preparación`, 240, true),
    emoji: string(value.emoji, `${field}: símbolo`, 24, true),
    source: {
      name: string(source.name, `${field}: nombre de fuente`, 240),
      url,
      code: string(source.code, `${field}: código de fuente`, 120, true),
    },
    smaeGroup: value.smaeGroup === null ? null : string(value.smaeGroup, `${field}: grupo SMAE`, 160),
    equivalentGrams: value.equivalentGrams === null ? null : number(value.equivalentGrams, `${field}: gramos equivalentes`, 0.01, 10000),
    per100,
  };
  if (own(source, 'description')) clean.source.description = string(source.description, `${field}: descripción de fuente`, 500, true);
  if (own(value, 'equivalentSource')) {
    clean.equivalentSource = value.equivalentSource === null
      ? null
      : string(value.equivalentSource, `${field}: fuente del equivalente`, 2048);
    if (clean.equivalentSource && !/^https?:\/\//i.test(clean.equivalentSource)) invalid(`${field}: la fuente del equivalente debe usar una URL http o https`);
  }
  return clean;
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('hay una fecha incorrecta');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid('hay una fecha inexistente');
}

function validateDay(value, date) {
  record(value, `día ${date}`, ['meals', 'steps']);
  const mealIds = new Set();
  const entryIds = new Set();
  return {
    meals: list(value.meals, `comidas del ${date}`, 40).map((meal, mealIndex) => {
      const field = `comida ${mealIndex + 1} del ${date}`;
      record(meal, field, ['id', 'name', 'entries']);
      const mealId = id(meal.id, `${field}: identificador`);
      if (mealIds.has(mealId)) invalid(`${field}: identificador repetido`);
      mealIds.add(mealId);
      return {
        id: mealId,
        name: string(meal.name, `${field}: nombre`, 100),
        entries: list(meal.entries, `${field}: alimentos`, 100).map((entry, entryIndex) => {
          const entryField = `${field}, alimento ${entryIndex + 1}`;
          record(entry, entryField, ['id', 'food', 'grams']);
          const entryId = id(entry.id, `${entryField}: identificador`);
          if (entryIds.has(entryId)) invalid(`${entryField}: identificador repetido`);
          entryIds.add(entryId);
          return {
            id: entryId,
            food: validateFood(entry.food, entryField),
            grams: number(entry.grams, `${entryField}: gramos`, 0.1, 5000),
          };
        }),
      };
    }),
    steps: number(value.steps, `pasos del ${date}`, 0, 100000, true),
  };
}

export function parseBackup(text) {
  if (typeof text !== 'string') invalid('el archivo debe contener texto JSON');
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) invalid('el archivo supera el límite de 5 MB');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    invalid('el archivo no contiene JSON legible');
  }
  record(raw, 'contenido', ['version', 'profile', 'days', 'customFoods', 'favorites']);
  if (raw.version !== 1) invalid('la versión del respaldo no es compatible');
  record(raw.days, 'historial');
  const dates = Object.keys(raw.days);
  if (dates.length > 7300) invalid('el historial supera el límite de 7300 días');
  const days = {};
  for (const date of dates) {
    validateDate(date);
    days[date] = validateDay(raw.days[date], date);
  }
  const foodIds = new Set();
  const customFoods = list(raw.customFoods, 'alimentos personalizados', 1000).map((food, index) => {
    const clean = validateFood(food, `alimento personalizado ${index + 1}`);
    if (!clean.id.startsWith('custom-')) invalid('un alimento personalizado tiene un identificador incorrecto');
    if (foodIds.has(clean.id)) invalid('hay alimentos personalizados repetidos');
    foodIds.add(clean.id);
    return clean;
  });
  const favorites = list(raw.favorites, 'favoritos', 2000).map((favorite) => id(favorite, 'favorito'));
  if (new Set(favorites).size !== favorites.length) invalid('hay favoritos repetidos');
  if (favorites.some((favorite) => favorite.startsWith('custom-') && !foodIds.has(favorite))) invalid('un favorito personalizado no existe en el respaldo');
  return { version: 1, profile: validateProfile(raw.profile), days, customFoods, favorites };
}

export function exportBackup(state) {
  let serialized;
  try {
    serialized = JSON.stringify(state, null, 2);
  } catch {
    throw new Error('No se pudo preparar el respaldo. Revisa que los registros sean válidos.');
  }
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > MAX_BACKUP_BYTES) {
    throw new Error('El respaldo supera el límite de 5 MB. Exporta y conserva una copia de tus registros.');
  }
  return serialized;
}

export function loadState() {
  let raw;
  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error('El almacenamiento del dispositivo no está disponible. Permite los datos del sitio o utiliza una ventana normal del navegador.');
  }
  if (raw === null) return emptyState();
  try {
    return parseBackup(raw);
  } catch (error) {
    throw new Error(`No pudimos abrir los registros guardados. Conservamos los datos originales. ${error.message}`);
  }
}

export function saveState(state) {
  const serialized = exportBackup(state);
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014;
    throw new Error(quota
      ? 'No hay espacio suficiente para guardar. Exporta un respaldo antes de liberar espacio en este navegador.'
      : 'No se pudo guardar en este dispositivo. Permite los datos del sitio y vuelve a intentar; conserva un respaldo de tus registros.');
  }
}
