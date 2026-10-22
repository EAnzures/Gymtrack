import assert from 'node:assert/strict';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

// Both parsers are installed by the pinned Capacitor CLI/Xcode toolchain.
const require = createRequire(import.meta.url);
const xcode = require('xcode');
const plist = require('simple-plist');
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const appId = 'mx.gymtrack.nutricion';

export function verifyNativeConfiguration(config) {
  assert.equal(config.appId, appId, 'El identificador debe ser mx.gymtrack.nutricion.');
  assert.equal(config.appName, 'GymTrack', 'El nombre de la aplicación debe ser GymTrack.');
  assert.equal(config.webDir, 'build/native-web', 'Los recursos deben proceder de build/native-web.');
  assert.ok(!Object.hasOwn(config.server ?? {}, 'url'), 'La aplicación instalada no debe depender de server.url.');
  assert.ok(!config.server?.allowNavigation?.length, 'No se permite reemplazar la aplicación con navegación remota.');
}

function isInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Follow actual HTML, stylesheet and module references. Documentation hyperlinks
// are intentionally not dependencies: opening a USDA reference may use internet.
export async function verifyLocalAssets(directory) {
  const base = await realpath(directory);
  const queue = [path.join(base, 'index.html')];
  const checked = new Set();
  async function enqueue(reference, parent, isModule = false) {
    if (!reference || reference.startsWith('#') || reference.startsWith('data:')) return;
    assert.ok(!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference), `Recurso remoto en ${path.basename(parent)}: ${reference}`);
    if (isModule) assert.ok(/^(?:\.?\.?\/)/.test(reference), `Importación sin empaquetar: ${reference}`);
    const relative = decodeURIComponent(reference.split(/[?#]/)[0]);
    const location = relative.startsWith('/')
      ? path.resolve(base, `.${relative}`)
      : path.resolve(path.dirname(parent), relative);
    assert.ok(isInside(base, location), `El recurso sale del paquete: ${reference}`);
    let target;
    try { target = await realpath(location); }
    catch { throw new Error(`Falta el recurso local ${reference} referenciado por ${path.basename(parent)}.`); }
    assert.ok(isInside(base, target), `El enlace del recurso sale del paquete: ${reference}`);
    assert.ok((await stat(target)).isFile(), `El recurso debe ser un archivo: ${reference}`);
    queue.push(target);
  }
  while (queue.length) {
    const file = queue.shift();
    if (checked.has(file)) continue;
    checked.add(file);
    const extension = path.extname(file);
    if (!['.html', '.css', '.js', '.mjs', '.webmanifest'].includes(extension)) continue;
    const source = await readFile(file, 'utf8');
    if (extension === '.html') {
      for (const tag of source.matchAll(/<(?:script|link|img|source|video)\b[^>]*>/gi)) {
        for (const attribute of tag[0].matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
          await enqueue(attribute[1], file);
        }
      }
    } else if (extension === '.css') {
      for (const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi)) {
        await enqueue(match[1] || match[2], file);
      }
    } else if (extension === '.webmanifest') {
      for (const icon of JSON.parse(source).icons ?? []) await enqueue(icon.src, file);
    } else {
      for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)|\b(?:import|export)\s+(?:[^;"'\n]*?\s+from\s*)?["']([^"']+)["']/g)) {
        await enqueue(match[1] || match[2], file, true);
      }
    }
  }
  return [...checked].map(file => path.relative(base, file).replaceAll(path.sep, '/')).sort();
}

export function verifyAppIcon(png) {
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'El icono debe ser PNG.');
  const data = [];
  let foundHeader = false;
  let foundEnd = false;
  for (let offset = 8; offset + 12 <= png.length;) {
    const size = png.readUInt32BE(offset);
    assert.ok(offset + size + 12 <= png.length, 'El icono PNG está truncado.');
    const type = png.toString('ascii', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      assert.equal(size, 13, 'Cabecera PNG inválida.');
      assert.equal(chunk.readUInt32BE(0), 1024, 'El icono debe medir 1024 × 1024.');
      assert.equal(chunk.readUInt32BE(4), 1024, 'El icono debe medir 1024 × 1024.');
      assert.equal(chunk[8], 8, 'El icono debe usar 8 bits por canal.');
      assert.equal(chunk[9], 2, 'El icono debe ser RGB sin canal alfa.');
      assert.equal(chunk[10], 0);
      assert.equal(chunk[11], 0);
      assert.equal(chunk[12], 0, 'El icono no debe estar entrelazado.');
      foundHeader = true;
    }
    assert.notEqual(type, 'tRNS', 'El icono no debe incluir transparencia.');
    if (type === 'IDAT') data.push(chunk);
    if (type === 'IEND') { foundEnd = true; break; }
    offset += size + 12;
  }
  assert.ok(foundHeader && foundEnd && data.length, 'El icono PNG está incompleto.');
  const pixels = inflateSync(Buffer.concat(data), { maxOutputLength: (1024 * 3 + 1) * 1024 });
  assert.equal(pixels.length, (1024 * 3 + 1) * 1024, 'Los datos del icono no corresponden a su tamaño.');
}

async function allFiles(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...await allFiles(directory, relative));
    else {
      assert.ok(entry.isFile(), `No se permiten enlaces dentro del paquete: ${relative}`);
      found.push(relative);
    }
  }
  return found;
}

