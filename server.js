#!/usr/bin/env node
/**
 * Servidor Node.js para servir Clothing & Shoes como aplicación estática.
 *
 * Diseñado para Railway:
 * - Sirve index.html en /
 * - Sirve archivos estáticos con MIME correcto
 * - Bloquea path traversal
 * - No expone secretos
 * - Usa process.env.PORT para configurar puerto
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Tipos MIME comunes
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  // Parse URL de forma segura, extrayendo solo pathname
  // Ignora query strings (?...) y fragments (#...)
  const requestUrl = new URL(req.url, 'http://localhost');
  let urlPath = decodeURIComponent(requestUrl.pathname);

  // Bloquear path traversal
  if (urlPath.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: Path traversal not allowed');
    return;
  }

  // Raíz → index.html
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }

  // Resolver ruta real
  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Verificar que el archivo está dentro del directorio público
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Intentar leer el archivo
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Si no existe, intentar como directorio → index.html
      if (err.code === 'ENOENT' && !urlPath.endsWith('.html') && !urlPath.endsWith('.js')) {
        const indexPath = path.join(filePath, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexData);
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Determinar Content-Type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Headers de caché
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    };

    // Para archivos HTML, caché más corto
    if (contentType === 'text/html') {
      headers['Cache-Control'] = 'public, max-age=300';
    }

    // Para app.js (app lógica), también caché más corto para detectar cambios
    if (filePath.endsWith('app.js')) {
      headers['Cache-Control'] = 'public, max-age=300';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[Clothing & Shoes] Servidor escuchando en http://0.0.0.0:${PORT}`);
  console.log(`[Clothing & Shoes] Sirviendo desde ${PUBLIC_DIR}`);
});

server.on('error', (err) => {
  console.error('[Clothing & Shoes] Error del servidor:', err);
  process.exit(1);
});
