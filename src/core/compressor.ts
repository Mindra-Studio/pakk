/**
 * PAKK Core Compression Engine
 *
 * High-performance compression using:
 * - ZSTD with pre-trained dictionaries (primary, via zstd-napi)
 * - Brotli (fallback, Node.js native)
 * - Gzip (baseline)
 */

import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync, constants } from 'node:zlib';
import { getDictionary, detectDictionaryType } from '../dictionaries/index.js';
import type {
  CompressOptions,
  CompressResult,
  DecompressOptions,
  DictionaryType,
  CompressionAlgorithm,
  BenchmarkResult,
} from './types.js';

// Type definitions for zstd-napi (optional dependency)
interface ZstdCompressor {
  setParameters(params: { compressionLevel?: number }): void;
  loadDictionary(data: Uint8Array): void;
  compress(buffer: Uint8Array): Buffer;
}

interface ZstdDecompressor {
  loadDictionary(data: Uint8Array): void;
  decompress(buffer: Uint8Array): Buffer;
}

interface ZstdModule {
  Compressor: new () => ZstdCompressor;
  Decompressor: new () => ZstdDecompressor;
  compress(data: Uint8Array, level?: number): Buffer;
  decompress(data: Uint8Array): Buffer;
}

// Lazy-load zstd-napi (optional dependency)
let zstdModule: ZstdModule | null = null;
let zstdLoadAttempted = false;

async function loadZstd(): Promise<ZstdModule | null> {
  if (zstdLoadAttempted) return zstdModule;
  zstdLoadAttempted = true;

  try {
    zstdModule = await import('zstd-napi') as unknown as ZstdModule;
    return zstdModule;
  } catch {
    return null;
  }
}

function loadZstdSync(): ZstdModule | null {
  if (zstdLoadAttempted) return zstdModule;
  zstdLoadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    zstdModule = require('zstd-napi') as ZstdModule;
    return zstdModule;
  } catch {
    return null;
  }
}

/**
 * Check if zstd-napi is available
 */
export async function hasZstd(): Promise<boolean> {
  return (await loadZstd()) !== null;
}

/**
 * Check if zstd-napi is available (sync)
 */
export function hasZstdSync(): boolean {
  return loadZstdSync() !== null;
}

/**
 * Compress data with ZSTD + dictionary
 */
async function compressWithZstd(
  data: Buffer,
  dict: Buffer | null,
  level: number
): Promise<Buffer> {
  const zstd = await loadZstd();
  if (!zstd) {
    throw new Error('zstd-napi not available');
  }

  const clampedLevel = Math.min(Math.max(level, 1), 22);

  if (dict && dict.length > 0) {
    // Use Compressor class with dictionary
    const compressor = new zstd.Compressor();
    compressor.setParameters({ compressionLevel: clampedLevel });
    compressor.loadDictionary(dict);
    return compressor.compress(data);
  }

  // Simple compression without dictionary
  return zstd.compress(data, clampedLevel);
}

/**
 * Decompress ZSTD data
 */
async function decompressWithZstd(
  data: Buffer,
  dict: Buffer | null
): Promise<Buffer> {
  const zstd = await loadZstd();
  if (!zstd) {
    throw new Error('zstd-napi not available');
  }

  if (dict && dict.length > 0) {
    // Use Decompressor class with dictionary
    const decompressor = new zstd.Decompressor();
    decompressor.loadDictionary(dict);
    return decompressor.decompress(data);
  }

  // Simple decompression without dictionary
  return zstd.decompress(data);
}

/**
 * Compress data with Brotli
 */
function compressWithBrotli(data: Buffer, level: number): Buffer {
  const clampedLevel = Math.min(Math.max(level, 0), 11);

  return brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: clampedLevel,
      [constants.BROTLI_PARAM_LGWIN]: 22,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    },
  });
}

/**
 * Compress data with Gzip
 */
function compressWithGzip(data: Buffer, level: number): Buffer {
  const clampedLevel = Math.min(Math.max(level, 1), 9);
  return gzipSync(data, { level: clampedLevel });
}

/**
 * Detect magic bytes to identify compression format
 */
