# Instalar GymTrack en iPhone con AltStore Classic

El proyecto iOS incluye GymTrack y su catálogo dentro de la aplicación. El diario funciona sin conectarse al sitio web. GitHub Actions compila un archivo **GymTrack.ipa para iPhone físico** en una Mac; después **AltStore Classic** lo firma e instala con tu cuenta de Apple. No necesitas comprar una Mac para este proceso.

El archivo producido está **sin firmar**: descargarlo o tocarlo en Safari no basta para instalarlo. La firma se realiza desde AltStore/AltServer, fuera de GitHub. Este proceso no utiliza contraseñas de Apple, certificados ni secretos de firma en el repositorio.

## 1. Preparar tu repositorio en GitHub

El repositorio elegido es [EAnzures/Gymtrack](https://github.com/EAnzures/Gymtrack). La raíz debe contener `package.json`, `package-lock.json`, `capacitor.config.json`, `dist/`, `ios/`, `scripts/`, `tests/` y **`.github/workflows/ios-ipa.yml`**. La carpeta `gymtrack` de esta computadora ya es la raíz del proyecto: no la coloques como una subcarpeta adicional dentro del repositorio.

Sube los archivos de código y configuración con Git. No subas `node_modules/`, `build/`, paquetes compilados, respaldos personales del diario, archivos `.env` ni carpetas de configuración de otros servicios. Conserva el remoto del sitio web si existe; un remoto adicional puede llamarse `github`.

La rama predeterminada del repositorio debe incluir el workflow para que aparezca **Run workflow**. [Ejecución manual de GitHub Actions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## 2. Generar y descargar el IPA

1. Abre el repositorio en GitHub e inicia sesión con tu cuenta.
2. Entra en **Actions → Build iPhone IPA (AltStore)**.
3. Pulsa **Run workflow**, selecciona la rama y confirma **Run workflow**.
4. Espera a que la ejecución termine en verde. Si falla, abre el paso rojo y consulta su registro; no habrá un IPA válido de esa ejecución.
5. En el resumen de la ejecución, baja a **Artifacts** y descarga **GymTrack-iOS-AltStore**.
6. Extrae el ZIP descargado. Encontrarás **GymTrack.ipa** y **SHA256SUMS.txt**. El archivo que se instala es `GymTrack.ipa`, no el ZIP exterior.

El workflow se inicia manualmente y guarda el artefacto durante 14 días. Después puedes generarlo otra vez. GitHub contabiliza minutos y almacenamiento según tu plan; los repositorios privados consumen la cuota disponible y pueden generar cargos si permitiste excederla. [Uso y facturación de GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## 3. Instalar AltStore Classic desde Windows

Sigue la [guía oficial de AltStore para Windows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows), que incluye los enlaces de descarga y los requisitos actuales de iTunes/iCloud:

1. Instala los componentes de Apple indicados por la guía y **AltServer para Windows**.
2. Abre AltServer, conecta el iPhone por USB, desbloquéalo y acepta **Confiar** cuando lo solicite.
3. Activa la sincronización por Wi-Fi en iTunes si la usarás para renovar aplicaciones.
4. En el icono de AltServer de la bandeja de Windows, selecciona **Install AltStore → tu iPhone**.
5. Introduce tu cuenta de Apple directamente en AltServer cuando lo solicite.
6. En el iPhone, confía en el perfil desde **Configuración → General → VPN y administración de dispositivos**; el nombre de este apartado puede variar.
7. En iOS 16 o posterior, activa **Configuración → Privacidad y seguridad → Modo de desarrollador** y completa el reinicio/confirmación que solicite el teléfono. [Modo de desarrollador de Apple](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

## 4. Instalar GymTrack

1. Guarda `GymTrack.ipa` en la app **Archivos** del iPhone. Puedes descargar el artefacto desde Safari con tu sesión de GitHub y extraerlo en Archivos, o transferir el IPA desde tu computadora.
2. Mantén AltServer abierto y el iPhone conectado por USB, o ambos en la misma red con la sincronización configurada.
3. Abre **AltStore Classic → My Apps → +** y selecciona **GymTrack.ipa**.
4. Espera a que termine la firma e instalación y abre **GymTrack** desde su icono.

Con una cuenta gratuita, las aplicaciones requieren renovar la firma cada **7 días**. AltStore intenta hacerlo en segundo plano; también puedes usar **Refresh All** con AltServer disponible. Existe un límite de aplicaciones instaladas mediante este método. [Funcionamiento y límites de AltStore](https://faq.altstore.io/altstore-classic/your-altstore).

## 5. Pasar tus registros y comprobar la app

Safari, la PWA y esta app iOS guardan sus datos por separado. Antes de cambiar, abre la versión que ya usabas y pulsa **Mi objetivo → Exportar respaldo**. Guarda el JSON en Archivos y luego usa **Importar respaldo** dentro de la aplicación instalada. Revisa las fechas y comidas antes de confirmar la importación.

La app iOS abre la hoja de compartir al exportar: selecciona **Guardar en Archivos**. No se sincroniza automáticamente con Safari ni con otro teléfono.

Después de instalar, comprueba en tu iPhone:

- Registrar una comida, cerrar completamente GymTrack y volver a abrirla conserva el registro.
- Abrirla en modo avión permite consultar alimentos y registrar cantidades.
- Exportar un respaldo y volver a importarlo conserva los datos.
- El teclado, la parte superior y los botones inferiores quedan visibles en tu pantalla.

Para actualizar, genera otro IPA e instálalo con la misma cuenta de Apple y el mismo identificador de aplicación. Exporta un respaldo antes de actualizar y evita desinstalar para no borrar registros. Las modificaciones del sitio web no actualizan automáticamente el contenido de esta app.

## Compilación y comprobaciones técnicas

- Runtime nativo: Capacitor 8, proyecto Xcode con Swift Package Manager.
- Identificador: `mx.gymtrack.nutricion`; nombre visible: `GymTrack`.
- Requisitos: Node.js 22+; el workflow utiliza Node.js 24 y `macos-26` con Xcode 26 o posterior. [Requisitos de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup), [imagen de macOS de GitHub](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md).
- Flujo: `npm ci` → `npm test` → `npm run ios:sync` → `node scripts/build-ios-ipa.mjs`.
- Xcode compila `Release` con SDK `iphoneos`, destino `generic/platform=iOS`, arquitectura `arm64` y firma desactivada. El script verifica `Info.plist`, plataforma del ejecutable y recursos web antes de crear `Payload/App.app` dentro del IPA; también valida el ZIP y calcula SHA-256.
- Salida local en una Mac: `build/ios/GymTrack.ipa`.
- El workflow sólo solicita `contents: read`, publica el IPA como artefacto de esa ejecución y no crea releases.

Desde una Mac con Xcode seleccionado puedes ejecutar el mismo flujo en la raíz del proyecto. Desde Windows puedes preparar/sincronizar el proyecto; para producir el binario se necesita la ejecución en macOS. Las pruebas web y las comprobaciones de estructura no sustituyen la instalación en un iPhone real.
