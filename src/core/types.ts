/**
 * PAKK Core Types
 */

export type DictionaryType =
  | 'react'
  | 'vue'
  | 'typescript'
  | 'javascript'
  | 'css'
  | 'html'
  | 'json'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'c'
  | 'cpp'
  | 'node_modules'
  | 'auto';

export type CompressionAlgorithm =
  | 'zstd'
  | 'zstd-dict'
  | 'brotli'
  | 'gzip';

export interface CompressOptions {
  /** Dictionary to use for compression (default: 'auto') */
  dictionary?: DictionaryType;
  /** Compression level 1-19 for zstd, 1-11 for brotli (default: 11) */
  level?: number;
  /** Force specific algorithm instead of auto-selection */
  algorithm?: 'zstd' | 'brotli' | 'gzip';
  /** Minimum file size to apply dictionary compression (default: 256) */
  minDictSize?: number;
}

export interface CompressResult {
  /** Compressed data buffer */
  data: Buffer;
  /** Original size in bytes */
  originalSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Compression ratio (0-1) */
  ratio: number;
  /** Savings percentage (0-100) */
  savings: number;
  /** Dictionary type used */
  dictionary: DictionaryType | 'none';
  /** Algorithm used */
  algorithm: CompressionAlgorithm;
  /** Compression time in milliseconds */
  timeMs: number;
}

export interface DecompressOptions {
  /** Dictionary type used during compression (required for zstd-dict) */
  dictionary?: DictionaryType;
}

export interface BenchmarkResult {
  name: string;
  originalSize: number;
  results: BenchmarkEntry[];
}

export interface BenchmarkEntry {
  algorithm: string;
  compressedSize: number;
  ratio: number;
  savings: number;
  timeMs: number;
}

export interface DictionaryMeta {
  name: string;
  version: string;
  description: string;
  frameworks: string[];
  sizeBytes: number;
  patternCount: number;
  trainedOn: string[];
}
