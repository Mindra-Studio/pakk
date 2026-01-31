/**
 * PAKK - Smart Compression with Pre-trained Dictionaries
 *
 * @example
 * ```ts
 * import { compress, decompress, benchmark, formatBenchmark } from 'pakk';
 *
 * // Compress content
 * const result = await compress(content, {
 *   dictionary: 'react',
 *   level: 11,
 * });
 *
 * console.log(`Saved: ${result.savings}%`);
 *
 * // Decompress
 * const original = await decompress(result.data);
 *
 * // Benchmark
 * const bench = await benchmark('main.js', content);
 * console.log(formatBenchmark(bench));
 * ```
 *
 * @packageDocumentation
 */

// Core compression
export {
  compress,
  compressSync,
  decompress,
  benchmark,
  formatBenchmark,
  formatBytes,
  hasZstd,
  hasZstdSync,
} from './core/compressor.js';

// Types
export type {
  DictionaryType,
  CompressionAlgorithm,
  CompressOptions,
  CompressResult,
  DecompressOptions,
  BenchmarkResult,
  BenchmarkEntry,
  DictionaryMeta,
} from './core/types.js';

// Dictionaries
export {
  getDictionary,
  getDictionaryMeta,
  getAllDictionaries,
  detectDictionaryType,
  detectFromExtension,
  getReactDictionary,
  getVueDictionary,
  getTypescriptDictionary,
  getCssDictionary,
  getJsonDictionary,
  REACT_DICTIONARY_META,
  VUE_DICTIONARY_META,
  TYPESCRIPT_DICTIONARY_META,
  CSS_DICTIONARY_META,
  JSON_DICTIONARY_META,
} from './dictionaries/index.js';
