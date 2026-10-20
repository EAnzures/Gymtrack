# GymTrack · Nutrición

Primera versión funcional como aplicación web instalable (PWA), en español para usuarios mexicanos. Funciona en iPhone desde Safari, Android y escritorio. No necesita backend ni claves de API.

## Ejecutar en esta computadora

Requiere Node.js 20 o posterior. Desde esta carpeta:

```powershell
npm start
```

Abre `http://localhost:4173`. En este equipo, si Node no está en el PATH:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/serve.mjs
```

Los archivos de producción están en `dist/`; no hay compilación. El servidor local sólo expone esa carpeta y escucha en localhost. No uses esa dirección como enlace para el iPhone: localhost en el teléfono es el propio teléfono.

## Instalar en iPhone

Publica `dist/` en un alojamiento HTTPS, abre su dirección en Safari y elige **Compartir → Agregar a pantalla de inicio**. Abre la aplicación desde el icono y carga una vez con internet. Los recursos se guardan para uso sin conexión cuando las políticas del alojamiento lo permiten. La instalación real se debe comprobar en un iPhone; las pruebas de escritorio con tamaño móvil no sustituyen ese paso.

El proyecto de Sites registrado se conserva en `.openai/hosting.json`. Su configuración inicial es privada; un enlace publicado puede requerir iniciar sesión con la cuenta autorizada. No se publican diarios personales: éstos sólo existen en el navegador de quien usa la app.

## Funciones

- Perfil con mantenimiento estimado, déficit moderado o superávit moderado; reparto inicial de macronutrientes y referencias de fibra, vitaminas y minerales.
- Comidas con nombre libre, cantidades en gramos, edición, eliminación, fechas e historial.
- Catálogo inicial de 60 alimentos, búsqueda sin acentos, categorías, favoritos y ficha nutricional con procedencia.
- Alimentos personalizados desde etiquetas por 100 g. Los nutrientes desconocidos permanecen sin dato.
- Total diario de energía, proteína, carbohidratos, grasa y otros 12 nutrientes. El sodio se muestra como límite, nunca como cantidad que falta consumir.
- Meta gradual de pasos y registro manual, sin descontar calorías por actividad.
- Respaldo JSON, revisión previa a importar y validación de contenido. Los registros conservan una copia de los datos del alimento usado en ese momento.
- Manifest, iconos de inicio y service worker con recursos locales.

## Datos nutricionales: alcance del SMAE

El SMAE se usa como **clasificación orientativa y contexto de equivalentes**, a partir del resumen público de la UNAM. Esta versión **no incluye la base oficial completa del SMAE**. Los cálculos por gramos, tanto macros como micros, proceden de los registros individuales oficiales **USDA SR Legacy 2018**, importados con un script reproducible; no se inventan micronutrientes a partir de promedios de grupos.

La marca, variedad, preparación, cantidad de agua, aceite y sal pueden cambiar la composición. Hay alimentos crudos y cocidos separados. Para productos específicos se pueden ingresar los valores de su etiqueta. Una futura integración íntegra del SMAE requiere una fuente autorizada de la edición elegida y validar la correspondencia por alimento.

- [Procedencia del catálogo y generación reproducible](docs/NUTRITION-SOURCES.md).
- [Ecuaciones, referencias y límites de los objetivos](docs/TARGETS.md).

## Almacenamiento y límites

La clave local es `gymtrack.v1`. Cada navegador/origen/dispositivo mantiene sus datos por separado. No hay cuentas propias, sincronización, integración con Apple Health, lector de fotos ni módulo de entrenamiento. Exporta antes de cambiar de dirección o dispositivo, desinstalar o borrar datos del navegador.

El objetivo mostrado es el **perfil actual**, también al consultar fechas anteriores; los alimentos históricos sí conservan su composición original. Las metas automáticas son estimaciones para adultos y se desactivan para ciertas situaciones que requieren atención individual. La aplicación permite continuar el diario.

Los pasos habituales del perfil determinan una primera meta gradual. Para progresar, actualiza ese promedio en el perfil; no existe una conversión automática de objetivo de peso a pasos obligatorios.

## Verificación

```powershell
npm test
```

Las pruebas unitarias cubren escalado por gramos, datos ausentes frente a cero, objetivos y límites, fechas locales, consistencia del catálogo y respaldos. Para pruebas del navegador:

```powershell
npm install
npx playwright install chromium
npx playwright test
```

La dependencia Playwright sólo se usa para desarrollo; la app no la descarga ni la necesita para funcionar. Los resultados y capturas quedan fuera del control de versiones en `test-results/`.

## Estructura

```text
dist/             Aplicación lista para alojar
  app.js          Interfaz, formularios y flujos del diario
  nutrition.js    Cálculos y referencias nutricionales
  foods.js        Catálogo generado desde USDA
  storage.js      Persistencia y validación de respaldos
  sw.js           Recursos sin conexión
scripts/          Servidor local e importador del catálogo
tests/            Pruebas de dominio y navegador
docs/             Fuentes, método y límites
```
