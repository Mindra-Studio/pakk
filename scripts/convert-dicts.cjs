/**
 * Convert trained ZSTD dictionaries to TypeScript modules
 */
const fs = require('fs');
const path = require('path');

const DICTS_DIR = path.join(__dirname, '..', 'trained-dicts');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'dictionaries');

const dictionaries = [
  { file: 'react.dict', name: 'react', exportName: 'React', description: 'React/Next.js', frameworks: ['react', 'next.js', 'remix'] },
  { file: 'vue.dict', name: 'vue', exportName: 'Vue', description: 'Vue/Nuxt', frameworks: ['vue', 'nuxt'] },
  { file: 'typescript.dict', name: 'typescript', exportName: 'Typescript', description: 'TypeScript', frameworks: ['typescript'] },
  { file: 'javascript.dict', name: 'javascript', exportName: 'Javascript', description: 'JavaScript', frameworks: ['javascript', 'node'] },
  { file: 'css.dict', name: 'css', exportName: 'Css', description: 'CSS/SCSS', frameworks: ['css', 'scss', 'sass', 'less'] },
  { file: 'html.dict', name: 'html', exportName: 'Html', description: 'HTML', frameworks: ['html', 'htm', 'svg'] },
  { file: 'json.dict', name: 'json', exportName: 'Json', description: 'JSON', frameworks: ['json', 'jsonc'] },
  { file: 'python.dict', name: 'python', exportName: 'Python', description: 'Python', frameworks: ['python', 'django', 'flask', 'fastapi'] },
  { file: 'rust.dict', name: 'rust', exportName: 'Rust', description: 'Rust', frameworks: ['rust', 'cargo'] },
  { file: 'go.dict', name: 'go', exportName: 'Go', description: 'Go', frameworks: ['go', 'gin', 'echo'] },
  { file: 'java.dict', name: 'java', exportName: 'Java', description: 'Java', frameworks: ['java', 'spring', 'maven'] },
  { file: 'c.dict', name: 'c', exportName: 'C', description: 'C', frameworks: ['c'] },
  { file: 'cpp.dict', name: 'cpp', exportName: 'Cpp', description: 'C++', frameworks: ['cpp', 'c++', 'qt'] },
  { file: 'node_modules.dict', name: 'node_modules', exportName: 'NodeModules', description: 'Node Modules (CI/CD)', frameworks: ['npm', 'node_modules', 'pnpm', 'yarn'] },
];

for (const dict of dictionaries) {
  const inputPath = path.join(DICTS_DIR, dict.file);
  const outputPath = path.join(OUTPUT_DIR, `${dict.name}.dict.ts`);

  if (!fs.existsSync(inputPath)) {
    console.log(`Skipping ${dict.file} - not found`);
    continue;
  }

  const buffer = fs.readFileSync(inputPath);
  const base64 = buffer.toString('base64');

  const tsContent = `/**
 * PAKK Trained ZSTD Dictionary for ${dict.description}
 *
 * This is a REAL trained ZSTD dictionary (not just text patterns).
 * Trained using: zstd --train on sample ${dict.description} files.
 *
 * Size: ${buffer.length} bytes
 * Generated: ${new Date().toISOString()}
 */

import type { DictionaryMeta } from '../core/types.js';

// Base64-encoded trained ZSTD dictionary
const DICTIONARY_BASE64 = '${base64}';

let cachedDictionary: Buffer | null = null;

export function get${dict.exportName}Dictionary(): Buffer {
  if (!cachedDictionary) {
    cachedDictionary = Buffer.from(DICTIONARY_BASE64, 'base64');
  }
  return cachedDictionary;
}

export const ${dict.exportName.toUpperCase()}_DICTIONARY_META: DictionaryMeta = {
  name: '${dict.description} Dictionary',
  version: '2.0.0',
  description: 'Trained ZSTD dictionary optimized for ${dict.description} code compression',
  frameworks: ${JSON.stringify(dict.frameworks)},
  sizeBytes: ${buffer.length},
  patternCount: 0, // Trained dictionary - patterns are internal
  trainedOn: ['sample ${dict.name} files'],
};
`;

  fs.writeFileSync(outputPath, tsContent);
  console.log(`Generated ${dict.name}.dict.ts (${buffer.length} bytes)`);
}

console.log('\nDone! All dictionaries converted.');