function detectFormat(data: Buffer): CompressionAlgorithm | null {
  if (data.length < 4) return null;

  // ZSTD magic: 0x28B52FFD
  if (data[0] === 0x28 && data[1] === 0xB5 && data[2] === 0x2F && data[3] === 0xFD) {
    return 'zstd';
  }

  // Gzip magic: 0x1F8B
  if (data[0] === 0x1F && data[1] === 0x8B) {
    return 'gzip';
  }

  // Brotli has no magic number - try to detect by exclusion
  return null;
}

/**
 * Main compression function
 */
export async function compress(
  input: string | Buffer,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const startTime = performance.now();

  const data = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  const level = options.level ?? 11;
  const minDictSize = options.minDictSize ?? 256;

  // Detect or use specified dictionary
  const dictType = options.dictionary === 'auto' || !options.dictionary
    ? detectDictionaryType(data)
    : options.dictionary;

  let compressed: Buffer;
  let algorithm: CompressionAlgorithm;
  let usedDict: DictionaryType | 'none' = 'none';

  // Determine algorithm to use
  const requestedAlgo = options.algorithm;
  const useDict = data.length >= minDictSize && dictType !== 'auto';

  if (requestedAlgo === 'gzip') {
    // Force gzip
    compressed = compressWithGzip(data, Math.min(level, 9));
    algorithm = 'gzip';
  } else if (requestedAlgo === 'brotli') {
    // Force brotli
    compressed = compressWithBrotli(data, Math.min(level, 11));
    algorithm = 'brotli';
  } else if (requestedAlgo === 'zstd' || !requestedAlgo) {
    // Try ZSTD with dictionary (best), fallback to Brotli
    const zstdAvailable = await hasZstd();

    if (zstdAvailable) {
      try {
        const dict = useDict ? getDictionary(dictType) : null;
        compressed = await compressWithZstd(data, dict, level);
        algorithm = dict ? 'zstd-dict' : 'zstd';
        usedDict = dict ? dictType : 'none';
      } catch {
        // Fallback to Brotli
        compressed = compressWithBrotli(data, Math.min(level, 11));
        algorithm = 'brotli';
        // Still report requested dictionary even if not used
        usedDict = useDict ? dictType : 'none';
      }
    } else {
      // No ZSTD available, use Brotli
      compressed = compressWithBrotli(data, Math.min(level, 11));
      algorithm = 'brotli';
      // Still report requested dictionary even if not used (for consistency)
      usedDict = useDict ? dictType : 'none';
    }
  } else {
    // Default to Brotli
    compressed = compressWithBrotli(data, Math.min(level, 11));
    algorithm = 'brotli';
  }

  const endTime = performance.now();

  return {
    data: compressed,
    originalSize: data.length,
    compressedSize: compressed.length,
    ratio: compressed.length / data.length,
    savings: Math.round((1 - compressed.length / data.length) * 100),
    dictionary: usedDict,
    algorithm,
    timeMs: Math.round(endTime - startTime),
  };
}

/**
 * Synchronous compression (Brotli/Gzip only)
 */
export function compressSync(
  input: string | Buffer,
  options: CompressOptions = {}
): CompressResult {
  const startTime = performance.now();

  const data = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  const level = options.level ?? 11;
  const algo = options.algorithm ?? 'brotli';

  let compressed: Buffer;
  let algorithm: CompressionAlgorithm;

  if (algo === 'gzip') {
    compressed = compressWithGzip(data, Math.min(level, 9));
    algorithm = 'gzip';
  } else {
    compressed = compressWithBrotli(data, Math.min(level, 11));
    algorithm = 'brotli';
  }

  const endTime = performance.now();

  return {
    data: compressed,
    originalSize: data.length,
    compressedSize: compressed.length,
    ratio: compressed.length / data.length,
    savings: Math.round((1 - compressed.length / data.length) * 100),
    dictionary: 'none',
    algorithm,
    timeMs: Math.round(endTime - startTime),
  };
}

/**
 * Decompress data
 */
