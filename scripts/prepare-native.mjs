import { cp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'build', 'native-web');
// Verify the resolved target before removing generated files, including any
// existing Windows junctions in the build path.
await mkdir(path.dirname(output), { recursive: true });
const resolvedRoot = await realpath(root);
const resolvedBuild = await realpath(path.dirname(output));
const resolvedOutput = await realpath(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return path.join(resolvedBuild, 'native-web');
});
if (path.relative(resolvedRoot, resolvedBuild) !== 'build'
    || path.relative(resolvedBuild, resolvedOutput) !== 'native-web') {
  throw new Error('La carpeta de recursos generados debe estar dentro de build/native-web del proyecto.');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Copy a deliberate allowlist: no hosting identity, credentials, test diaries,
// service worker or remote Site login is part of the installed application.
for (const file of ['app.js', 'styles.css', 'foods.js', 'nutrition.js', 'storage.js', 'icons']) {
  await cp(path.join(root, 'dist', file), path.join(output, file), { recursive: true });
}
let html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
const originalEntry = '<script type="module" src="./app.js"></script>';
if (html.split(originalEntry).length !== 2) throw new Error('No se encontró una única entrada de la aplicación web.');
html = html.replace(originalEntry, '<script type="module" src="./native-entry.js"></script>')
  .replace(/^\s*<link rel="manifest"[^>]+>\r?\n/m, '');
await writeFile(path.join(output, 'index.html'), html);
const css = await readFile(path.join(output, 'styles.css'), 'utf8');
await writeFile(path.join(output, 'styles.css'), `${css}\n.native-app .topbar{height:calc(65px + env(safe-area-inset-top));padding-top:env(safe-area-inset-top)}\n.native-app .toast{z-index:40}\n`);
await build({
  absWorkingDir: root,
  entryPoints: ['native/entry.js'],
  outfile: path.join(output, 'native-entry.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'safari15.4',
  external: ['./app.js'],
  legalComments: 'linked',
});
console.log('Recursos locales preparados en build/native-web; sin servidor remoto.');
