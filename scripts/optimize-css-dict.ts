/**
 * CSS Dictionary Optimization Script
 *
 * Tests different dictionary sizes and training parameters
 * to find the optimal CSS dictionary configuration.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// Test file
const TEST_FILE = 'C:/Users/drpcr/Desktop/pakk/benchmark-files/bootstrap.min.css';

// Training data directory
const CSS_TRAINING_DIR = 'C:/Users/drpcr/Desktop/pakk-entrainement/css';

// Output directory for test dictionaries
const TEST_DICT_DIR = 'C:/Users/drpcr/Desktop/pakk/test-dicts';

// Dictionary sizes to test (in KB)
const DICT_SIZES = [64, 128, 256, 384, 512, 768, 1024];

// Training parameters to test
const TRAINING_PARAMS = [
  { d: 6, steps: 100 },
  { d: 6, steps: 200 },
  { d: 8, steps: 100 },
  { d: 8, steps: 200 },
];

interface TestResult {
  dictSize: number;
  params: { d: number; steps: number };
  compressedSize: number;
  ratio: number;
  vsBrotli: number;
}

async function main() {
  console.log(`${colors.bold}\n🔬 CSS Dictionary Optimization\n${colors.reset}`);

  // Ensure test dict directory exists
  if (!existsSync(TEST_DICT_DIR)) {
    mkdirSync(TEST_DICT_DIR, { recursive: true });
  }

  // Load zstd
  let zstd: any;
  try {
    zstd = await import('zstd-napi');
  } catch {
    console.error('zstd-napi not available');
    process.exit(1);
  }

  // Load test file
  const testData = readFileSync(TEST_FILE);
  console.log(`Test file: ${basename(TEST_FILE)} (${(testData.length / 1024).toFixed(1)} KB)\n`);

  // Get Brotli baseline
  const brotliCompressed = brotliCompressSync(testData, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 22,
    },
  });
  const brotliSize = brotliCompressed.length;
  console.log(`Brotli-11 baseline: ${(brotliSize / 1024).toFixed(1)} KB\n`);

  // Get list of CSS training files
  const cssFiles = readdirSync(CSS_TRAINING_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => join(CSS_TRAINING_DIR, f).replace(/\\/g, '/'))
    .filter(f => {
      try {
        const stat = readFileSync(f);
        return stat.length > 1024; // Skip tiny files
      } catch {
        return false;
      }
    });

  console.log(`Training files: ${cssFiles.length} CSS files\n`);

  const results: TestResult[] = [];

  // Test different configurations
  for (const params of TRAINING_PARAMS) {
    for (const sizeKB of DICT_SIZES) {
      const dictPath = join(TEST_DICT_DIR, `css-d${params.d}-s${params.steps}-${sizeKB}k.dict`).replace(/\\/g, '/');

      console.log(`${colors.dim}Testing d=${params.d}, steps=${params.steps}, size=${sizeKB}KB...${colors.reset}`);

      try {
        // Train dictionary
        const trainCmd = `zstd --train-cover=d=${params.d},steps=${params.steps},split=100 --maxdict=${sizeKB * 1024} -o "${dictPath}" ${cssFiles.slice(0, 30).map(f => `"${f}"`).join(' ')} 2>&1`;

        try {
          execSync(trainCmd, { encoding: 'utf8', stdio: 'pipe' });
        } catch (e: any) {
          // Training might output warnings but still succeed
          if (!existsSync(dictPath)) {
            console.log(`  ${colors.red}Training failed${colors.reset}`);
            continue;
          }
        }

        // Load dictionary and compress
        const dict = readFileSync(dictPath);
        const compressor = new zstd.Compressor();
        compressor.setParameters({ compressionLevel: 11 });
        compressor.loadDictionary(dict);

        const compressed = compressor.compress(testData);
        const ratio = compressed.length / testData.length;
        const vsBrotli = Math.round((1 - compressed.length / brotliSize) * 100);

        results.push({
          dictSize: sizeKB,
          params,
          compressedSize: compressed.length,
          ratio,
          vsBrotli,
        });

        const color = vsBrotli > 0 ? colors.green : colors.red;
        console.log(`  → ${(compressed.length / 1024).toFixed(1)} KB (${color}${vsBrotli > 0 ? '+' : ''}${vsBrotli}% vs Brotli${colors.reset})`);

      } catch (error: any) {
        console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
      }
    }
    console.log('');
  }

  // Print summary
  console.log(`\n${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}                    RESULTS SUMMARY${colors.reset}`);
  console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Sort by best compression
  results.sort((a, b) => a.compressedSize - b.compressedSize);

  console.log('Top 10 configurations:\n');
  console.log('  Rank  Dict Size   d    steps    Compressed    vs Brotli');
  console.log('  ' + '─'.repeat(58));

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i]!;
    const color = r.vsBrotli > 0 ? colors.green : colors.red;
    console.log(
      `  ${(i + 1).toString().padStart(2)}.   ${r.dictSize.toString().padStart(4)} KB    ${r.params.d}     ${r.params.steps.toString().padStart(3)}      ${(r.compressedSize / 1024).toFixed(1).padStart(6)} KB     ${color}${r.vsBrotli > 0 ? '+' : ''}${r.vsBrotli}%${colors.reset}`
    );
  }

  // Best result
  const best = results[0];
  if (best) {
    console.log(`\n${colors.bold}🏆 BEST CONFIGURATION:${colors.reset}`);
    console.log(`   Dictionary size: ${best.dictSize} KB`);
    console.log(`   Parameters: d=${best.params.d}, steps=${best.params.steps}`);
    console.log(`   Result: ${(best.compressedSize / 1024).toFixed(1)} KB (${colors.green}+${best.vsBrotli}% vs Brotli${colors.reset})`);
  }

  // Test with different training data approaches
  console.log(`\n${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}                  ADVANCED TESTS${colors.reset}`);
  console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Test 1: Use bootstrap.css (non-minified) as dictionary directly
  console.log('Test 1: Using bootstrap.css (non-minified) as dictionary reference...');
  const bootstrapNonMin = join(CSS_TRAINING_DIR, 'bootstrap.css').replace(/\\/g, '/');
  if (existsSync(bootstrapNonMin)) {
    try {
      const dictPath = join(TEST_DICT_DIR, 'css-bootstrap-ref.dict').replace(/\\/g, '/');
      execSync(`zstd --train-cover=d=6,steps=100 --maxdict=524288 -o "${dictPath}" "${bootstrapNonMin}" 2>&1`, { stdio: 'pipe' });

      const dict = readFileSync(dictPath);
      const compressor = new zstd.Compressor();
      compressor.setParameters({ compressionLevel: 11 });
      compressor.loadDictionary(dict);

      const compressed = compressor.compress(testData);
      const vsBrotli = Math.round((1 - compressed.length / brotliSize) * 100);
      const color = vsBrotli > 0 ? colors.green : colors.red;
      console.log(`  → ${(compressed.length / 1024).toFixed(1)} KB (${color}${vsBrotli > 0 ? '+' : ''}${vsBrotli}% vs Brotli${colors.reset})\n`);
    } catch (e) {
      console.log(`  → Failed\n`);
    }
  }

  // Test 2: Only use minified CSS files for training
  console.log('Test 2: Training only on minified CSS files...');
  const minifiedFiles = cssFiles.filter(f => f.includes('.min.'));
  if (minifiedFiles.length > 0) {
    try {
      const dictPath = join(TEST_DICT_DIR, 'css-minified-only.dict').replace(/\\/g, '/');
      execSync(`zstd --train-cover=d=6,steps=200 --maxdict=524288 -o "${dictPath}" ${minifiedFiles.map(f => `"${f}"`).join(' ')} 2>&1`, { stdio: 'pipe' });

      const dict = readFileSync(dictPath);
      const compressor = new zstd.Compressor();
      compressor.setParameters({ compressionLevel: 11 });
      compressor.loadDictionary(dict);

      const compressed = compressor.compress(testData);
      const vsBrotli = Math.round((1 - compressed.length / brotliSize) * 100);
      const color = vsBrotli > 0 ? colors.green : colors.red;
      console.log(`  → ${(compressed.length / 1024).toFixed(1)} KB (${color}${vsBrotli > 0 ? '+' : ''}${vsBrotli}% vs Brotli${colors.reset})\n`);
    } catch (e) {
      console.log(`  → Failed\n`);
    }
  }

  // Test 3: Only large CSS frameworks
  console.log('Test 3: Training only on large CSS frameworks (Bootstrap, Bulma, DaisyUI, Tailwind base)...');
  const frameworkFiles = cssFiles.filter(f =>
    f.includes('bootstrap') ||
    f.includes('bulma') ||
    f.includes('daisyui') ||
    f.includes('tachyons') ||
    f.includes('foundation') ||
    f.includes('materialize')
  );
  if (frameworkFiles.length > 0) {
    try {
      const dictPath = join(TEST_DICT_DIR, 'css-frameworks-only.dict').replace(/\\/g, '/');
      execSync(`zstd --train-cover=d=6,steps=200 --maxdict=524288 -o "${dictPath}" ${frameworkFiles.map(f => `"${f}"`).join(' ')} 2>&1`, { stdio: 'pipe' });

      const dict = readFileSync(dictPath);
      const compressor = new zstd.Compressor();
      compressor.setParameters({ compressionLevel: 11 });
      compressor.loadDictionary(dict);

      const compressed = compressor.compress(testData);
      const vsBrotli = Math.round((1 - compressed.length / brotliSize) * 100);
      const color = vsBrotli > 0 ? colors.green : colors.red;
      console.log(`  → ${(compressed.length / 1024).toFixed(1)} KB (${color}${vsBrotli > 0 ? '+' : ''}${vsBrotli}% vs Brotli${colors.reset})\n`);
    } catch (e) {
      console.log(`  → Failed\n`);
    }
  }

  console.log(`\n${colors.dim}Test dictionaries saved to: ${TEST_DICT_DIR}${colors.reset}\n`);
}

main().catch(console.error);
