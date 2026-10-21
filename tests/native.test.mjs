import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { verifyAppIcon, verifyLocalAssets, verifyNativeConfiguration } from '../scripts/verify-native.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const nativeBundle = build({
  absWorkingDir: root,
  entryPoints: ['native/entry.js'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [{
    name: 'native-test-bridge',
    setup(builder) {
      builder.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: 'test-native' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-native' }, () => ({
        contents: 'export const { Capacitor, Filesystem, Directory, Encoding, Share } = globalThis.testPlugins;',
        loader: 'js',
      }));
      builder.onResolve({ filter: /^\.\/app\.js$/ }, () => ({ path: 'app', namespace: 'test-app' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-app' }, () => ({
        contents: 'globalThis.appSawBridge = !!globalThis.GymTrackNative;',
        loader: 'js',
      }));
    },
  }],
}).then(result => result.outputFiles[0].text);

async function nativeAdapter(overrides = {}) {
  const operations = [];
  const context = {
    testPlugins: {
      Capacitor: { isNativePlatform: () => true },
      Directory: { Cache: 'CACHE' },
      Encoding: { UTF8: 'utf8' },
      Filesystem: {
        writeFile: async options => { operations.push(['write', options]); return { uri: `file:///cache/${options.path}` }; },
        deleteFile: async options => { operations.push(['delete', options]); },
        ...overrides.Filesystem,
      },
      Share: {
        canShare: async () => ({ value: true }),
        share: async options => { operations.push(['share', options]); return { activityType: '' }; },
        ...overrides.Share,
      },
    },
  };
  const classes = [];
  const document = { documentElement: { classList: { add: value => classes.push(value) } } };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('globalThis', 'document', await nativeBundle)(context, document);
  assert.equal(context.appSawBridge, true, 'The app sees the native adapter before it starts');
  assert.ok(classes.includes('native-app'));
  return { adapter: context.GymTrackNative, operations };
}

const filename = 'gymtrack-respaldo-2026-10-21.json';

test('native backup writes the original JSON to cache, shares its file URI and removes only that temporary copy', async () => {
  const { adapter, operations } = await nativeAdapter();
  const text = '{"profile":{"name":"María"},"days":{}}';
  assert.equal(await adapter.exportBackup(text, filename), 'shared', 'An empty activityType can still mean success on iOS');
  assert.deepEqual(operations.map(([operation]) => operation), ['write', 'share', 'delete']);
  assert.deepEqual(operations[0][1], {
    path: `gymtrack-backups/${filename}`, directory: 'CACHE', data: text, encoding: 'utf8', recursive: true,
  });
  assert.deepEqual(operations[1][1].files, [`file:///cache/gymtrack-backups/${filename}`]);
  assert.deepEqual(operations[2][1], { path: `gymtrack-backups/${filename}`, directory: 'CACHE' });
});

test('dismissing the iOS share sheet is a cancellation and still clears the temporary backup', async () => {
  const { adapter, operations } = await nativeAdapter({
    Share: { share: async () => { throw new Error('Share canceled'); } },
  });
  assert.equal(await adapter.exportBackup('{}', filename), 'cancelled');
  assert.deepEqual(operations.map(([operation]) => operation), ['write', 'delete']);
});

test('real native share failures are reported after cleanup, while cleanup failure cannot overwrite success', async () => {
  const failed = await nativeAdapter({ Share: { share: async () => { throw new Error('File is unreadable'); } } });
  await assert.rejects(failed.adapter.exportBackup('{}', filename), /No se pudo compartir/);
  assert.deepEqual(failed.operations.map(([operation]) => operation), ['write', 'delete']);
  const succeeded = await nativeAdapter({ Filesystem: { deleteFile: async () => { throw new Error('Already removed'); } } });
  assert.equal(await succeeded.adapter.exportBackup('{}', filename), 'shared');
});

