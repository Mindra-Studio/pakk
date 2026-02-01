#!/usr/bin/env node
/**
 * Collect training data from node_modules for dictionary training
 */

const fs = require('fs');
const path = require('path');

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');
const OUTPUT_DIR = path.join(__dirname, '..', 'training-data', 'node_modules');

// File types to collect
const PATTERNS = {
  'package-json': { ext: 'package.json', maxSize: 50000, minSize: 200 },
  'js': { ext: '.js', maxSize: 100000, minSize: 500 },
  'dts': { ext: '.d.ts', maxSize: 100000, minSize: 500 },
  'mjs': { ext: '.mjs', maxSize: 100000, minSize: 500 },
  'cjs': { ext: '.cjs', maxSize: 100000, minSize: 500 },
  'json': { ext: '.json', maxSize: 50000, minSize: 100 },
};

// Ensure output dir exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Clear output dir
for (const file of fs.readdirSync(OUTPUT_DIR)) {
  fs.unlinkSync(path.join(OUTPUT_DIR, file));
}

let fileCount = 0;
let totalSize = 0;

function walkDir(dir, callback) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip .bin and some large dirs
        if (entry.name !== '.bin' && entry.name !== '.cache') {
          walkDir(fullPath, callback);
        }
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  } catch (e) {
    // Skip inaccessible dirs
  }
}

function shouldCollect(filePath) {
  const name = path.basename(filePath);

  for (const [type, config] of Object.entries(PATTERNS)) {
    if (name === config.ext || filePath.endsWith(config.ext)) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size >= config.minSize && stat.size <= config.maxSize) {
          return { type, size: stat.size };
        }
      } catch (e) {}
    }
  }
  return null;
}

console.log('Collecting training data from node_modules...\n');

const collected = {};

walkDir(NODE_MODULES, (filePath) => {
  const info = shouldCollect(filePath);
  if (info) {
    if (!collected[info.type]) {
      collected[info.type] = [];
    }
    collected[info.type].push({ path: filePath, size: info.size });
  }
});

// Copy files with unique names
for (const [type, files] of Object.entries(collected)) {
  console.log(`${type}: ${files.length} files`);

  // Sort by size and take up to 500 files per type
  files.sort((a, b) => a.size - b.size);
  const selected = files.slice(0, 500);

  for (let i = 0; i < selected.length; i++) {
    const file = selected[i];
    const ext = path.extname(file.path) || '.json';
    const outputName = `${type}-${String(i).padStart(4, '0')}${ext}`;
    const outputPath = path.join(OUTPUT_DIR, outputName);

    try {
      fs.copyFileSync(file.path, outputPath);
      fileCount++;
      totalSize += file.size;
    } catch (e) {}
  }
}

console.log(`\nCollected ${fileCount} files (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Output: ${OUTPUT_DIR}`);
