/**
 * PAKK Full Benchmark Suite
 *
 * Compares: PAKK (ZSTD+dict) vs ZSTD vs Brotli vs Gzip
 * Shows the real value of pre-trained dictionaries
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

// Colors for terminal
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

interface BenchResult {
  algorithm: string;
  size: number;
  ratio: number;
  time: number;
}

interface FileBench {
  name: string;
  originalSize: number;
  results: BenchResult[];
}

// Test files to download
const TEST_FILES = [
  { name: 'jquery.min.js', url: 'https://unpkg.com/jquery@3.7.1/dist/jquery.min.js', dict: 'javascript' },
  { name: 'd3.min.js', url: 'https://unpkg.com/d3@7.8.5/dist/d3.min.js', dict: 'javascript' },
  { name: 'three.min.js', url: 'https://unpkg.com/three@0.160.0/build/three.min.js', dict: 'javascript' },
  { name: 'vue.global.prod.js', url: 'https://unpkg.com/vue@3.4.15/dist/vue.global.prod.js', dict: 'javascript' },
  { name: 'bootstrap.min.css', url: 'https://unpkg.com/bootstrap@5.3.2/dist/css/bootstrap.min.css', dict: 'css' },
  { name: 'chart.min.js', url: 'https://unpkg.com/chart.js@4.4.1/dist/chart.umd.js', dict: 'javascript' },
];

async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;

  console.log(`  Downloading ${basename(dest)}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buffer);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function compressBrotli(data: Buffer, level: number): Buffer {
  return brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: level,
      [constants.BROTLI_PARAM_LGWIN]: 22,
    },
  });
}

function compressGzip(data: Buffer, level: number): Buffer {
  return gzipSync(data, { level });
}

async function runBenchmark(filePath: string, dictType: string): Promise<FileBench> {
  const data = readFileSync(filePath);
  const name = basename(filePath);
  const results: BenchResult[] = [];

  // Import ZSTD
  let zstd: any;
  try {
    zstd = await import('zstd-napi');
  } catch {
    console.error('zstd-napi not available');
    process.exit(1);
  }

  // Import dictionary
  const { getDictionary } = await import('../src/dictionaries/index.js');
  const dict = getDictionary(dictType as any);

  // 1. Gzip-9
  {
    const start = performance.now();
    const compressed = compressGzip(data, 9);
    const time = performance.now() - start;
    results.push({
      algorithm: 'gzip-9',
      size: compressed.length,
      ratio: compressed.length / data.length,
      time: Math.round(time),
    });
  }

  // 2. Brotli-11
  {
    const start = performance.now();
    const compressed = compressBrotli(data, 11);
    const time = performance.now() - start;
    results.push({
      algorithm: 'brotli-11',
      size: compressed.length,
      ratio: compressed.length / data.length,
      time: Math.round(time),
    });
  }

  // 3. ZSTD-19 (sans dictionnaire)
  {
    const start = performance.now();
    const compressed = zstd.compress(data, 19);
    const time = performance.now() - start;
    results.push({
      algorithm: 'zstd-19',
      size: compressed.length,
      ratio: compressed.length / data.length,
      time: Math.round(time),
    });
  }

  // 4. ZSTD-11 (sans dictionnaire, même niveau que Brotli)
  {
    const start = performance.now();
    const compressed = zstd.compress(data, 11);
    const time = performance.now() - start;
    results.push({
      algorithm: 'zstd-11',
      size: compressed.length,
      ratio: compressed.length / data.length,
      time: Math.round(time),
    });
  }

  // 5. PAKK (ZSTD + dictionnaire)
  if (dict) {
    const compressor = new zstd.Compressor();
    compressor.setParameters({ compressionLevel: 11 });
    compressor.loadDictionary(dict);

    const start = performance.now();
    const compressed = compressor.compress(data);
    const time = performance.now() - start;
    results.push({
      algorithm: `PAKK-${dictType}`,
      size: compressed.length,
      ratio: compressed.length / data.length,
      time: Math.round(time),
    });
  }

  // 6. PAKK level 19
  if (dict) {
    const compressor = new zstd.Compressor();
    compressor.setParameters({ compressionLevel: 19 });
    compressor.loadDictionary(dict);

    const start = performance.now();
    const compressed = compressor.compress(data);
    const time = performance.now() - start;
    results.push({
      algorithm: `PAKK-${dictType}-19`,
      size: compressed.length,
      ratio: compressed.length / data.length,
      time: Math.round(time),
    });
  }

  return {
    name,
    originalSize: data.length,
    results,
  };
}

function printResults(benchmarks: FileBench[]) {
  console.log('\n' + colors.bold + '═══════════════════════════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.bold + '                           PAKK BENCHMARK RESULTS' + colors.reset);
  console.log(colors.bold + '═══════════════════════════════════════════════════════════════════════════════' + colors.reset);

  // Summary table
  console.log('\n' + colors.bold + '┌─────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────────┐' + colors.reset);
  console.log(colors.bold + '│       Fichier       │ Original │  gzip-9  │brotli-11 │ zstd-19  │   PAKK   │ PAKK vs BR │' + colors.reset);
  console.log(colors.bold + '├─────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────────┤' + colors.reset);

  let totalOriginal = 0;
  let totalGzip = 0;
  let totalBrotli = 0;
  let totalZstd = 0;
  let totalPakk = 0;

  for (const bench of benchmarks) {
    const gzip = bench.results.find(r => r.algorithm === 'gzip-9');
    const brotli = bench.results.find(r => r.algorithm === 'brotli-11');
    const zstd = bench.results.find(r => r.algorithm === 'zstd-19');
    const pakk = bench.results.find(r => r.algorithm.startsWith('PAKK-') && !r.algorithm.endsWith('-19'));

    if (!gzip || !brotli || !zstd || !pakk) continue;

    totalOriginal += bench.originalSize;
    totalGzip += gzip.size;
    totalBrotli += brotli.size;
    totalZstd += zstd.size;
    totalPakk += pakk.size;

    const improvement = Math.round((1 - pakk.size / brotli.size) * 100);
    const improvementStr = improvement > 0
      ? colors.green + `+${improvement}%` + colors.reset
      : colors.red + `${improvement}%` + colors.reset;

    console.log(
      `│ ${bench.name.substring(0, 19).padEnd(19)} │ ` +
      `${formatBytes(bench.originalSize).padStart(8)} │ ` +
      `${formatBytes(gzip.size).padStart(8)} │ ` +
      `${formatBytes(brotli.size).padStart(8)} │ ` +
      `${formatBytes(zstd.size).padStart(8)} │ ` +
      `${formatBytes(pakk.size).padStart(8)} │ ` +
      `${improvementStr.padStart(10 + (improvement > 0 ? colors.green.length + colors.reset.length : colors.red.length + colors.reset.length))} │`
    );
  }

  console.log(colors.bold + '├─────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────────┤' + colors.reset);

  const totalImprovement = Math.round((1 - totalPakk / totalBrotli) * 100);
  const totalImprovementStr = colors.green + colors.bold + `+${totalImprovement}%` + colors.reset;

  console.log(
    colors.bold + `│ TOTAL               │ ` +
    `${formatBytes(totalOriginal).padStart(8)} │ ` +
    `${formatBytes(totalGzip).padStart(8)} │ ` +
    `${formatBytes(totalBrotli).padStart(8)} │ ` +
    `${formatBytes(totalZstd).padStart(8)} │ ` +
    `${formatBytes(totalPakk).padStart(8)} │ ` + colors.reset +
    `${totalImprovementStr.padStart(10 + colors.green.length + colors.bold.length + colors.reset.length)} │`
  );

  console.log(colors.bold + '└─────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────────────┘' + colors.reset);

  // Key insight
  console.log('\n' + colors.bold + '📊 ANALYSE' + colors.reset);
  console.log(colors.dim + '─'.repeat(79) + colors.reset);

  const zstdVsBrotli = Math.round((1 - totalZstd / totalBrotli) * 100);
  const pakkVsZstd = Math.round((1 - totalPakk / totalZstd) * 100);

  console.log(`\n  ${colors.cyan}ZSTD-19 vs Brotli-11:${colors.reset}  ${zstdVsBrotli > 0 ? '+' : ''}${zstdVsBrotli}% ${zstdVsBrotli < 0 ? '(Brotli gagne)' : ''}`);
  console.log(`  ${colors.cyan}PAKK vs ZSTD-19:${colors.reset}       +${pakkVsZstd}% ${colors.green}(gain des dictionnaires)${colors.reset}`);
  console.log(`  ${colors.cyan}PAKK vs Brotli-11:${colors.reset}     ${colors.green}+${totalImprovement}%${colors.reset}`);

  console.log('\n' + colors.bold + '💡 CONCLUSION' + colors.reset);
  console.log(colors.dim + '─'.repeat(79) + colors.reset);
  console.log(`
  ${colors.yellow}ZSTD seul${colors.reset} n'est PAS meilleur que Brotli sur du code web.
  La vraie valeur de PAKK vient des ${colors.green}dictionnaires pré-entraînés${colors.reset}.

  Sans dictionnaire: ZSTD ≈ Brotli (voire moins bon)
  Avec dictionnaire: PAKK > Brotli de ${colors.green}+${totalImprovement}%${colors.reset}
`);

  // Speed comparison
  console.log(colors.bold + '⚡ VITESSE DE COMPRESSION' + colors.reset);
  console.log(colors.dim + '─'.repeat(79) + colors.reset);

  let totalBrotliTime = 0;
  let totalPakkTime = 0;

  for (const bench of benchmarks) {
    const brotli = bench.results.find(r => r.algorithm === 'brotli-11');
    const pakk = bench.results.find(r => r.algorithm.startsWith('PAKK-') && !r.algorithm.endsWith('-19'));
    if (brotli && pakk) {
      totalBrotliTime += brotli.time;
      totalPakkTime += pakk.time;
    }
  }

  const speedup = (totalBrotliTime / totalPakkTime).toFixed(1);
  console.log(`
  Brotli-11: ${totalBrotliTime}ms total
  PAKK:      ${totalPakkTime}ms total

  ${colors.green}PAKK est ${speedup}x plus rapide${colors.reset} que Brotli-11
`);
}

async function main() {
  console.log(colors.bold + '\n🚀 PAKK Full Benchmark Suite\n' + colors.reset);

  // Create benchmark-files directory
  const benchDir = join(process.cwd(), 'benchmark-files');
  if (!existsSync(benchDir)) {
    mkdirSync(benchDir, { recursive: true });
  }

  // Download test files
  console.log(colors.dim + 'Preparing test files...' + colors.reset);
  for (const file of TEST_FILES) {
    await downloadFile(file.url, join(benchDir, file.name));
  }

  // Run benchmarks
  console.log(colors.dim + '\nRunning benchmarks...' + colors.reset);
  const results: FileBench[] = [];

  for (const file of TEST_FILES) {
    const filePath = join(benchDir, file.name);
    console.log(`  Benchmarking ${file.name}...`);
    const bench = await runBenchmark(filePath, file.dict);
    results.push(bench);
  }

  // Print results
  printResults(results);
}

main().catch(console.error);
