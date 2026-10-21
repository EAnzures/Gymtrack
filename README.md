# GymTrack · Nutrición

Aplicación de nutrición en español para usuarios mexicanos. Incluye una versión web instalable (PWA) para Safari, Android y escritorio, y un proyecto iOS con Capacitor para instalar mediante AltStore Classic. No necesita backend ni claves de API.

## Descargar como aplicación para iPhone

El proyecto iOS incluye el diario y el catálogo localmente. Para obtener el archivo instalable, abre [GitHub Actions de EAnzures/Gymtrack](https://github.com/EAnzures/Gymtrack/actions/workflows/ios-ipa.yml), ejecuta **Run workflow** y, cuando termine correctamente, descarga el artefacto **GymTrack-iOS-AltStore**. Extrae el ZIP y guarda **GymTrack.ipa**.

Instálalo desde **AltStore Classic → My Apps → +** con AltServer disponible en tu computadora. El IPA se compila sin firma y AltStore lo firma con tu cuenta de Apple. Descargarlo desde Safari por sí solo no lo instala. Con una cuenta gratuita debes renovar la firma cada 7 días. [Guía completa de compilación e instalación](docs/IOS-INSTALL.md).

La app iOS requiere iOS 15 o posterior. Sus registros son independientes de Safari: usa **Exportar respaldo** e **Importar respaldo** para pasarlos. La exportación nativa abre el menú de compartir de iOS para elegir **Guardar en Archivos**. Las actualizaciones del sitio no actualizan el IPA automáticamente.

## Ejecutar en esta computadora

Requiere Node.js 22 o posterior. Desde esta carpeta:

```powershell
npm start
```

Abre `http://localhost:4173`. En este equipo, si Node no está en el PATH:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/serve.mjs
```

Los archivos web están en `dist/` y se sirven directamente. El servidor local sólo expone esa carpeta y escucha en localhost. No uses esa dirección como enlace para el iPhone: localhost en el teléfono es el propio teléfono.

## Instalar la versión web desde Safari

La aplicación ya está publicada en [GymTrack](https://gymtrack-nutricion-mx.agilegrebe513.chatgpt.site). Para instalar esta versión:

1. Abre ese enlace en **Safari en tu iPhone**. Si solicita acceso, inicia sesión con la cuenta autorizada para el sitio privado.
2. Toca **Compartir** (el cuadro con la flecha hacia arriba). Según el diseño de Safari, puede estar dentro de **Más**.
3. Selecciona **Agregar a Inicio** o **Agregar a pantalla de inicio**. Si no aparece, revisa **Editar acciones** en el menú de compartir.
4. Si aparece **Abrir como app web**, déjalo activado y toca **Agregar**.
5. Abre **GymTrack** desde su icono en la pantalla de inicio y carga una vez con internet.

Así se instala la aplicación web (PWA) con su propio icono. No se descarga de App Store ni genera un archivo `.ipa`. [Instrucciones oficiales de Apple](https://support.apple.com/es-lamr/guide/iphone/iphea86e5236/ios).

Los recursos se guardan para uso sin conexión cuando las políticas del alojamiento lo permiten. Para recibir una actualización, abre con internet, cierra todas las ventanas de GymTrack (incluidas las pestañas de Safari) y vuelve a abrirla. No hace falta borrar los datos del navegador. La instalación real se debe comprobar en un iPhone; las pruebas de escritorio con tamaño móvil no sustituyen ese paso.

Si ya registraste alimentos en la computadora, usa **Mi objetivo → Exportar respaldo** y luego **Importar respaldo** en el teléfono: los dispositivos no se sincronizan automáticamente.

### Descarga mediante TestFlight o App Store

Para distribuirla mediante TestFlight o App Store se necesita pertenecer al **Apple Developer Program**, configurar la app en App Store Connect y firmar/subir la compilación iOS. El flujo incluido genera un IPA para AltStore, sin publicación en esas tiendas. [Distribución oficial de Apple](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).

El proyecto de Sites registrado se conserva en `.openai/hosting.json`. Su configuración inicial es privada; un enlace publicado puede requerir iniciar sesión con la cuenta autorizada. No se publican diarios personales: éstos sólo existen en el navegador de quien usa la app.

## Funciones

- Perfil con mantenimiento estimado, déficit moderado o superávit moderado; reparto inicial de macronutrientes y referencias de fibra, vitaminas y minerales.
- Comidas con nombre libre, cantidades en gramos, edición, eliminación, fechas e historial.
- Catálogo de 66 alimentos, incluidas torta de agua con todo el migajón y sin relleno, palomitas de maíz sin aceite o con aceite y piernas de pollo con distintas preparaciones; búsqueda sin acentos, categorías, favoritos y ficha nutricional con procedencia.
- Alimentos personalizados desde etiquetas por 100 g. Los nutrientes desconocidos permanecen sin dato.
- Total diario de energía, proteína, carbohidratos, grasa y otros 12 nutrientes. El sodio se muestra como límite, nunca como cantidad que falta consumir.
- Meta gradual de pasos y registro manual, sin descontar calorías por actividad.
- Respaldo JSON, revisión previa a importar y validación de contenido. Los registros conservan una copia de los datos del alimento usado en ese momento.
- Manifest, iconos de inicio y service worker con recursos locales.

## Datos nutricionales: alcance del SMAE

El SMAE se usa como **clasificación orientativa y contexto de equivalentes**, a partir del resumen público de la UNAM. Esta versión **no incluye la base oficial completa del SMAE**. Los cálculos por gramos, tanto macros como micros, proceden de los registros individuales oficiales **USDA SR Legacy 2018**, importados con un script reproducible; no se inventan micronutrientes a partir de promedios de grupos.

La marca, variedad, preparación, cantidad de agua, aceite y sal pueden cambiar la composición. Hay alimentos crudos y cocidos separados. Para productos específicos se pueden ingresar los valores de su etiqueta. Una futura integración íntegra del SMAE requiere una fuente autorizada de la edición elegida y validar la correspondencia por alimento.

La torta de agua se estima con la composición USDA de pan blanco tipo francés: no contamos con un análisis específico de esa receta. Se registra el peso completo del pan, incluido el migajón, sin relleno; esta limitación aparece en su preparación y en la documentación de fuentes.

- [Procedencia del catálogo y generación reproducible](docs/NUTRITION-SOURCES.md).
- [Ecuaciones, referencias y límites de los objetivos](docs/TARGETS.md).

## Almacenamiento y límites

La clave local es `gymtrack.v1`. Cada navegador/origen/dispositivo y la app iOS mantienen sus datos por separado. No hay cuentas propias, sincronización, integración con Apple Health, lector de fotos ni módulo de entrenamiento. Exporta antes de cambiar de dirección o dispositivo, desinstalar o borrar datos del navegador.

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

Para preparar y verificar los recursos iOS desde Windows o Mac:

```powershell
npm ci
npm run ios:sync
```

La verificación comprueba recursos locales, catálogo, plugins, privacidad e icono. Las pruebas del adaptador nativo simulan los plugins para comprobar exportación, cancelación y errores; no sustituyen una instalación en iPhone. La compilación final requiere macOS y Xcode 26+: GitHub Actions la ejecuta, o puedes usar `npm run ios:ipa` en una Mac.

## Estructura

```text
dist/             Aplicación lista para alojar
  app.js          Interfaz, formularios y flujos del diario
  nutrition.js    Cálculos y referencias nutricionales
  foods.js        Catálogo generado desde USDA
  storage.js      Persistencia y validación de respaldos
  sw.js           Recursos sin conexión
scripts/          Servidor local e importador del catálogo
native/           Entrada iOS y exportación mediante Archivos/Compartir
ios/              Proyecto Xcode con Swift Package Manager
.github/workflows/ Compilación manual del IPA en GitHub Actions
tests/            Pruebas de dominio y navegador
docs/             Fuentes, método y límites
```
