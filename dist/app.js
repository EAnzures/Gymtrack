import { FOODS, SMAE_GROUPS, CATALOG_METADATA } from './foods.js';
import { NUTRIENTS, MICRO_REFERENCES, calculateTargets, scaleFood, sumEntries, localDate } from './nutrition.js';
import { STORAGE_KEY, MAX_BACKUP_BYTES, emptyState, loadState, saveState, parseBackup, exportBackup } from './storage.js';

const paths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart:'<path d="M4 3v17h17M8 15v-4m5 4V7m5 8v-5"/>',
  leaf:'<path d="M20 4C9 2 3 7 5 15s17 7 15-11Z"/><path d="m4 21 11-12m-6 7-1-5m5 1 5 1"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  back:'<path d="m15 5-7 7 7 7"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  edit:'<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  bowl:'<path d="M3 10h18c0 6-4 9-9 9s-9-3-9-9ZM8 21h8M8 3v3m4-4v4m4-3v3"/>',
  moon:'<path d="M20 13a8.5 8.5 0 0 1-9-9 8.5 8.5 0 1 0 9 9Z"/>',
  steps:'<path d="M8 3c-3 0-4 5-3 8l4-1c2-3 2-7-1-7ZM6 14l4-1 1 5c0 3-4 3-4 0ZM17 6c-3 0-4 5-3 8l4-1c2-3 2-7-1-7Zm-2 11 4-1 1 4c0 3-4 3-4 0Z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('es-MX', {maximumFractionDigits: digits}).format(value);
const norm = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const clone = value => JSON.parse(JSON.stringify(value));
const percent = (value, target) => target > 0 ? Math.min(Math.max(value || 0, 0) / target * 100, 100) : 0;
const macroKeys = ['protein', 'carbs', 'fat'];
const microKeys = Object.keys(MICRO_REFERENCES);
const goals = {maintain:'Mantenimiento',deficit:'Déficit moderado',surplus:'Superávit moderado'};
const activityNames = {'1.2':'Poca actividad','1.375':'Actividad ligera','1.55':'Actividad moderada','1.725':'Actividad alta'};
let state, storageError = '';
try { state = loadState(); } catch(error) { state = emptyState(); storageError = error.message; }
let selectedDate = localDate(), view = 'diary', filter = 'Todos', search = '', selectedFood = null, mealForAdd = null, toastTimer;
let deferredInstall = null, pendingImport = null, swStatus = 'Comprobando disponibilidad sin conexión…';
const modal = $('#modal');
const day = () => state.days[selectedDate] || {meals:[], steps:0};
const entries = () => day().meals.flatMap(meal => meal.entries);
const catalog = () => [...state.customFoods, ...FOODS];
function target() {
  if (!state.profile) return null;
  try { return calculateTargets(state.profile); }
  catch (error) { return {eligible:false,reason:error.message,micros:{},kcal:null}; }
}
function ensureDay(next) { return next.days[selectedDate] ||= {meals:[],steps:0}; }
function persist(mutator, message = '', allowRecovery = false) {
  try {
    if (storageError && !allowRecovery) throw new Error('Primero recupera el almacenamiento desde «Cómo funciona». Los datos originales siguen guardados.');
    const next = clone(state);
    mutator(next);
    // Validate the same schema used on import before any write, including quotas.
    const valid = parseBackup(exportBackup(next));
    saveState(valid); state = valid; storageError = ''; render();
    if(message) toast(message);
    return true;
  } catch(error) { showError(error.message); return false; }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200); }
