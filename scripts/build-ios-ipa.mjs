import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'build/ios');
const ipa = join(output, 'GymTrack.ipa');
const checksums = join(output, 'SHA256SUMS.txt');

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} terminó con código ${result.status ?? result.signal}.`);
  }
  return capture ? result.stdout.trim() : '';
}

function verifyDeviceApp(app) {
  const infoPath = join(app, 'Info.plist');
  if (!existsSync(infoPath)) throw new Error('Xcode no produjo App.app/Info.plist.');
  const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPath], true));
  if (info.CFBundleIdentifier !== 'mx.gymtrack.nutricion' || info.CFBundlePackageType !== 'APPL') {
    throw new Error('El producto compilado no es la aplicación GymTrack esperada.');
  }
  if (info.DTPlatformName !== 'iphoneos'
      || !info.CFBundleSupportedPlatforms?.includes('iPhoneOS')
      || info.CFBundleSupportedPlatforms.some((platform) => platform !== 'iPhoneOS')) {
    throw new Error('Se requiere una compilación iPhoneOS para dispositivo; un simulador no genera un IPA instalable.');
  }
  const executableName = info.CFBundleExecutable;
  if (typeof executableName !== 'string' || executableName !== basename(executableName)) {
    throw new Error('CFBundleExecutable no contiene un nombre de archivo válido.');
  }
  const executable = join(app, executableName);
  const architectures = run('xcrun', ['lipo', '-archs', executable], true).split(/\s+/);
  if (architectures.length !== 1 || architectures[0] !== 'arm64') {
    throw new Error(`La aplicación debe contener únicamente arm64, se obtuvo: ${architectures.join(', ')}.`);
  }
  const platform = run('xcrun', ['vtool', '-show-build', executable], true);
  if (!/\bplatform\s+IOS(?:\s|$)/.test(platform) || /IOSSIMULATOR/.test(platform)) {
    throw new Error('El ejecutable Mach-O no corresponde a la plataforma iOS de dispositivo.');
  }
  if (!existsSync(join(app, 'public/index.html'))) {
    throw new Error('Faltan los recursos de GymTrack. Ejecuta npm run ios:sync antes de compilar.');
  }
  console.log(`Verificado: ${info.CFBundleIdentifier}, iPhoneOS, arm64, iOS ${info.MinimumOSVersion}+.`);
}

function main() {
  if (process.platform !== 'darwin') {
    throw new Error('La compilación del IPA requiere macOS y Xcode 26+. Desde Windows utiliza el workflow Build iPhone IPA (AltStore) de GitHub Actions; consulta docs/IOS-INSTALL.md.');
  }
  const xcodeVersion = run('xcodebuild', ['-version'], true);
  const major = Number(xcodeVersion.match(/^Xcode (\d+)/m)?.[1]);
  if (!Number.isInteger(major) || major < 26) {
    throw new Error(`Capacitor 8 requiere Xcode 26 o posterior. Versión seleccionada: ${xcodeVersion}.`);
  }
  console.log(xcodeVersion);
  const project = resolve(root, 'ios/App/App.xcodeproj');
  if (!existsSync(project)) throw new Error('No se encontró ios/App/App.xcodeproj.');
  const buildNumber = process.env.IOS_BUILD_NUMBER || '1';
  if (!/^\d{1,9}$/.test(buildNumber) || Number(buildNumber) < 1) {
    throw new Error('IOS_BUILD_NUMBER debe ser un entero positivo de hasta 9 dígitos.');
  }

  mkdirSync(output, { recursive: true });
  // A failed build must never leave a previous IPA looking like the new result.
  rmSync(ipa, { force: true });
  rmSync(checksums, { force: true });
  const staging = mkdtempSync(join(output, 'package-'));
  try {
    const derivedData = join(staging, 'DerivedData');
    run('xcodebuild', [
      '-project', project,
      '-scheme', 'App',
      '-configuration', 'Release',
      '-sdk', 'iphoneos',
      '-destination', 'generic/platform=iOS',
      '-derivedDataPath', derivedData,
      'ARCHS=arm64',
      'ONLY_ACTIVE_ARCH=NO',
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO',
      'CODE_SIGN_IDENTITY=',
      'DEVELOPMENT_TEAM=',
      `CURRENT_PROJECT_VERSION=${buildNumber}`,
      'build',
    ]);
    const app = join(derivedData, 'Build/Products/Release-iphoneos/App.app');
    verifyDeviceApp(app);

    const payload = join(staging, 'Payload');
    mkdirSync(payload);
    run('/usr/bin/ditto', ['--norsrc', app, join(payload, 'App.app')]);
    // IPA is a ZIP containing Payload/App.app. ditto preserves executable modes.
    run('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', payload, ipa]);
    run('/usr/bin/unzip', ['-tq', ipa]);
    const entries = run('/usr/bin/unzip', ['-Z1', ipa], true).split(/\r?\n/);
    if (!entries.includes('Payload/App.app/Info.plist')
        || entries.some((entry) => !entry.startsWith('Payload/'))) {
      throw new Error('La estructura del IPA no es Payload/App.app.');
    }
    const sha256 = createHash('sha256').update(readFileSync(ipa)).digest('hex');
    writeFileSync(checksums, `${sha256}  GymTrack.ipa\n`, 'utf8');
    console.log(`IPA para firmar e instalar con AltStore: ${ipa}`);
    console.log(`SHA-256: ${sha256}`);
  } catch (error) {
    rmSync(ipa, { force: true });
    rmSync(checksums, { force: true });
    throw error;
  } finally {
    // This exact directory was just created by mkdtemp under build/ios.
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`\nNo se pudo generar GymTrack.ipa: ${error.message}`);
  process.exitCode = 1;
}
