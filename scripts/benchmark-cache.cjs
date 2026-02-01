#!/usr/bin/env node
/**
 * Benchmark PAKK cache vs standard compression methods
 * Cross-platform (Windows + Unix)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PAKK_DIR = path.join(__dirname, '..');
const NODE_MODULES = path.join(PAKK_DIR, 'node_modules');
const TEMP_DIR = path.join(PAKK_DIR, '.benchmark-temp');
const IS_WINDOWS = os.platform() === 'win32';

// Ensure temp dir exists
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DIR, { recursive: true });

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

function getSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function getDirSize(dirPath) {
  let total = 0;
  let count = 0;

  function walk(dir) {
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          walk(fullPath);
        } else {
          try {
            total += fs.statSync(fullPath).size;
            count++;
          } catch {}
        }
      }
    } catch {}
  }

  walk(dirPath);
  return { size: total, count };
}

function benchmark(name, fn) {
  const start = Date.now();
  const result = fn();
  const elapsed = Date.now() - start;
  return { name, elapsed, ...result };
}

function runCommand(cmd, options = {}) {
  try {
    return execSync(cmd, {
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      ...options
    });
  } catch (e) {
    return null;
  }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          PAKK Cache Benchmark vs Standard Methods           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Get original size
const { size: originalSize, count: fileCount } = getDirSize(NODE_MODULES);

console.log(`Source: node_modules`);
console.log(`Original size: ${formatBytes(originalSize)}`);
console.log(`File count: ${fileCount.toLocaleString()}`);
console.log(`Platform: ${os.platform()}\n`);
console.log('─'.repeat(65));

const results = [];

// 1. tar + gzip (GitHub Actions default)
console.log('\n[1/3] tar + gzip (actions/cache default)...');
const gzipResult = benchmark('tar+gzip', () => {
  const output = path.join(TEMP_DIR, 'nm-gzip.tar.gz');
  if (IS_WINDOWS) {
    // Use tar on Windows (available since Windows 10)
    runCommand(`tar -czf "${output}" -C "${PAKK_DIR}" node_modules`);
  } else {
    runCommand(`tar czf "${output}" -C "${PAKK_DIR}" node_modules`);
  }
  return { size: getSize(output), file: output };
});
results.push(gzipResult);
console.log(`      Size: ${formatBytes(gzipResult.size)} | Time: ${formatTime(gzipResult.elapsed)}`);

// 2. tar + zstd (GitHub Actions with zstd)
console.log('\n[2/3] tar + zstd (actions/cache with zstd)...');
const zstdResult = benchmark('tar+zstd', () => {
  const tarOutput = path.join(TEMP_DIR, 'nm.tar');
  const zstdOutput = path.join(TEMP_DIR, 'nm-zstd.tar.zst');

  // Create tar first
  runCommand(`tar -cf "${tarOutput}" -C "${PAKK_DIR}" node_modules`);

  // Then compress with zstd
  runCommand(`zstd -11 -f "${tarOutput}" -o "${zstdOutput}"`);

  // Cleanup tar
  try { fs.unlinkSync(tarOutput); } catch {}

  return { size: getSize(zstdOutput), file: zstdOutput };
});
results.push(zstdResult);
console.log(`      Size: ${formatBytes(zstdResult.size)} | Time: ${formatTime(zstdResult.elapsed)}`);

// 3. PAKK cache (with dictionaries)
console.log('\n[3/3] PAKK cache (with dictionaries)...');
const pakkCacheDir = path.join(TEMP_DIR, 'pakk-cache');
const pakkResult = benchmark('pakk-cache', () => {
  const cliPath = path.join(PAKK_DIR, 'dist', 'cli', 'index.js');
  runCommand(
    `node "${cliPath}" cache save "${NODE_MODULES}" --key "benchmark-test" --cache-dir "${pakkCacheDir}"`,
    { cwd: PAKK_DIR }
  );
  const { size } = getDirSize(pakkCacheDir);
  return { size, file: pakkCacheDir };
});
results.push(pakkResult);
console.log(`      Size: ${formatBytes(pakkResult.size)} | Time: ${formatTime(pakkResult.elapsed)}`);

// Summary
console.log('\n' + '═'.repeat(65));
console.log('                         SUMMARY');
console.log('═'.repeat(65));
console.log('\n  Method             Compressed    Ratio     Time       vs gzip');
console.log('  ' + '─'.repeat(61));

const baseline = gzipResult.size;
for (const r of results) {
  const ratio = ((r.size / originalSize) * 100).toFixed(1) + '%';
  const vsGzip = (((baseline - r.size) / baseline) * 100).toFixed(0);
  const vsSign = r.size < baseline ? '+' : '';
  console.log(
    `  ${r.name.padEnd(18)} ${formatBytes(r.size).padStart(10)}    ${ratio.padStart(5)}    ${formatTime(r.elapsed).padStart(7)}    ${vsSign}${vsGzip}%`
  );
}

console.log('\n  ' + '─'.repeat(61));

if (pakkResult.size > 0 && gzipResult.size > 0) {
  const pakkVsGzip = (((gzipResult.size - pakkResult.size) / gzipResult.size) * 100).toFixed(0);
  const pakkVsZstd = zstdResult.size > 0
    ? (((zstdResult.size - pakkResult.size) / zstdResult.size) * 100).toFixed(0)
    : 'N/A';

  if (pakkResult.size < gzipResult.size) {
    console.log(`  PAKK saves ${formatBytes(gzipResult.size - pakkResult.size)} vs gzip (+${pakkVsGzip}%)`);
  } else {
    console.log(`  PAKK is ${formatBytes(pakkResult.size - gzipResult.size)} larger than gzip (${pakkVsGzip}%)`);
  }

  if (zstdResult.size > 0) {
    if (pakkResult.size < zstdResult.size) {
      console.log(`  PAKK saves ${formatBytes(zstdResult.size - pakkResult.size)} vs zstd (+${pakkVsZstd}%)`);
    } else {
      console.log(`  PAKK is ${formatBytes(pakkResult.size - zstdResult.size)} larger than zstd (${pakkVsZstd}%)`);
    }
  }
}

// CI/CD cost calculation
const ciMinutesCost = 0.008; // GitHub Actions Linux
const sizeDiffMB = (gzipResult.size - pakkResult.size) / (1024 * 1024);
const transferSpeedMBps = 50; // Typical GitHub Actions network speed
const timeSavedPerBuild = (sizeDiffMB / transferSpeedMBps) * 2; // upload + download
const buildsPerMonth = 500 * 22; // 500/day * 22 work days
const minutesSavedPerMonth = (timeSavedPerBuild / 60) * buildsPerMonth;
const moneySavedPerMonth = Math.abs(minutesSavedPerMonth * ciMinutesCost);

console.log('\n  ' + '─'.repeat(61));
console.log('  CI/CD Impact (estimated @ 500 builds/day)');
console.log(`  - Size difference: ${formatBytes(Math.abs(gzipResult.size - pakkResult.size))}`);
console.log(`  - Transfer time diff: ~${Math.abs(timeSavedPerBuild).toFixed(1)}s per build`);
console.log(`  - Monthly time: ~${Math.abs(minutesSavedPerMonth).toFixed(0)} minutes`);
console.log(`  - Monthly cost impact: ~$${moneySavedPerMonth.toFixed(0)}`);

// Cleanup
console.log('\n');
try {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
} catch {}
