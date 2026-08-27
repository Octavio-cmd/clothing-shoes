/**
 * legacy-config-removal.test.mjs
 * Regression tests to ensure savvy-config Railway endpoint removal is complete.
 * These tests read actual source files to prevent old references from returning.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(__dirname, '..', 'app.js');
const indexPath = join(__dirname, '..', 'index.html');

const appContent = readFileSync(appPath, 'utf8');
const indexContent = readFileSync(indexPath, 'utf8');

describe('Legacy Config Client Removal', () => {

  // Removed references (should NOT exist)

  test('01: No Railway savvy-config endpoint URL', () => {
    assert(!appContent.includes('savvy-config-production.up.railway.app'),
      'Railway savvy-config endpoint must be removed from app.js');
    assert(!indexContent.includes('savvy-config-production.up.railway.app'),
      'Railway savvy-config endpoint must be removed from index.html');
  });

  test('02: No SAVVY_CONFIG constant', () => {
    assert(!appContent.includes("const SAVVY_CONFIG="),
      'SAVVY_CONFIG constant must not exist');
    assert(!appContent.match(/\bSAVVY_CONFIG\s*=/),
      'SAVVY_CONFIG assignment must not exist');
  });

  test('03: No fetch to /config endpoint', () => {
    assert(!appContent.includes("fetch('/config'"),
      'fetch to /config endpoint must be removed');
    assert(!appContent.includes('fetch("/config"'),
      'fetch to /config endpoint must be removed (double quotes)');
  });

  test('04: No keyIn input element', () => {
    assert(!indexContent.includes('id="keyIn"'),
      'keyIn input element must be removed from HTML');
  });

  test('05: No saveKey function', () => {
    assert(!appContent.includes('function saveKey('),
      'saveKey function must not exist in app.js');
    assert(!appContent.includes('const saveKey = '),
      'saveKey must not be defined as const');
  });

  test('06: No ANTHROPIC API KEY label', () => {
    assert(!indexContent.includes('API KEY — ANTHROPIC'),
      'ANTHROPIC API KEY label must be removed from HTML');
  });

  test('07: No /api/imgbb-key endpoint call', () => {
    assert(!appContent.includes("'/api/imgbb-key'"),
      '/api/imgbb-key endpoint must be removed from app.js');
    assert(!appContent.includes('"/api/imgbb-key"'),
      '/api/imgbb-key endpoint must be removed (double quotes)');
  });

  // Preserved references (MUST exist)

  test('08: SAVVY_API constant exists', () => {
    assert(appContent.includes('const SAVVY_API = '),
      'SAVVY_API constant must be preserved');
  });

  test('09: /auth/login endpoint exists', () => {
    assert(appContent.includes("'/auth/login'") || appContent.includes('"/auth/login"'),
      '/auth/login endpoint must be preserved for authentication');
  });

  test('10: /api/claude endpoint exists', () => {
    assert(appContent.includes("'/api/claude'") || appContent.includes('"/api/claude"'),
      '/api/claude endpoint must be preserved for Claude integration');
  });

  test('11: Bearer token authorization exists', () => {
    assert(appContent.includes("'Authorization': 'Bearer '") ||
           appContent.includes('"Authorization": "Bearer "') ||
           appContent.includes("'Authorization'") && appContent.includes("'Bearer '"),
      'Bearer token authorization must be preserved for API calls');
  });

  test('12: /api/img-upload endpoint exists', () => {
    assert(appContent.includes("'/api/img-upload'") || appContent.includes('"/api/img-upload"'),
      '/api/img-upload endpoint must be preserved for image uploads');
  });

  test('13: cl_sheets_url configuration key exists', () => {
    assert(appContent.includes("'cl_sheets_url'") || appContent.includes('"cl_sheets_url"'),
      'cl_sheets_url key must be preserved for manual configuration');
  });

  test('14: CSV functions preserved', () => {
    assert(appContent.includes('clBuildCsvMeasurements'),
      'clBuildCsvMeasurements function must be preserved');
    assert(appContent.includes('clIsTShirt'),
      'clIsTShirt function must be preserved');
    assert(appContent.includes('clBuildConditionText'),
      'clBuildConditionText function must be preserved');
  });

  test('15: Staging flags unchanged', () => {
    assert(appContent.includes('CL_PROTECTED_IMAGE_UPLOAD_ENABLED'),
      'CL_PROTECTED_IMAGE_UPLOAD_ENABLED flag must exist');
    assert(appContent.includes('CL_MEASUREMENT_AI_ENABLED'),
      'CL_MEASUREMENT_AI_ENABLED flag must exist');
  });

});
