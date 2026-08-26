import { test } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════
// SERVER INTEGRATION TEST
// Verifica que el servidor sirve app.js, cl-taxonomy.js y que funciona en Rails
// ═══════════════════════════════════════════════════════════════════════════

const PORT = 3001; // Use different port to avoid conflicts
let server = null;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn('node', ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT }
    });

    server.on('error', reject);

    // Wait for server to start
    let attempts = 0;
    const checkServer = () => {
      const req = http.get(`http://localhost:${PORT}/`, (res) => {
        if (res.statusCode === 200) {
          req.destroy();
          resolve();
        } else {
          attempts++;
          if (attempts > 20) reject(new Error('Server failed to start'));
          else setTimeout(checkServer, 100);
        }
      });

      req.on('error', () => {
        attempts++;
        if (attempts > 20) reject(new Error('Server connection failed'));
        else setTimeout(checkServer, 100);
      });
    };

    setTimeout(checkServer, 200);
  });
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${PORT}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`Request timeout for ${path}`));
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.kill();
      setTimeout(resolve, 500);
    } else {
      resolve();
    }
  });
}

test('Server Integration Tests', async (t) => {
  // Start server before tests
  try {
    await startServer();
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }

  try {
    // ─── Test 1: GET / returns 200 with index.html ───
    await t.test('✓ GET / returns 200 with index.html', async () => {
      const result = await makeRequest('/');
      assert.equal(result.status, 200, 'Should return 200');
      assert.ok(
        result.body.includes('<!DOCTYPE html>'),
        'Should return HTML'
      );
      assert.ok(
        result.body.includes('Savvy Scanner'),
        'Should contain page title'
      );
    });

    // ─── Test 2: GET /app.js without query string ───
    await t.test('✓ GET /app.js (no query) returns 200 with correct MIME', async () => {
      const result = await makeRequest('/app.js');
      assert.equal(result.status, 200, 'Should return 200');
      assert.match(
        result.headers['content-type'],
        /javascript/,
        'Should have JavaScript MIME type'
      );
      assert.ok(
        result.body.includes('openClothing'),
        'Should contain openClothing function'
      );
    });

    // ─── Test 3: GET /app.js WITH query string (cache busting) ───
    await t.test('✓ GET /app.js?v=20260824-02 returns 200 (query string handled)', async () => {
      const result = await makeRequest('/app.js?v=20260824-02');
      assert.equal(result.status, 200, `Should return 200, got ${result.status}`);
      assert.match(
        result.headers['content-type'],
        /javascript/,
        'Should have JavaScript MIME type'
      );
      assert.ok(
        result.body.length > 1000,
        'Should return full app.js file'
      );
    });

    // ─── Test 4: GET /taxonomy/cl-taxonomy.js without query ───
    await t.test('✓ GET /taxonomy/cl-taxonomy.js (no query) returns 200', async () => {
      const result = await makeRequest('/taxonomy/cl-taxonomy.js');
      assert.equal(result.status, 200, 'Should return 200');
      assert.match(
        result.headers['content-type'],
        /javascript/,
        'Should have JavaScript MIME type'
      );
      assert.ok(
        result.body.includes('ClTaxonomy'),
        'Should contain ClTaxonomy object'
      );
    });

    // ─── Test 5: GET /taxonomy/cl-taxonomy.js WITH query string ───
    await t.test('✓ GET /taxonomy/cl-taxonomy.js?v=20260824-02 returns 200', async () => {
      const result = await makeRequest('/taxonomy/cl-taxonomy.js?v=20260824-02');
      assert.equal(result.status, 200, `Should return 200, got ${result.status}`);
      assert.match(
        result.headers['content-type'],
        /javascript/,
        'Should have JavaScript MIME type'
      );
    });

    // ─── Test 6: Path traversal protection ───
    await t.test('✓ Path traversal blocked (security)', async () => {
      const result = await makeRequest('/../../../etc/passwd');
      assert.ok(
        result.status >= 400,
        'Should block path traversal'
      );
    });

    // ─── Test 7: MIME types correct ───
    await t.test('✓ MIME types correct for all file types', async () => {
      const testCases = [
        { path: '/index.html', mime: 'text/html' },
        { path: '/app.js', mime: 'application/javascript' },
        { path: '/taxonomy/cl-taxonomy.js', mime: 'application/javascript' }
      ];

      for (const testCase of testCases) {
        const result = await makeRequest(testCase.path);
        assert.ok(
          result.headers['content-type'].includes(testCase.mime),
          `${testCase.path} should have ${testCase.mime} MIME type, got ${result.headers['content-type']}`
        );
      }
    });

    // ─── Test 8: index.html contains both script tags ───
    await t.test('✓ index.html loads app.js and cl-taxonomy.js', async () => {
      const result = await makeRequest('/');
      assert.ok(
        result.body.includes('<script src="app.js?v='),
        'Should load app.js'
      );
      assert.ok(
        result.body.includes('<script src="taxonomy/cl-taxonomy.js?v='),
        'Should load taxonomy'
      );
    });

    // ─── Test 9: Cache headers set ───
    await t.test('✓ Cache headers set correctly', async () => {
      const htmlResult = await makeRequest('/');
      const jsResult = await makeRequest('/app.js');

      assert.ok(
        htmlResult.headers['cache-control'],
        'HTML should have cache header'
      );
      assert.ok(
        jsResult.headers['cache-control'],
        'JS should have cache header'
      );
    });

    // ─── Test 10: 404 for non-existent files ───
    await t.test('✓ 404 for non-existent files', async () => {
      const result = await makeRequest('/nonexistent-file-12345.js');
      assert.equal(result.status, 404, 'Should return 404');
    });

    // ─── Test 11: HTML structure validation ───
    await t.test('✓ HTML contains required elements and script tags', async () => {
      const result = await makeRequest('/');

      // Check for key elements using regex
      assert.ok(
        result.body.includes('class="dash-card clothing'),
        'Should have Clothing card'
      );
      assert.ok(
        /script[^>]*src[^>]*app\.js/i.test(result.body),
        'Should have app.js script tag'
      );
      assert.ok(
        /script[^>]*src[^>]*cl-taxonomy\.js/i.test(result.body),
        'Should have taxonomy script tag'
      );
    });

    // ─── Test 12: Files exist in filesystem ───
    await t.test('✓ All required files exist and are readable', async () => {
      const files = [
        './index.html',
        './app.js',
        './taxonomy/cl-taxonomy.js',
        './server.js'
      ];

      for (const file of files) {
        assert.ok(
          fs.existsSync(file),
          `File ${file} should exist`
        );
        const stats = fs.statSync(file);
        assert.ok(
          stats.size > 0,
          `File ${file} should not be empty`
        );
      }
    });

    // ─── Test 13: Verify openClothing function exists in app.js ───
    await t.test('✓ openClothing function defined in app.js', async () => {
      const result = await makeRequest('/app.js');
      assert.match(
        result.body,
        /function\s+openClothing\s*\(\s*\)/,
        'Should define openClothing function'
      );
    });

    // ─── Test 14: Verify getFromIndexedDB function exists in app.js ───
    await t.test('✓ getFromIndexedDB function defined in app.js', async () => {
      const result = await makeRequest('/app.js');
      assert.match(
        result.body,
        /async\s+function\s+getFromIndexedDB/,
        'Should define getFromIndexedDB function'
      );
    });

    // ─── Test 15: Query string doesn't break file resolution ───
    await t.test('✓ Multiple query parameters handled correctly', async () => {
      const result = await makeRequest('/app.js?v=123&cb=456');
      assert.equal(result.status, 200, 'Should handle multiple query params');
    });

  } finally {
    // Stop server after tests
    await stopServer();
  }
});