export async function decompress(
  input: Buffer,
  options: DecompressOptions = {}
): Promise<Buffer> {
  const format = detectFormat(input);

  if (format === 'zstd') {
    const dict = options.dictionary ? getDictionary(options.dictionary) : null;
    return decompressWithZstd(input, dict);
  }

  if (format === 'gzip') {
    return gunzipSync(input);
  }

  // Assume Brotli
  return brotliDecompressSync(input);
}

/**
 * Benchmark compression algorithms on content
 */
export async function benchmark(
  name: string,
  content: string | Buffer,
  options: { dictionary?: DictionaryType } = {}
): Promise<BenchmarkResult> {
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const dictType = options.dictionary === 'auto' || !options.dictionary
    ? detectDictionaryType(data)
    : options.dictionary;

  const results: BenchmarkResult['results'] = [];

  // Gzip (baseline)
  {
    const start = performance.now();
    const compressed = compressWithGzip(data, 9);
    const time = performance.now() - start;
    results.push({
      algorithm: 'gzip-9',
      compressedSize: compressed.length,
      ratio: compressed.length / data.length,
      savings: Math.round((1 - compressed.length / data.length) * 100),
      timeMs: Math.round(time),
    });
  }

  // Brotli
  {
    const start = performance.now();
    const compressed = compressWithBrotli(data, 11);
    const time = performance.now() - start;
    results.push({
      algorithm: 'brotli-11',
      compressedSize: compressed.length,
      ratio: compressed.length / data.length,
      savings: Math.round((1 - compressed.length / data.length) * 100),
      timeMs: Math.round(time),
    });
  }

  // ZSTD without dictionary
  if (await hasZstd()) {
    try {
      const start = performance.now();
      const compressed = await compressWithZstd(data, null, 19);
      const time = performance.now() - start;
      results.push({
        algorithm: 'zstd-19',
        compressedSize: compressed.length,
        ratio: compressed.length / data.length,
        savings: Math.round((1 - compressed.length / data.length) * 100),
        timeMs: Math.round(time),
      });
    } catch {
      // Skip if fails
    }
  }

  // PAKK (ZSTD + dictionary)
  if (await hasZstd() && dictType !== 'auto') {
    try {
      const dict = getDictionary(dictType);
      const start = performance.now();
      const compressed = await compressWithZstd(data, dict, 19);
      const time = performance.now() - start;
      results.push({
        algorithm: `pakk-${dictType}`,
        compressedSize: compressed.length,
        ratio: compressed.length / data.length,
        savings: Math.round((1 - compressed.length / data.length) * 100),
        timeMs: Math.round(time),
      });
    } catch {
      // Skip if fails
    }
  }

  return {
    name,
    originalSize: data.length,
    results,
  };
}

/**
 * Format benchmark results as a table
 */
export function formatBenchmark(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push(`\n  ${result.name}`);
  lines.push(`  Original: ${formatBytes(result.originalSize)}`);
  lines.push('');
  lines.push('  Algorithm          Compressed    Ratio    Savings   Time');
  lines.push('  --------------------------------------------------------');

  // Sort by compressed size
  const sorted = [...result.results].sort((a, b) => a.compressedSize - b.compressedSize);

  for (const r of sorted) {
    const isPakk = r.algorithm.startsWith('pakk');
    const marker = isPakk ? '>' : ' ';
    lines.push(
      `${marker} ${r.algorithm.padEnd(18)} ${formatBytes(r.compressedSize).padStart(10)}    ` +
      `${(r.ratio * 100).toFixed(1).padStart(5)}%    ` +
      `${r.savings.toString().padStart(3)}%    ` +
      `${r.timeMs}ms`
    );
  }

  // Calculate improvement vs brotli
  const brotli = result.results.find(r => r.algorithm === 'brotli-11');
  const pakk = result.results.find(r => r.algorithm.startsWith('pakk'));

  if (brotli && pakk) {
    const improvement = Math.round((1 - pakk.compressedSize / brotli.compressedSize) * 100);
    if (improvement > 0) {
      lines.push('');
      lines.push(`  PAKK saves ${improvement}% more than Brotli`);
    }
  }

  return lines.join('\n');
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}
