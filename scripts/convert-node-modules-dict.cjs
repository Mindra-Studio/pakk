/**
 * Convert node_modules.dict to TypeScript module
 */
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'trained-dicts', 'node_modules.dict');
const outputPath = path.join(__dirname, '..', 'src', 'dictionaries', 'node_modules.dict.ts');

const buffer = fs.readFileSync(inputPath);
const base64 = buffer.toString('base64');
const size = buffer.length;
const date = new Date().toISOString();

const tsContent = `/**
 * PAKK Trained ZSTD Dictionary for Node Modules (CI/CD)
 *
 * Optimized for npm package structures: JS bundles, package.json, .d.ts
 * Trained on pakk-entrainement: npm packages, lodash, moment, axios, etc.
 *
 * Size: ${size} bytes (512 KB)
 * Generated: ${date}
 */

import type { DictionaryMeta } from '../core/types.js';

// Base64-encoded trained ZSTD dictionary
const DICTIONARY_BASE64 = '${base64}';

let cachedDictionary: Buffer | null = null;

export function getNodeModulesDictionary(): Buffer {
  if (!cachedDictionary) {
    cachedDictionary = Buffer.from(DICTIONARY_BASE64, 'base64');
  }
  return cachedDictionary;
}

export const NODE_MODULES_DICTIONARY_META: DictionaryMeta = {
  name: 'Node Modules Dictionary',
  version: '2.0.0',
  description: 'Trained ZSTD dictionary optimized for node_modules/CI cache compression',
  frameworks: ['npm', 'node_modules', 'pnpm', 'yarn', 'ci-cache'],
  sizeBytes: ${size},
  patternCount: 0,
  trainedOn: ['npm packages', 'package.json', 'TypeScript declarations'],
};
`;

fs.writeFileSync(outputPath, tsContent);
console.log('✓ node_modules.dict.ts generated');
console.log('  Size: ' + size + ' bytes (' + Math.round(size / 1024) + ' KB)');
console.log('  Base64: ' + base64.length + ' chars');
console.log('  Output: ' + outputPath);