test('unavailable sharing, invalid filenames and full storage never share an unusable backup', async () => {
  const unavailable = await nativeAdapter({ Share: { canShare: async () => ({ value: false }) } });
  await assert.rejects(unavailable.adapter.exportBackup('{}', filename));
  assert.deepEqual(unavailable.operations, []);
  const invalid = await nativeAdapter();
  for (const name of ['../diary.json', '/Documents/private.json', 'gymtrack-respaldo-2026-10-21.json/../../diary']) {
    await assert.rejects(invalid.adapter.exportBackup('{}', name));
  }
  assert.deepEqual(invalid.operations, []);
  const full = await nativeAdapter({ Filesystem: { writeFile: async () => { throw new Error('Disk full'); } } });
  await assert.rejects(full.adapter.exportBackup('{}', filename), /Disk full/);
  assert.deepEqual(full.operations, []);
});

test('native config rejects remote live reload and a different bundle identity', () => {
  const config = { appId: 'mx.gymtrack.nutricion', appName: 'GymTrack', webDir: 'build/native-web' };
  verifyNativeConfiguration(config);
  assert.throws(() => verifyNativeConfiguration({ ...config, server: { url: 'https://example.com' } }), /server.url/);
  assert.throws(() => verifyNativeConfiguration({ ...config, server: { allowNavigation: ['*'] } }), /navegación remota/);
  assert.throws(() => verifyNativeConfiguration({ ...config, appId: 'com.example.app' }), /identificador/);
  assert.throws(() => verifyNativeConfiguration({ ...config, webDir: 'dist' }), /build\/native-web/);
});

test('offline validation follows HTML, JS and CSS dependencies and rejects missing or remote resources', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'gymtrack-native-assets-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(path.join(fixture, 'fonts'));
  await writeFile(path.join(fixture, 'index.html'), '<link rel="stylesheet" href="./styles.css"><script type="module" src="./entry.js"></script><a href="https://www.ars.usda.gov/">Fuente</a>');
  await writeFile(path.join(fixture, 'styles.css'), '@font-face { src: url("./fonts/local.woff2"); }');
  await writeFile(path.join(fixture, 'fonts/local.woff2'), 'offline font fixture');
  await writeFile(path.join(fixture, 'entry.js'), 'await import("./app.js");');
  await writeFile(path.join(fixture, 'app.js'), 'import { foods } from "./foods.js";');
  await writeFile(path.join(fixture, 'foods.js'), 'export const foods = [];');
  assert.deepEqual(await verifyLocalAssets(fixture), ['app.js', 'entry.js', 'fonts/local.woff2', 'foods.js', 'index.html', 'styles.css']);
  await rm(path.join(fixture, 'foods.js'));
  await assert.rejects(verifyLocalAssets(fixture), /Falta el recurso local.*foods.js/);
  await writeFile(path.join(fixture, 'foods.js'), 'export const foods = [];');
  await writeFile(path.join(fixture, 'styles.css'), '@import "https://cdn.example.com/styles.css";');
  await assert.rejects(verifyLocalAssets(fixture), /Recurso remoto/);
  await writeFile(path.join(fixture, 'styles.css'), '');
  await writeFile(path.join(fixture, 'entry.js'), 'import { Capacitor } from "@capacitor/core";');
  await assert.rejects(verifyLocalAssets(fixture), /Importación sin empaquetar/);
  await writeFile(path.join(fixture, 'entry.js'), 'import "../outside.js";');
  await assert.rejects(verifyLocalAssets(fixture), /sale del paquete/);
});

function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  // PNG CRC is irrelevant to this verifier's dimensions/transparency checks.
  return chunk;
}

test('iOS icon verification requires a complete, opaque 1024 pixel RGB image', () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1024);
  header.writeUInt32BE(1024, 4);
  header[8] = 8;
  header[9] = 2;
  const makePNG = (ihdr, extra = []) => Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    ...extra,
    pngChunk('IDAT', deflateSync(Buffer.alloc((1024 * 3 + 1) * 1024))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  const png = makePNG(header);
  verifyAppIcon(png);
  const small = Buffer.from(header);
  small.writeUInt32BE(512);
  assert.throws(() => verifyAppIcon(makePNG(small)), /1024/);
  const alpha = Buffer.from(header);
  alpha[9] = 6;
  assert.throws(() => verifyAppIcon(makePNG(alpha)), /RGB sin canal alfa/);
  assert.throws(() => verifyAppIcon(makePNG(header, [pngChunk('tRNS', Buffer.alloc(6))])), /transparencia/);
  assert.throws(() => verifyAppIcon(png.subarray(0, -4)), /truncado|incompleto/);
});
