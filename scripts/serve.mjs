import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const isInsideRoot = (candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);
const respond = (response, status, message) => {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(message);
};

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return respond(response, 405, 'Método no permitido.');
  }
  try {
    const requestTarget = (request.url || '/').split('?')[0];
    let pathname;
    try { pathname = decodeURIComponent(requestTarget); } catch { return respond(response, 400, 'Ruta incorrecta.'); }
    if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\') ||
        pathname.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
      return respond(response, 403, 'Ruta no permitida.');
    }
    const relative = pathname.replace(/^\/+/, '');
    const destination = path.resolve(root, relative || 'index.html');
    if (!isInsideRoot(destination)) return respond(response, 403, 'Ruta no permitida.');
    let filePath = await realpath(destination);
    if (!isInsideRoot(filePath)) return respond(response, 403, 'Ruta no permitida.');
    let details = await stat(filePath);
    if (details.isDirectory()) {
      filePath = await realpath(path.join(filePath, 'index.html'));
      if (!isInsideRoot(filePath)) return respond(response, 403, 'Ruta no permitida.');
      details = await stat(filePath);
    }
    if (!details.isFile()) return respond(response, 404, 'Archivo no encontrado.');
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': details.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(filePath);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch (error) {
    respond(response, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,
      error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Archivo no encontrado.' : 'No se pudo leer el archivo.');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`GymTrack disponible en http://localhost:${port}`);
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `El puerto ${port} ya está en uso.` : 'No se pudo iniciar GymTrack.');
  process.exitCode = 1;
});