function showError(message) { const field = $('#form-error'); if(modal.open && field) { field.textContent=message; field.scrollIntoView({block:'nearest'}); } else toast(message); }
function dateTitle(value, short = false) { return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', short ? {day:'numeric',month:'short'} : {weekday:'long',day:'numeric',month:'long'}); }
function shiftDate(delta) { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate()+delta); selectedDate=localDate(d); render(); }
function button(action,label,ico = '',cls = '',extra = '') { return `<button type="button" class="button ${cls}" data-action="${action}" ${extra}>${ico?icon(ico):''}${label}</button>`; }
function iconButton(action,label,ico,extra='') { return `<button class="icon-button" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(ico)}</button>`; }
function modalOpen(title,subtitle,content) {
  modal.innerHTML=`<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${iconButton('close','Cerrar','close')}</div><div class="modal-content">${content}</div>`;
  if(!modal.open) modal.showModal();
}
function dateControl() { return `<div class="date-switch" aria-label="Día del registro">${iconButton('previous-day','Día anterior','back')}<input id="selected-date" type="date" aria-label="Fecha del registro" value="${selectedDate}" min="2000-01-01" max="2099-12-31">${iconButton('next-day','Día siguiente','chevron')}<button class="today-button" data-action="today">Hoy</button></div>`; }
function goalBanner(t) {
  if (storageError) return `<div class="error-message">${esc(storageError)} ${button('help','Recuperar datos','','secondary')}</div>`;
  if(!state.profile) return `<div class="setup-banner"><div><strong>Tu alimentación empieza contigo.</strong><p>Calcula una referencia de calorías y nutrientes para tu día.</p></div>${button('profile','Crear mi objetivo','target')}</div>`;
  if(!t?.eligible) return `<div class="setup-banner"><div><strong>Puedes seguir registrando tus comidas.</strong><p>${esc(t.reason)}</p></div>${button('profile','Ver perfil','','secondary')}</div>`;
  return '';
}
function render() {
  document.querySelectorAll('[data-view]').forEach(btn=>{ btn.classList.toggle('active',btn.dataset.view===view); btn.setAttribute('aria-current',btn.dataset.view===view?'page':'false'); });
  $('#view-title').textContent={diary:'Mi día',history:'Historial',foods:'Alimentos',goals:'Mi objetivo'}[view];
  $('.avatar').textContent=(state.profile?.name?.trim()?.[0] || 'T').toUpperCase();
  $('#main').innerHTML = {diary:renderDiary,history:renderHistory,foods:renderCatalog,goals:renderGoals}[view]();
}
function renderDiary() {
  const t=target(), total=sumEntries(entries()), n=total.totals, calories=n.kcal||0;
  const remaining=t?.eligible ? t.kcal-calories : null;
  const hasGoal=Boolean(t?.eligible);
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">NUTRICIÓN CON INTENCIÓN</div><h1>Pequeños hábitos.<br><em>Grandes cambios.</em></h1><p class="subtext">${state.profile?.name?`${esc(state.profile.name)}, `:''}conoce lo que comes y encuentra tu equilibrio.</p></div>${dateControl()}</section>
    ${goalBanner(t)}
    <div class="dashboard-grid"><div class="left-column">
      <section class="card calorie-card"><div class="card-header"><h2>Tu balance del día</h2><span class="pill">${selectedDate===localDate()?'HOY':esc(dateTitle(selectedDate,true).toUpperCase())}</span></div>
        <div class="summary-body"><div class="calorie-ring" style="--progress:${percent(calories,t?.kcal)}%"><div class="ring-center"><strong data-testid="total-kcal">${fmt(calories)}</strong><span>kcal consumidas</span><small>${hasGoal?`de ${fmt(t.kcal)} kcal`:'Tu día, en números'}</small></div></div>
        <div class="calorie-info"><div class="metric-line"><span>Tu objetivo${selectedDate!==localDate()?' actual':''}</span><strong>${hasGoal?`${fmt(t.kcal)} kcal`:'Por definir'}</strong></div><div class="metric-line"><span>Has consumido</span><strong>${fmt(calories)} kcal</strong></div><div class="metric-line"><span>${remaining===null?'Alimentos registrados':remaining>=0?'Por consumir':'Sobre la referencia'}</span><strong>${remaining===null?total.count:`${fmt(Math.abs(remaining))} kcal`}</strong></div></div></div>
        <div class="summary-foot">${icon(hasGoal&&remaining<=0?'check':'leaf')}<span>${!hasGoal?'Registra a tu ritmo. Define tu objetivo cuando quieras.':remaining>0?'Cada comida suma. Tus registros te muestran cómo vas.':'Has alcanzado tu referencia de energía para este día.'}</span></div>
      </section>
      <section class="macro-grid" aria-label="Macronutrientes">${macroKeys.map((key,i)=>`<div class="card macro-card" style="--accent:${['#88a8b9','#b0bf81','#dfa67b'][i]}"><div class="macro-label"><i class="dot"></i>${NUTRIENTS[key].label}</div><div class="macro-value">${fmt(n[key],1)}<small> / ${hasGoal?fmt(t[key]):'—'} g</small></div><div class="progress"><span style="width:${percent(n[key],t?.[key])}%"></span></div><p class="macro-rest">${!hasGoal?'Objetivo por definir':n[key]<=t[key]?`Te faltan ${fmt(t[key]-n[key],1)} g`:`${fmt(n[key]-t[key],1)} g sobre la referencia`}</p></div>`).join('')}</section>
      <section><div class="section-header"><h2>Tus comidas <span class="count">${day().meals.length}</span></h2>${button('new-meal','Nueva comida','plus','text')}</div>
        ${day().meals.length?day().meals.map(renderMeal).join(''):`<div class="empty-state"><div class="empty-symbol">◌</div><h3>¿Qué comiste hoy?</h3><p>Crea tu primera comida y añade cada alimento con su cantidad en gramos.</p>${button('new-meal','Registrar mi primera comida','plus')}<br>${button('example','Probar tu comida de ejemplo','','text')}</div>`}
      </section>
    </div><aside class="right-column">
      <section class="card goals-card"><div class="card-header"><h2>${icon('target')} Tu objetivo</h2><span class="pill">${hasGoal?'DIARIO':'PERSONAL'}</span></div><div class="goal-number">${hasGoal?fmt(t.kcal):'A tu medida'}${hasGoal?'<span>kcal / día</span>':''}</div><p class="goal-description">${hasGoal?`${goals[state.profile.goal]} · ${t.adjustment===0?'equilibra tu energía':`${t.adjustment>0?'+':''}${fmt(t.adjustment)} kcal de ajuste`}`:'Un punto de partida para entender lo que tu cuerpo necesita.'}</p><div class="goal-bottom"><span>${hasGoal?'Estimación, no una cifra exacta':'Comienza con tus datos'}</span><button data-action="profile">${hasGoal?'Ajustar':'Configurar'} ${icon('chevron')}</button></div></section>
      <section class="card micro-card"><div class="card-header"><h2>${icon('leaf')} Más allá de las calorías</h2></div><p>Fibra y micronutrientes · cantidades aproximadas</p><div class="micro-rows">${['fiber','calcium','iron','potassium','vitaminC'].map(key=>renderMicroRow(key,total,t)).join('')}</div><button class="more-link" data-action="micros">Ver los 12 nutrientes ${icon('chevron')}</button></section>
      <section class="card steps-card"><div class="steps-heading"><h2>Un paso más</h2><span class="steps-symbol">${icon('steps')}</span></div><div class="step-value">${fmt(day().steps)} <span>/ ${hasGoal?fmt(t.steps):'—'} pasos</span></div><div class="progress"><span style="width:${percent(day().steps,t?.steps)}%"></span></div><p>${hasGoal?`Meta gradual: ${fmt(t.steps)} pasos. Muévete según tus posibilidades.`:'Configura tu actividad habitual para obtener una meta gradual.'}</p>${button('steps','Registrar pasos','','secondary')}<p>Registro manual · sin ajuste de calorías.</p></section>
      <p class="small-note">${icon('info')}Los valores dependen del alimento y su preparación. Pesa la porción comestible en el estado indicado.</p>
    </aside></div>`;
}
function renderMicroRow(key,total,t) {
  const value=total.totals[key], reference=t?.micros?.[key], partial=total.count>0 && total.coverage[key]<1, unit=NUTRIENTS[key].unit;
  return `<div class="micro-row"><div class="micro-line"><span>${NUTRIENTS[key].label}</span><strong>${fmt(value, key==='iron'?1:0)}${partial&&value!==null?'+':''} ${unit}</strong></div><div class="progress" style="--accent:#afbf96"><span style="width:${percent(value,reference)}%"></span></div><small>${partial?'Datos incompletos en tus alimentos':reference?`Referencia: ${fmt(reference)} ${unit}`:'Referencia pendiente de perfil'}</small></div>`;
}
function renderMeal(meal,index) {
  const totals=sumEntries(meal.entries).totals;
  return `<article class="card meal"><div class="meal-header"><div class="meal-identity"><span class="meal-icon">${icon(['sun','bowl','moon'][index%3])}</span><div><h3>${esc(meal.name)}</h3><div class="meal-meta"><strong>${fmt(totals.kcal)} kcal</strong><span>P ${fmt(totals.protein,1)} g</span><span>C ${fmt(totals.carbs,1)} g</span><span>G ${fmt(totals.fat,1)} g</span></div></div></div><div class="meal-actions">${iconButton('rename-meal',`Renombrar ${meal.name}`,'edit',`data-meal="${meal.id}"`)}${iconButton('delete-meal',`Eliminar ${meal.name}`,'trash',`data-meal="${meal.id}"`)}</div></div>
      ${meal.entries.length?meal.entries.map(entry=>`<div class="entry"><span class="food-emoji" aria-hidden="true">${esc(entry.food.emoji||'🥣')}</span><div class="entry-text"><div class="entry-name">${esc(entry.food.name)}</div><div class="entry-detail">${fmt(entry.grams,1)} g · ${esc(entry.food.preparation)}</div></div><span class="entry-energy">${fmt(scaleFood(entry.food,entry.grams).kcal)} <small>kcal</small></span>${iconButton('edit-entry',`Editar ${entry.food.name}`,'edit',`data-meal="${meal.id}" data-entry="${entry.id}"`)}${iconButton('delete-entry',`Quitar ${entry.food.name}`,'close',`data-meal="${meal.id}" data-entry="${entry.id}"`)}</div>`).join(''):'<p class="empty-meal">Lista para tu primer alimento.</p>'}
      <button class="meal-add" data-action="add-food" data-meal="${meal.id}">${icon('plus')} Añadir alimento</button></article>`;
}
function renderHistory() {
  const dates=Array.from({length:7},(_,i)=>{const date=new Date(`${selectedDate}T12:00:00`);date.setDate(date.getDate()-6+i);return localDate(date);});
  const values=dates.map(date=>({date,...sumEntries((state.days[date]?.meals||[]).flatMap(m=>m.entries))}));
  const recorded=values.filter(v=>v.count>0), average=recorded.length?recorded.reduce((a,v)=>a+v.totals.kcal,0)/recorded.length:0, max=Math.max(...values.map(v=>v.totals.kcal||0),1);
  const allDates=Object.keys(state.days).sort().reverse();
  return `<section class="hero"><div><div class="eyebrow">TU CONSTANCIA CUENTA</div><h1>Cada día tiene <em>su historia.</em></h1><p class="subtext">Observa tus registros, sin buscar días perfectos.</p></div>${dateControl()}</section>
    <div class="history-summary"><div class="card"><p class="stat-label">Días con alimentos · últimos 7</p><p class="stat-value">${recorded.length}<small> / 7 días</small></p></div><div class="card"><p class="stat-label">Promedio en días registrados</p><p class="stat-value">${fmt(average)} <small>kcal</small></p></div><div class="card"><p class="stat-label">Alimentos · últimos 7 días</p><p class="stat-value">${values.reduce((a,v)=>a+v.count,0)}<small> registros</small></p></div></div>
    <section class="card"><div class="card-header"><h2>Tu energía en la semana</h2><span class="pill">kcal consumidas</span></div><div class="chart" role="group" aria-label="Calorías registradas durante siete días">${values.map(v=>`<div class="chart-column"><span class="chart-number">${v.count?fmt(v.totals.kcal):'—'}</span><button class="chart-bar" style="height:${Math.max(2,(v.totals.kcal||0)/max*150)}px" data-action="open-day" data-date="${v.date}" aria-label="${esc(dateTitle(v.date))}: ${v.count?fmt(v.totals.kcal)+' kcal':'sin registros'}"></button><span class="chart-label">${esc(dateTitle(v.date,true))}</span></div>`).join('')}</div><p class="field-hint" style="margin-top:20px">Un día sin registro no significa que hayas consumido cero calorías.</p></section>
    <section class="history-days"><div class="section-header"><h2>Todos tus registros</h2>${button('export','Exportar respaldo','download','text')}</div><div class="card">${allDates.length?allDates.map(date=>{const d=state.days[date],s=sumEntries(d.meals.flatMap(m=>m.entries));return `<button class="history-day" data-action="open-day" data-date="${date}"><strong>${esc(dateTitle(date))}<span class="field-hint"> · ${date.slice(0,4)}</span></strong><span>${s.count?fmt(s.totals.kcal)+' kcal':'Sin alimentos'} · ${fmt(d.steps)} pasos</span>${icon('chevron')}</button>`;}).join(''):'<p class="subtext">Tu historial aparecerá cuando registres tu primera comida.</p>'}</div></section>`;
}
function filteredFoods() {
  const words=norm(search).split(/\s+/).filter(Boolean);
  return catalog().filter(food=>(filter==='Todos'||filter==='Favoritos'&&state.favorites.includes(food.id)||food.category===filter)&&words.every(word=>norm(`${food.name} ${food.category} ${food.preparation}`).includes(word)));
}
function chips() { return `<div class="filter-chips" aria-label="Categorías">${['Todos','Favoritos',...new Set(catalog().map(f=>f.category))].map(c=>`<button class="filter-chip ${filter===c?'active':''}" data-action="filter" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>`; }
function renderCatalog() {
  return `<section class="hero"><div><div class="eyebrow">ALIMENTOS QUE CONOCES</div><h1>De tu mesa <em>a tu registro.</em></h1><p class="subtext">${FOODS.length} alimentos de uso común en México. Consulta su preparación y sus valores por 100 g.</p></div></section>
    <div class="catalog-toolbar"><div class="search-wrap">${icon('search')}<input type="search" id="catalog-search" placeholder="Busca tortilla, frijol, aguacate…" aria-label="Buscar en el catálogo" value="${esc(search)}"></div>${button('custom-food','Crear alimento','plus','secondary')}</div><div id="catalog-chips">${chips()}</div><div id="catalog-results">${catalogResults()}</div><div class="info-box">Composición individual: USDA SR Legacy. Los grupos SMAE son orientativos; no sustituyen una tabla oficial de equivalencias. ${button('sources','Consultar fuentes','','text')}</div>`;
}
function favoriteButton(food) { return `<button class="favorite ${state.favorites.includes(food.id)?'active':''}" data-action="favorite" data-food="${food.id}" aria-label="${state.favorites.includes(food.id)?'Quitar de':'Añadir a'} favoritos: ${esc(food.name)}" aria-pressed="${state.favorites.includes(food.id)}">${state.favorites.includes(food.id)?'★':'☆'}</button>`; }
function catalogResults() {
  const foods=filteredFoods();
  return foods.length?`<div class="catalog-grid">${foods.map(food=>`<article class="card catalog-food"><div class="catalog-top"><span class="food-emoji" aria-hidden="true">${esc(food.emoji)}</span>${favoriteButton(food)}</div><h3>${esc(food.name)}</h3><p>${esc(food.preparation)} · ${fmt(food.per100.kcal)} kcal / 100 g</p><div class="catalog-macros"><span>P ${fmt(food.per100.protein,1)} g</span><span>C ${fmt(food.per100.carbs,1)} g</span><span>G ${fmt(food.per100.fat,1)} g</span></div><div class="catalog-actions">${button('food-detail','Ver ficha','','secondary',`data-food="${food.id}"`)}${button('choose-food','Añadir','plus','',`data-food="${food.id}"`)}</div></article>`).join('')}</div>`:'<div class="empty-state" style="margin-top:20px"><h3>No encontramos ese alimento.</h3><p>Prueba otro nombre o crea uno con los datos de su etiqueta por 100 g.</p></div>';
}
function renderGoals() {
  const t=target(), p=state.profile;
  return `<section class="hero"><div><div class="eyebrow">UN PUNTO DE PARTIDA PERSONAL</div><h1>Tu objetivo. <em>Tu ritmo.</em></h1><p class="subtext">Una estimación que puedes revisar a medida que cambian tus hábitos.</p></div>${button('profile',p?'Editar mi perfil':'Crear mi perfil','edit')}</section>${goalBanner(t)}
    ${p?`<div class="goal-grid"><section class="card"><div class="card-header"><h2>${esc(goals[p.goal])}</h2><span class="pill">REFERENCIA ACTUAL</span></div><p class="goal-summary-big">${fmt(t.kcal)} <small>kcal / día</small></p><p class="subtext">${t.eligible?'Una distribución inicial de 20% proteína, 50% carbohidratos y 30% grasa.':'Los objetivos automáticos no están disponibles para este perfil.'}</p><div class="goal-details">${macroKeys.map(key=>`<div><dt>${NUTRIENTS[key].label}</dt><dd>${fmt(t[key])} g</dd></div>`).join('')}<div><dt>Meta gradual de pasos</dt><dd>${fmt(t.steps)}</dd></div></div><div class="goal-flow"><span>Reposo estimado<strong>${fmt(t.bmr)} kcal</strong></span>${icon('chevron')}<span>Mantenimiento<strong>${fmt(t.maintenance)} kcal</strong></span>${icon('chevron')}<span>Ajuste<strong>${t.adjustment>0?'+':''}${fmt(t.adjustment)} kcal</strong></span></div><p class="field-hint" style="margin-top:14px">Mifflin–St Jeor × actividad aproximada. El objetivo actual también se muestra al consultar días anteriores.</p></section><section class="card"><h2>Tu perfil</h2><dl class="goal-details"><div><dt>Nombre</dt><dd>${esc(p.name||'Sin nombre')}</dd></div><div><dt>Edad</dt><dd>${p.age} años</dd></div><div><dt>Peso</dt><dd>${fmt(p.weight,1)} kg</dd></div><div><dt>Estatura</dt><dd>${fmt(p.height)} cm</dd></div></dl><p class="subtext">${esc(activityNames[p.activity]||'Actividad personalizada')} · factor ${p.activity}</p><p class="subtext">${fmt(p.baselineSteps)} pasos habituales por día</p><div class="info-box">El mantenimiento real cambia entre personas. Revisa tendencias durante varias semanas y ajusta con un profesional si lo necesitas.</div>${button('sources','Cómo calculamos las referencias','','text')}</section></div>`:''}
    <section class="card" style="margin-top:24px"><h2>Tus datos, contigo</h2><p class="subtext">Los registros se guardan en este navegador. Un respaldo te permite recuperarlos o llevarlos a otro dispositivo.</p><div class="backup-actions">${button('export','Exportar respaldo','download','secondary')}${button('import','Importar respaldo','','secondary')}${button('help','Instalar en iPhone','','soft')}</div><p class="field-hint">No hay cuenta ni sincronización automática. Borrar los datos del navegador elimina los registros locales.</p></section>`;
}
function openProfile() {
  const p=state.profile||{name:'',sex:'',age:'',weight:'',height:'',activity:1.2,goal:'maintain',baselineSteps:3000,specialCondition:false};
  modalOpen('Construyamos tu objetivo','Completa tus datos para estimar una referencia diaria.',`<form id="profile-form"><div class="form-grid"><label class="full">¿Cómo te llamas? <span class="field-hint">(opcional)</span><input name="name" maxlength="80" autocomplete="given-name" value="${esc(p.name)}" placeholder="Tu nombre"></label><label>Edad<input name="age" type="number" min="18" max="79" step="1" inputmode="numeric" required value="${p.age}" placeholder="Años"></label><label>Sexo usado en la fórmula<select name="sex" required><option value="" disabled ${!p.sex?'selected':''}>Selecciona</option><option value="female" ${p.sex==='female'?'selected':''}>Femenino</option><option value="male" ${p.sex==='male'?'selected':''}>Masculino</option></select></label><label>Peso (kg)<input name="weight" type="number" min="30" max="350" step="0.1" inputmode="decimal" required value="${p.weight}" placeholder="Ej. 70"></label><label>Estatura (cm)<input name="height" type="number" min="120" max="230" step="0.1" inputmode="decimal" required value="${p.height}" placeholder="Ej. 170"></label></div><p class="field-hint">Calculadora para adultos de 18 a 79 años. El sexo se usa en la ecuación y en las referencias nutricionales.</p>
      <h3 class="form-section-title">Lo que quieres lograr</h3><div class="form-grid"><label class="full">Objetivo<select name="goal">${Object.entries(goals).map(([value,label])=>`<option value="${value}" ${p.goal===value?'selected':''}>${label}${value==='deficit'?' · −10%, hasta 300 kcal':value==='surplus'?' · +5%, hasta 200 kcal':''}</option>`).join('')}</select></label><label class="full">Actividad total habitual<select name="activity">${Object.entries(activityNames).map(([value,label])=>`<option value="${value}" ${Number(p.activity)===Number(value)?'selected':''}>${label}${value==='1.2'?' · mayormente sentado':value==='1.375'?' · ejercicio 1–3 días/semana':value==='1.55'?' · ejercicio 3–5 días/semana':' · ejercicio intenso 6–7 días/semana'}</option>`).join('')}</select><p class="field-hint">Considera también tu trabajo y caminatas. Los pasos no vuelven a sumar calorías.</p></label><label class="full">¿Cuántos pasos haces habitualmente al día?<input name="baselineSteps" type="number" min="0" max="20000" step="1" inputmode="numeric" required value="${p.baselineSteps}"><p class="field-hint">Si no lo sabes, conserva 3,000 como punto de partida y ajústalo después. La primera meta aumenta 500, hasta llegar gradualmente a 7,000.</p></label><label class="full checkbox-label"><input name="specialCondition" type="checkbox" ${p.specialCondition?'checked':''}><span>Estoy en embarazo, lactancia o tengo una condición que requiere atención nutricional individual.</span></label></div><div class="info-box">Las cantidades son estimaciones. En situaciones especiales podrás registrar alimentos, con objetivos definidos por un profesional.</div><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('close','Cancelar','','secondary')}<button type="submit" class="button">Guardar mi objetivo ${icon('check')}</button></div></form>`);
}
function openMeal(id=null) {
  const meal=day().meals.find(m=>m.id===id);
  modalOpen(meal?'Nombre de la comida':'Una nueva comida','Organiza tus alimentos como te funcione mejor.',`<form id="meal-form" data-meal="${id||''}"><label>Nombre<input name="name" required maxlength="100" value="${esc(meal?.name||`Comida ${day().meals.length+1}`)}" placeholder="Comida 1, desayuno, colación…"></label><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('close','Cancelar','','secondary')}<button type="submit" class="button">${meal?'Guardar nombre':'Crear comida'}</button></div></form>`);
  modal.querySelector('input').select();
}
function openFoodSearch(mealId=null) {
  selectedFood=null;mealForAdd=mealId;filter='Todos';search='';
  modalOpen('Añadir un alimento',`${esc(day().meals.find(m=>m.id===mealId)?.name||'Elige un alimento para tu día')} · ${esc(dateTitle(selectedDate,true))}`,`<div class="search-wrap">${icon('search')}<input type="search" id="food-search" placeholder="Tortilla, aguacate, salmón…" aria-label="Buscar alimento" autocomplete="off"></div><div id="food-chips">${chips()}</div><div id="food-results" class="food-results">${foodSearchResults()}</div><div class="modal-actions">${button('custom-food','No está aquí: crear alimento','plus','secondary')}</div>`);
}
function foodSearchResults() {
  const foods=filteredFoods();
  return foods.length?foods.map(food=>`<div class="food-result"><button class="food-result-select" data-action="choose-food" data-food="${food.id}"><span class="food-emoji" aria-hidden="true">${esc(food.emoji)}</span><span class="food-result-text"><span class="food-result-name">${esc(food.name)}</span><span class="food-result-detail" style="display:block">${esc(food.preparation)} · ${fmt(food.per100.kcal)} kcal / 100 g</span></span>${icon('plus')}</button>${favoriteButton(food)}</div>`).join(''):'<p class="subtext" style="padding:20px 0">Sin resultados. Prueba otro nombre o crea tu alimento con su etiqueta.</p>';
}
function openPortion(food) {
  selectedFood=food;
  modalOpen('¿Cuánto comiste?','Pesa la porción comestible con la preparación indicada.',`<form id="portion-form"><div class="selected-food"><span class="food-emoji" aria-hidden="true">${esc(food.emoji)}</span><div><h3>${esc(food.name)}</h3><p>${esc(food.preparation)}</p></div></div><div class="form-grid"><label>Cantidad en gramos<input name="grams" id="portion-grams" type="number" value="100" min="0.1" max="5000" step="0.1" inputmode="decimal" required></label><label>Guardar en<select name="meal" required>${day().meals.map(m=>`<option value="${m.id}" ${m.id===mealForAdd?'selected':''}>${esc(m.name)}</option>`).join('')}<option value="new" ${!day().meals.length?'selected':''}>+ Nueva comida</option></select></label></div><div id="portion-preview">${portionPreview(food,100)}</div><p class="source-line">${sourceText(food)} ${button('food-detail','Ver ficha nutricional','','text',`data-food="${food.id}"`)}</p><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('back-search','Buscar otro','','secondary')}<button type="submit" class="button">${icon('plus')} Añadir a mi comida</button></div></form>`);
  $('#portion-grams').select();
}
function portionPreview(food,grams) {
  let values; try{values=scaleFood(food,grams);}catch{return '<p class="field-hint">Escribe una cantidad de 0.1 a 5,000 gramos.</p>';}
  return `<div class="preview-values">${['kcal',...macroKeys].map(key=>`<div><strong>${fmt(values[key],key==='kcal'?0:1)}</strong><span>${key==='kcal'?'kcal':`${NUTRIENTS[key].label} · g`}</span></div>`).join('')}</div>`;
}
function sourceText(food) { return `${food.source.url?`<a href="${esc(food.source.url)}" target="_blank" rel="noopener noreferrer">${esc(food.source.name)}</a>`:esc(food.source.name)}${food.source.code&&food.source.code!=='custom'?` · código ${esc(food.source.code)}`:''}`; }
function openFoodDetail(food) {
  const average=SMAE_GROUPS[food.smaeGroup];
  modalOpen(esc(food.name),`${esc(food.preparation)} · valores por 100 g comestibles`,`
    <div class="table-scroll"><table class="nutrient-table"><thead><tr><th>Nutriente</th><th>Cantidad / 100 g</th></tr></thead><tbody>${Object.entries(NUTRIENTS).map(([key,meta])=>`<tr><td>${meta.label}</td><td>${food.per100[key]===null?'Sin dato':`${fmt(food.per100[key],2)} ${meta.unit}`}</td></tr>`).join('')}</tbody></table></div>
    <div class="info-box"><strong>Grupo SMAE orientativo</strong><br>${esc(food.smaeGroup||'Sin clasificación para este alimento.')}${average?`<br>Promedio por equivalente del grupo: ${average.kcal} kcal · P ${average.protein} g · C ${average.carbs} g · G ${average.fat} g.`:''}${food.equivalentGrams?`<br>Equivalencia documentada: ${food.equivalentGrams} g por equivalente.`:'<br>No hay una equivalencia en gramos verificada para este registro.'}<br>El diario usa la composición individual por gramos, no el promedio del grupo.</div>
    <p class="source-line">${sourceText(food)}${food.source.description?`<br>Registro original: ${esc(food.source.description)}`:''}</p><p class="field-hint">«Sin dato» no significa cero. No se deben inferir micronutrientes de un grupo SMAE.</p><div class="modal-actions">${button('close','Cerrar','','secondary')}${button('choose-food','Registrar cantidad','plus','',`data-food="${food.id}"`)}</div>`);
}
function openEditEntry(mealId,entryId) {
  const entry=day().meals.find(m=>m.id===mealId)?.entries.find(e=>e.id===entryId);if(!entry)return;
  selectedFood=entry.food;
  modalOpen('Editar cantidad',esc(entry.food.name),`<form id="edit-entry-form" data-meal="${mealId}" data-entry="${entryId}"><label>Cantidad en gramos<input id="portion-grams" name="grams" type="number" min="0.1" max="5000" step="0.1" inputmode="decimal" required value="${entry.grams}"></label><div id="portion-preview">${portionPreview(entry.food,entry.grams)}</div><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('close','Cancelar','','secondary')}<button class="button" type="submit">Guardar cantidad</button></div></form>`);
}
function openMicros() {
  const total=sumEntries(entries()), t=target();
  modalOpen('Fibra y micronutrientes','Cantidades registradas y referencias generales por día.',`<div class="table-scroll"><table class="nutrient-table"><thead><tr><th>Nutriente</th><th>Consumido</th><th>Referencia</th><th>Diferencia</th></tr></thead><tbody>${microKeys.map(key=>{
    const value=total.totals[key],reference=t?.micros?.[key],partial=total.count>0&&total.coverage[key]<1,limit=key==='sodium', difference=reference&&value!==null?reference-value:null;
    return `<tr><td><a href="${MICRO_REFERENCES[key].url}" target="_blank" rel="noopener noreferrer">${NUTRIENTS[key].label}</a><small>${NUTRIENTS[key].unit}</small></td><td>${fmt(value,1)}${partial&&value!==null?'+':''}${partial?'<small>Datos incompletos</small>':''}</td><td>${reference?`${limit?'&lt; ':''}${fmt(reference,1)}`:'—'}<small>${limit?'Límite orientativo':MICRO_REFERENCES[key].basis}</small></td><td>${partial?'—':difference===null?'—':limit?(difference>0?'Bajo el límite':difference===0?'En el límite':`${fmt(-difference,1)} sobre límite`):difference>=0?`${fmt(difference,1)} por cubrir`:'Referencia cubierta'}</td></tr>`;
  }).join('')}</tbody></table></div><div class="info-box">Las referencias RDA/AI son orientativas y no diagnostican deficiencias. No hace falta completar cada número exactamente cada día. El sodio es un límite: no es una meta que debas alcanzar.</div><p class="field-hint">«+» indica un subtotal: faltan datos en uno o más alimentos. No calculamos lo que falta por consumir cuando la información está incompleta.</p><div class="modal-actions">${button('sources','Fuentes y metodología','','secondary')}${button('close','Entendido')}</div>`);
}
function openSteps() {
  const t=target();
  modalOpen('Tus pasos de este día',esc(dateTitle(selectedDate)),`<form id="steps-form"><label>Pasos registrados<input name="steps" type="number" min="0" max="100000" step="1" inputmode="numeric" required value="${day().steps}"></label><div class="info-box">${t?.eligible?`Tu referencia inicial es ${fmt(t.steps)} pasos. `:''}Puedes copiar el total de Salud de Apple, tu reloj o podómetro. GymTrack no lee sensores ni suma calorías por los pasos.</div><p class="field-hint">No existe una cifra de pasos que garantice un déficit o superávit. Progresa según tus posibilidades; esta es una meta de hábito, no una prescripción.</p><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('close','Cancelar','','secondary')}<button class="button" type="submit">Guardar pasos</button></div></form>`);
}
function openCustomFood() {
  modalOpen('Crea tu alimento','Copia la información de su etiqueta por 100 gramos.',`<form id="custom-food-form"><div class="form-grid"><label class="full">Nombre del alimento o marca<input name="name" required maxlength="160" placeholder="Ej. Yogur natural de mi marca"></label><label class="full">Preparación o presentación<input name="preparation" maxlength="240" placeholder="Ej. Producto listo para consumir" value="Tal como se vende"></label>${['kcal',...macroKeys].map(key=>`<label>${NUTRIENTS[key].label} (${NUTRIENTS[key].unit})<input name="${key}" required type="number" min="0" max="${key==='kcal'?1000:100}" step="any" inputmode="decimal" placeholder="Por 100 g"></label>`).join('')}</div><details style="margin-top:22px"><summary style="font-size:13px;cursor:pointer">Fibra y micronutrientes (opcional)</summary><p class="field-hint" style="margin:10px 0">Deja en blanco lo que la etiqueta no indique. Escribe cero solamente si está declarado. Usa las unidades mostradas, no porcentajes del valor diario.</p><div class="form-grid">${microKeys.map(key=>`<label>${NUTRIENTS[key].label} (${NUTRIENTS[key].unit})<input name="${key}" type="number" min="0" max="${key==='fiber'?100:1000000}" step="any" inputmode="decimal" placeholder="Sin dato"></label>`).join('')}</div></details><div class="info-box">Si la etiqueta corresponde a otra porción, convierte primero sus valores a 100 g. Ejemplo: 80 kcal por 50 g equivalen a 160 kcal por 100 g.</div><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('close','Cancelar','','secondary')}<button class="button" type="submit">Crear y registrar</button></div></form>`);
}
function openSources() {
  modalOpen('Datos claros, decisiones informadas','Qué calculamos y de dónde viene la información.',`<div class="prose"><h3>Composición de alimentos y SMAE</h3><p>El catálogo inicial incluye ${FOODS.length} alimentos de uso común en México, con composición por 100 g tomada de <a href="${CATALOG_METADATA.sourceUrl}" target="_blank" rel="noopener noreferrer">USDA SR Legacy 2018</a>. Cada ficha identifica el registro original. Son alimentos genéricos; una marca o receta mexicana puede tener valores diferentes.</p><p>El <a href="${CATALOG_METADATA.smaeSourceUrl}" target="_blank" rel="noopener noreferrer">resumen de equivalentes publicado por la UNAM</a> aporta los grupos y sus promedios. La clasificación es orientativa. Esta versión no contiene la base oficial completa del SMAE ni atribuye sus micronutrientes a ese sistema.</p><h3>Energía y objetivos</h3><p>Usamos <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">Mifflin–St Jeor</a>: 10 × kg + 6.25 × cm − 5 × edad, más 5 (masculino) o menos 161 (femenino). Después se multiplica por un factor de actividad aproximado de 1.2 a 1.725.</p><p>El déficit inicial reduce 10%, como máximo 300 kcal; el superávit aumenta 5%, como máximo 200 kcal. Son ajustes conservadores elegidos para la app. No ofrecemos objetivos automáticos por debajo de 1,200 kcal (femenino) o 1,500 kcal (masculino), ni déficit con IMC menor de 18.5. Estos límites no garantizan idoneidad individual.</p><p>El reparto inicial es 50% carbohidratos, 20% proteína y 30% grasa, dentro de los <a href="https://www.ncbi.nlm.nih.gov/books/NBK208874/" target="_blank" rel="noopener noreferrer">intervalos de distribución de referencia</a>. Las kcal publicadas pueden diferir del cálculo simple 4/4/9 por la fibra y los factores propios del alimento.</p><h3>Micronutrientes</h3><p>Las referencias generales dependen de edad y sexo y provienen de <a href="https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx" target="_blank" rel="noopener noreferrer">NIH / NASEM</a>. Cada nutriente enlaza su fuente en la tabla. Vitamina A se expresa en µg RAE y folato en µg DFE. Datos ausentes aparecen como «Sin dato» o subtotales, nunca como ceros inventados.</p><h3>Pasos y actividad</h3><p>Una <a href="https://pubmed.ncbi.nlm.nih.gov/34477847/" target="_blank" rel="noopener noreferrer">investigación observacional sobre pasos</a> asoció alrededor de 7,000 con beneficios en adultos de mediana edad; no define un objetivo universal ni un cálculo de pérdida de peso. La app propone 500 más que tu nivel habitual, hasta 7,000; si ya haces más, conserva tu nivel. La <a href="https://www.ncbi.nlm.nih.gov/books/NBK566046/" target="_blank" rel="noopener noreferrer">OMS recomienda progresar gradualmente</a>. No descontamos calorías por caminar.</p><h3>Alcance de esta versión</h3><p>Es un registro personal para adultos, no una dieta prescrita. En embarazo, lactancia, enfermedad o necesidades especiales, puedes registrar alimentos y definir objetivos con tu profesional de salud.</p></div><div class="modal-actions">${button('close','Entendido')}</div>`);
}
function openHelp() {
  modalOpen('Tu alimentación, más clara','Una guía breve para empezar con GymTrack.',`<div class="prose">
    <h3>De tu comida a tu diario</h3><ol><li>Configura tus datos en <strong>Mi objetivo</strong>.</li><li>Crea una comida, busca cada alimento y escribe sus gramos.</li><li>Revisa calorías, macros y micronutrientes. Puedes editar cantidades y consultar días anteriores.</li></ol>
    <h3>Instalar en iPhone</h3><ol><li>Abre la dirección publicada de GymTrack en <strong>Safari</strong>. Si solicita acceso, usa la cuenta autorizada para este sitio privado.</li><li>Toca <strong>Compartir → Agregar a Inicio</strong> (también puede decir «Agregar a pantalla de inicio»). Si no aparece, revisa «Editar acciones».</li><li>Si aparece <strong>Abrir como app web</strong>, déjalo activado y toca <strong>Agregar</strong>.</li><li>Abre GymTrack desde su icono y carga una vez con internet.</li></ol>
    <p>Esta versión se instala como aplicación web, con su propio icono. Todavía no está disponible para descargar en App Store o TestFlight. <a href="https://support.apple.com/es-lamr/guide/iphone/iphea86e5236/ios" target="_blank" rel="noopener noreferrer">Guía de Apple</a>.</p>
    <p>${esc(swStatus)}. La disponibilidad sin conexión también depende de las políticas del alojamiento y de que el navegador conserve el almacenamiento.</p>
    <p>Para recibir actualizaciones, abre con internet, cierra todas las ventanas de GymTrack (incluidas las pestañas de Safari) y vuelve a abrirla. No necesitas borrar tus registros. La dirección localhost sólo funciona en la computadora donde corre el servidor.</p>
    ${deferredInstall?button('install','Instalar GymTrack','','secondary'):''}
    <h3>Datos y respaldos</h3><p>Los datos se guardan en este navegador y dispositivo. No se envían a un servidor de nutrición y no hay sincronización automática con iCloud ni Salud de Apple. Para llevar tus registros de la computadora al teléfono, exporta el respaldo aquí e impórtalo en el teléfono. Conserva una copia antes de borrar datos del navegador.</p>
    </div><div class="backup-actions">${button('export','Exportar respaldo','download','secondary')}${button('import','Importar respaldo','','secondary')}</div>${storageError?`<div class="error-message">${esc(storageError)}</div>${button('export-raw','Descargar datos originales','','secondary')}`:''}<p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('sources','Fuentes y metodología','','secondary')}${button('close','Listo')}</div>`);
}
function download(text,name) { const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000); }
function importFile() {
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    try {
      if(file.size>MAX_BACKUP_BYTES)throw new Error('El archivo supera el límite de 5 MB.');
      pendingImport=parseBackup(await file.text());
      const days=Object.keys(pendingImport.days).length;
      modalOpen('Revisar respaldo','La importación reemplaza los datos guardados en este dispositivo.',`<div class="info-box"><strong>${days} días</strong> de historial · ${pendingImport.customFoods.length} alimentos personalizados<br>Perfil: ${esc(pendingImport.profile?.name||'Sin nombre')}</div><p class="subtext">Exporta una copia de tus datos actuales si quieres conservarlos antes de continuar.</p><p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('export','Exportar actuales','','secondary')}${button('close','Cancelar','','secondary')}${button('confirm-import','Reemplazar con respaldo')}</div>`);
    } catch(error){showError(error.message);}
  });input.click();
}
function confirmation(title,description,action,extra) {
  modalOpen(title,description,`<p id="form-error" class="error-message" role="alert"></p><div class="modal-actions">${button('close','Cancelar','','secondary')}${button(action,'Eliminar','trash','danger',extra)}</div>`);
}
function applyExample() {
  if(persist(next=>{
    const d=ensureDay(next);if(d.meals.length>=40)throw new Error('Alcanzaste el límite de 40 comidas en este día.');
    d.meals.push({id:uid('meal'),name:'Comida de ejemplo',entries:[['tortilla-maiz',150],['aguacate',20],['salmon-cocido',100],['manzana',60]].map(([id,grams])=>({id:uid('entry'),food:clone(FOODS.find(f=>f.id===id)),grams}))});
  },'Añadimos tu ejemplo. Puedes editarlo o eliminarlo.'))modal.close();
}
document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]');
  if(nav){view=nav.dataset.view;search='';filter='Todos';mealForAdd=null;render();window.scrollTo({top:0});return;}
  if(event.target.closest('.brand')){view='diary';render();return;}
  const btn=event.target.closest('[data-action]');if(!btn)return;
  const {action,meal,entry,food:foodId}=btn.dataset;
  const food=foodId?catalog().find(f=>f.id===foodId)||selectedFood:null;
  switch(action) {
    case 'close':modal.close();break;
    case 'profile':openProfile();break;
    case 'previous-day':shiftDate(-1);break;
    case 'next-day':shiftDate(1);break;
    case 'today':selectedDate=localDate();render();break;
    case 'open-day':selectedDate=btn.dataset.date;view='diary';render();window.scrollTo({top:0});break;
    case 'new-meal':openMeal();break;
    case 'rename-meal':openMeal(meal);break;
    case 'add-food':openFoodSearch(meal);break;
    case 'back-search':openFoodSearch(mealForAdd);break;
    case 'choose-food':if(food)openPortion(food);break;
    case 'food-detail':if(food)openFoodDetail(food);break;
    case 'edit-entry':openEditEntry(meal,entry);break;
    case 'delete-entry':confirmation('Quitar este alimento','Se actualizarán los totales de esta comida.','confirm-delete-entry',`data-meal="${meal}" data-entry="${entry}"`);break;
    case 'confirm-delete-entry':if(persist(next=>{const m=ensureDay(next).meals.find(m=>m.id===meal);if(m)m.entries=m.entries.filter(e=>e.id!==entry);},'Alimento eliminado.'))modal.close();break;
    case 'delete-meal':confirmation('Eliminar la comida','También se eliminarán todos sus alimentos de este día.','confirm-delete-meal',`data-meal="${meal}"`);break;
    case 'confirm-delete-meal':if(persist(next=>{const d=ensureDay(next);d.meals=d.meals.filter(m=>m.id!==meal);},'Comida eliminada.'))modal.close();break;
    case 'micros':openMicros();break;
    case 'steps':openSteps();break;
    case 'custom-food':openCustomFood();break;
    case 'sources':openSources();break;
    case 'help':openHelp();break;
    case 'example':modalOpen('Prueba con tu ejemplo','Se añadirá como una comida real en el día seleccionado.',`<div class="prose"><p>150 g de tortilla de maíz, 20 g de aguacate, 100 g de salmón cocido y 60 g de manzana con cáscara.</p><p>Puedes editarla o eliminarla después. No crearemos un perfil ni objetivos ficticios.</p></div><div class="modal-actions">${button('close','Cancelar','','secondary')}${button('confirm-example','Añadir comida de ejemplo')}</div>`);break;
    case 'confirm-example':applyExample();break;
    case 'filter':filter=btn.dataset.filter;if($('#food-results')){$('#food-results').innerHTML=foodSearchResults();$('#food-chips').innerHTML=chips();}else{$('#catalog-results').innerHTML=catalogResults();$('#catalog-chips').innerHTML=chips();}break;
    case 'favorite':persist(next=>{next.favorites=next.favorites.includes(foodId)?next.favorites.filter(id=>id!==foodId):[...next.favorites,foodId];});if($('#food-results'))$('#food-results').innerHTML=foodSearchResults();break;
    case 'export':try{if(storageError)throw new Error('Descarga los datos originales desde «Cómo funciona».');download(exportBackup(state),`gymtrack-respaldo-${localDate()}.json`);toast('Respaldo preparado para descargar.');}catch(error){showError(error.message);}break;
    case 'export-raw':try{const raw=localStorage.getItem(STORAGE_KEY);if(raw===null)throw new Error('No hay datos locales para descargar.');download(raw,`gymtrack-recuperacion-${localDate()}.json`);}catch(error){showError(error.message);}break;
    case 'import':importFile();break;
    case 'confirm-import':if(pendingImport&&persist(next=>{Object.assign(next,clone(pendingImport));},'Respaldo importado.',true)){pendingImport=null;modal.close();}break;
    case 'install':if(deferredInstall){deferredInstall.prompt();deferredInstall=null;}break;
  }
});
document.addEventListener('input',event=>{
  if(event.target.id==='food-search'){search=event.target.value;$('#food-results').innerHTML=foodSearchResults();}
  if(event.target.id==='catalog-search'){search=event.target.value;$('#catalog-results').innerHTML=catalogResults();}
  if(event.target.id==='portion-grams'&&selectedFood){$('#portion-preview').innerHTML=portionPreview(selectedFood,Number(event.target.value));}
});
document.addEventListener('change',event=>{
  if(event.target.id==='selected-date'&&event.target.value&&event.target.validity.valid){selectedDate=event.target.value;render();}
});
document.addEventListener('submit',event=>{
  const form=event.target;if(!form.id)return;event.preventDefault();
  const data=new FormData(form);
  switch(form.id){
    case 'profile-form':{
      const profile={name:String(data.get('name')).trim(),sex:data.get('sex'),age:Number(data.get('age')),height:Number(data.get('height')),weight:Number(data.get('weight')),activity:Number(data.get('activity')),goal:data.get('goal'),baselineSteps:Number(data.get('baselineSteps')),specialCondition:data.has('specialCondition')};
      try{calculateTargets(profile);}catch(error){showError(error.message);return;}
      if(persist(next=>{next.profile=profile;},'Tu objetivo se guardó.'))modal.close();break;
    }
    case 'meal-form':{
      const name=String(data.get('name')).trim();if(!name){showError('Escribe un nombre para la comida.');return;}const id=form.dataset.meal;let newId;
      if(persist(next=>{const d=ensureDay(next);if(id){const m=d.meals.find(m=>m.id===id);if(!m)throw new Error('La comida ya no existe.');m.name=name;}else{if(d.meals.length>=40)throw new Error('Puedes registrar hasta 40 comidas por día.');newId=uid('meal');d.meals.push({id:newId,name,entries:[]});}},id?'Nombre actualizado.':'Comida creada.')){if(id)modal.close();else openFoodSearch(newId);}break;
    }
    case 'portion-form':{
      const grams=Number(data.get('grams')),mealId=data.get('meal'), food=selectedFood;let savedMealId;
      if(!food)return;
      if(persist(next=>{scaleFood(food,grams);const d=ensureDay(next);let m=d.meals.find(m=>m.id===mealId);if(mealId==='new'){if(d.meals.length>=40)throw new Error('Puedes registrar hasta 40 comidas por día.');m={id:uid('meal'),name:`Comida ${d.meals.length+1}`,entries:[]};d.meals.push(m);}if(!m)throw new Error('La comida ya no existe. Vuelve a seleccionarla.');if(m.entries.length>=100)throw new Error('Puedes añadir hasta 100 alimentos por comida.');m.entries.push({id:uid('entry'),food:clone(food),grams});savedMealId=m.id;},`${fmt(grams,1)} g de ${food.name} añadidos.`)){openFoodSearch(savedMealId);}break;
    }
    case 'edit-entry-form':{
      const grams=Number(data.get('grams')),mealId=form.dataset.meal,entryId=form.dataset.entry;
      if(persist(next=>{const e=ensureDay(next).meals.find(m=>m.id===mealId)?.entries.find(e=>e.id===entryId);if(!e)throw new Error('El alimento ya no existe en esta comida.');scaleFood(e.food,grams);e.grams=grams;},'Cantidad actualizada.'))modal.close();break;
    }
    case 'steps-form':if(persist(next=>{ensureDay(next).steps=Number(data.get('steps'));},'Pasos guardados.'))modal.close();break;
    case 'custom-food-form':{
      const name=String(data.get('name')).trim();if(!name){showError('Escribe el nombre del alimento.');return;}
      const food={id:uid('custom'),name,category:'Mis alimentos',preparation:String(data.get('preparation')).trim(),emoji:'🥣',source:{name:'Etiqueta del usuario',url:'',code:'custom'},smaeGroup:null,equivalentGrams:null,per100:Object.fromEntries(Object.keys(NUTRIENTS).map(key=>[key,String(data.get(key)||'').trim()===''?null:Number(data.get(key))]))};
      if(persist(next=>{if(next.customFoods.length>=1000)throw new Error('Alcanzaste el límite de 1,000 alimentos personalizados.');next.customFoods.push(food);},'Alimento personalizado creado.'))openPortion(food);break;
    }
  }
});
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY){try{state=loadState();storageError='';render();toast('Registros actualizados desde otra pestaña.');}catch(error){storageError=error.message;render();}}});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;});
document.querySelectorAll('[data-icon]').forEach(el=>el.insertAdjacentHTML('afterbegin',icon(el.dataset.icon)));
render();
if('serviceWorker' in navigator && window.isSecureContext){
  navigator.serviceWorker.register('./sw.js').then(registration=>{
    const setReady=()=>{swStatus='La aplicación está preparada para abrirse sin conexión en este navegador';};
    if(registration.active)setReady();
    const worker=registration.installing;
    if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='activated')setReady();else if(worker.state==='redundant')swStatus='No se pudo preparar el modo sin conexión; vuelve a abrir con internet';});
  }).catch(()=>{swStatus='El modo sin conexión no está disponible en este alojamiento';});
} else swStatus='La instalación y el modo sin conexión requieren una dirección HTTPS';
