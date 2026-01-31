/**
 * PAKK Vite Plugin
 *
 * Compresses build output with pre-trained dictionaries.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { pakk } from 'pakk/vite';
 *
 * export default {
 *   plugins: [
 *     pakk({
 *       dictionary: 'react',  // or 'vue', 'auto'
 *       level: 11,            // 1-19
 *       threshold: 1024,      // Min file size
 *     })
 *   ]
 * }
 * ```
 */

import type { Plugin } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { compress, benchmark, formatBenchmark, formatBytes } from '../core/compressor.js';
import type { DictionaryType } from '../core/types.js';

export interface PakkViteOptions {
  /** Dictionary to use: 'react', 'vue', 'typescript', 'auto' (default: 'auto') */
  dictionary?: DictionaryType;
  /** Compression level 1-19 (default: 11 for balance, 19 for max) */
  level?: number;
  /** Minimum file size to compress in bytes (default: 1024) */
  threshold?: number;
  /** File extensions to compress (default: ['.js', '.mjs', '.css', '.html', '.json', '.svg']) */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Output file extension (default: '.pakk') */
  ext?: string;
  /** Also generate .br files (default: false) */
  generateBrotli?: boolean;
  /** Also generate .gz files (default: false) */
  generateGzip?: boolean;
  /** Delete original files after compression (default: false) */
  deleteOriginal?: boolean;
  /** Show benchmark comparison for largest file (default: true) */
  benchmark?: boolean;
  /** Verbose logging (default: false) */
  verbose?: boolean;
}

interface CompressedFile {
  name: string;
  path: string;
  originalSize: number;
  compressedSize: number;
  savings: number;
  algorithm: string;
  timeMs: number;
}

const defaultOptions: Required<PakkViteOptions> = {
  dictionary: 'auto',
  level: 11,
  threshold: 1024,
  include: ['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg', '.txt', '.xml'],
  exclude: ['.map', '.gz', '.br', '.zst', '.pakk'],
  ext: '.pakk',
  generateBrotli: false,
  generateGzip: false,
  deleteOriginal: false,
  benchmark: true,
  verbose: false,
};

export function pakk(userOptions: PakkViteOptions = {}): Plugin {
  const options = { ...defaultOptions, ...userOptions };
  let outDir: string;

  const compressedFiles: CompressedFile[] = [];

  return {
    name: 'pakk',
    apply: 'build',
    enforce: 'post',

    configResolved(resolvedConfig) {
      outDir = resolvedConfig.build.outDir;
    },

    async closeBundle() {
      const startTime = performance.now();

      // Get all files recursively
      const files = getAllFiles(outDir);

      // Filter files to compress
      const toCompress = files.filter(file => {
        const ext = extname(file);

        // Check exclude list
        if (options.exclude.some(e => file.endsWith(e))) {
          return false;
        }

        // Check include list
        if (!options.include.includes(ext)) {
          return false;
        }

        // Check threshold
        try {
          const stats = statSync(file);
          return stats.size >= options.threshold;
        } catch {
          return false;
        }
      });

      if (toCompress.length === 0) {
        if (options.verbose) {
          console.log('\n  PAKK: No files to compress\n');
        }
        return;
      }

      console.log('\n  PAKK - Smart Bundle Compression\n');
      console.log(`  Found ${toCompress.length} files to compress...\n`);

      // Compress each file
      for (const filePath of toCompress) {
        try {
          const content = readFileSync(filePath);
          const result = await compress(content, {
            dictionary: options.dictionary,
            level: options.level,
          });

          // Write compressed file
          const compressedPath = filePath + options.ext;
          writeFileSync(compressedPath, result.data);

          // Generate Brotli if requested
          if (options.generateBrotli) {
            const brotliResult = await compress(content, {
              algorithm: 'brotli',
              level: Math.min(options.level, 11),
            });
            writeFileSync(filePath + '.br', brotliResult.data);
          }

          // Generate Gzip if requested
          if (options.generateGzip) {
            const gzipResult = await compress(content, {
              algorithm: 'gzip',
              level: Math.min(options.level, 9),
            });
            writeFileSync(filePath + '.gz', gzipResult.data);
          }

          // Delete original if requested
          if (options.deleteOriginal) {
            const { unlinkSync } = await import('node:fs');
            unlinkSync(filePath);
          }

          const relativePath = relative(outDir, filePath);
          compressedFiles.push({
            name: relativePath,
            path: filePath,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            savings: result.savings,
            algorithm: result.algorithm,
            timeMs: result.timeMs,
          });

          if (options.verbose) {
            console.log(
              `  + ${relativePath.padEnd(40)} ` +
              `${formatBytes(result.originalSize)} -> ${formatBytes(result.compressedSize)} ` +
              `(-${result.savings}%)`
            );
          }
        } catch (error) {
          console.error(`  ! Failed to compress ${filePath}:`, error);
        }
      }

      // Print summary
      const totalOriginal = compressedFiles.reduce((sum, f) => sum + f.originalSize, 0);
      const totalCompressed = compressedFiles.reduce((sum, f) => sum + f.compressedSize, 0);
      const totalSavings = totalOriginal > 0
        ? Math.round((1 - totalCompressed / totalOriginal) * 100)
        : 0;
      const totalTime = performance.now() - startTime;

      console.log('  --------------------------------------------------------');
      console.log(`  Files: ${compressedFiles.length} compressed`);
      console.log(`  Size:  ${formatBytes(totalOriginal)} -> ${formatBytes(totalCompressed)}`);
      console.log(`  Saved: ${formatBytes(totalOriginal - totalCompressed)} (-${totalSavings}%)`);
      console.log(`  Time:  ${Math.round(totalTime)}ms`);
      console.log('  --------------------------------------------------------\n');

      // Show benchmark if enabled
      if (options.benchmark && compressedFiles.length > 0) {
        const largest = compressedFiles.reduce((max, f) =>
          f.originalSize > max.originalSize ? f : max
        );

        try {
          const content = readFileSync(largest.path);
          const benchResult = await benchmark(largest.name, content, {
            dictionary: options.dictionary,
          });
          console.log(formatBenchmark(benchResult));
          console.log('');
        } catch {
          // Skip benchmark on error
        }
      }

      // Deployment instructions
      console.log('  Deployment:\n');
      console.log('  Nginx:');
      console.log('    location ~* \\.(js|css|html)$ {');
      console.log('      add_header Content-Encoding zstd;');
      console.log('      try_files $uri.pakk $uri =404;');
      console.log('    }\n');
      console.log('  CDN: Serve .pakk files with Content-Encoding: zstd\n');
    },
  };
}

/**
 * Get all files recursively in a directory
 */
function getAllFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          getAllFiles(fullPath, files);
        } else {
          files.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return files;
}

export default pakk;