export async function verifyNative(root = defaultRoot) {
  const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const config = await json('capacitor.config.json');
  const copiedConfig = await json('ios/App/App/capacitor.config.json');
  verifyNativeConfiguration(config);
  verifyNativeConfiguration(copiedConfig);
  for (const [key, value] of Object.entries(config)) {
    assert.deepEqual(copiedConfig[key], value, `La configuración iOS está desactualizada: ${key}. Ejecuta npm run ios:sync.`);
  }
  for (const plugin of ['FilesystemPlugin', 'SharePlugin']) {
    assert.ok(copiedConfig.packageClassList?.includes(plugin), `Falta el plugin iOS ${plugin}.`);
  }

  const staged = path.join(root, config.webDir);
  const packaged = path.join(root, 'ios/App/App/public');
  const files = await allFiles(staged);
  for (const file of files) {
    assert.ok((await readFile(path.join(staged, file))).equals(await readFile(path.join(packaged, file))),
      `El recurso iOS está desactualizado: ${file}. Ejecuta npm run ios:sync.`);
  }
  for (const file of await allFiles(packaged)) {
    assert.ok(!/^\.(?:openai|git)(?:[\\/]|$)/.test(file), `No debe empaquetarse información del alojamiento: ${file}`);
  }
  assert.ok(!files.includes('sw.js'), 'El paquete nativo no debe incluir el service worker del sitio.');
  for (const file of ['app.js', 'foods.js', 'nutrition.js', 'storage.js']) {
    assert.ok((await readFile(path.join(root, 'dist', file))).equals(await readFile(path.join(staged, file))),
      `La versión nativa no contiene la versión actual de ${file}.`);
  }
  const assets = await verifyLocalAssets(packaged);
  assert.ok(assets.includes('native-entry.js'), 'index.html debe cargar el adaptador nativo.');
  assert.ok(assets.includes('app.js') && assets.includes('foods.js'), 'La entrada nativa debe cargar la aplicación y su catálogo local.');
  const { FOODS } = await import(pathToFileURL(path.join(root, 'dist/foods.js')).href);
  assert.ok(FOODS.length >= 65, 'El catálogo nativo debe incluir al menos los 65 alimentos existentes.');
  for (const id of ['palomitas-sin-aceite', 'palomitas-con-aceite', 'pierna-pollo-asada-sin-piel']) {
    assert.ok(FOODS.some(food => food.id === id), `Falta el alimento ${id}.`);
  }

  const project = xcode.project(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'));
  project.parseSync();
  const objects = project.hash.project.objects;
  const unquote = value => String(value).replace(/^"|"$/g, '');
  const resources = Object.values(objects.PBXResourcesBuildPhase ?? {})
    .filter(phase => typeof phase === 'object')
    .flatMap(phase => phase.files ?? [])
    .map(file => objects.PBXBuildFile[file.value]?.fileRef)
    .map(reference => objects.PBXFileReference[reference]?.path)
    .map(unquote);
  for (const file of ['PrivacyInfo.xcprivacy', 'public', 'capacitor.config.json', 'Assets.xcassets']) {
    assert.ok(resources.includes(file), `${file} debe incluirse en los recursos de Xcode.`);
  }
  const settings = Object.values(objects.XCBuildConfiguration ?? {})
    .filter(item => typeof item === 'object' && item.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER)
    .map(item => item.buildSettings);
  assert.ok(settings.length >= 2, 'Faltan las configuraciones Debug/Release de la aplicación.');
  for (const setting of settings) {
    assert.equal(unquote(setting.PRODUCT_BUNDLE_IDENTIFIER), appId, 'Xcode debe usar el identificador de GymTrack.');
    assert.ok(Number(unquote(setting.IPHONEOS_DEPLOYMENT_TARGET)) >= 15.4, 'GymTrack requiere iOS 15.4 o posterior para abrir sus formularios con dialog.showModal().');
  }
  const scheme = await readFile(path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'), 'utf8');
  const references = [...scheme.matchAll(/<BuildableReference\b[^>]*\bBlueprintIdentifier="([^"]+)"[^>]*>/g)];
  assert.ok(references.length, 'El esquema App debe estar compartido para GitHub Actions.');
  for (const reference of references) {
    const target = objects.PBXNativeTarget[reference[1]];
    assert.ok(target && unquote(target.productType) === 'com.apple.product-type.application', 'El esquema App debe compilar el target de la aplicación.');
  }
  const info = plist.parse(await readFile(path.join(root, 'ios/App/App/Info.plist'), 'utf8'));
  assert.equal(info.LSRequiresIPhoneOS, true, 'La aplicación debe declarar iPhoneOS.');
  assert.ok(info.UIRequiredDeviceCapabilities?.includes('arm64'), 'La aplicación debe admitir dispositivos arm64.');
  const privacy = plist.parse(await readFile(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8'));
  assert.equal(privacy.NSPrivacyTracking, false, 'GymTrack no utiliza seguimiento publicitario.');
  assert.ok(privacy.NSPrivacyAccessedAPITypes?.some(entry =>
    entry.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryFileTimestamp'
    && entry.NSPrivacyAccessedAPITypeReasons?.includes('C617.1')), 'Falta la razón C617.1 de Filesystem en el manifiesto de privacidad.');

  const iconDirectory = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
  const icons = (await json(`${iconDirectory}/Contents.json`)).images;
  const icon = icons.find(image => image.size === '1024x1024' && image.filename);
  assert.ok(icon && path.basename(icon.filename) === icon.filename, 'Falta el icono universal de 1024 × 1024.');
  verifyAppIcon(await readFile(path.join(root, iconDirectory, icon.filename)));
  return { foods: FOODS.length, files: files.length, appId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyNative();
    console.log(`iOS verificado: ${result.appId}, ${result.foods} alimentos, ${result.files} recursos locales, plugins, privacidad e icono.`);
  } catch (error) {
    console.error(`No se puede compilar iOS: ${error.message}`);
    process.exitCode = 1;
  }
}
