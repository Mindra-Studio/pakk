/**
 * PAKK Webpack Plugin
 *
 * Adds PAKK compression to Webpack builds.
 *
 * @example
 * ```js
 * // webpack.config.js
 * const { PakkPlugin } = require('pakk/webpack');
 *
 * module.exports = {
 *   plugins: [
 *     new PakkPlugin({
 *       dictionary: 'react',
 *       level: 11,
 *       threshold: 1024,
 *     })
 *   ]
 * };
 * ```
 */

import type { DictionaryType } from '../core/types.js';

export interface PakkWebpackOptions {
  /** Dictionary to use: 'react', 'vue', 'typescript', 'auto' (default: 'auto') */
  dictionary?: DictionaryType;
  /** Compression level 1-19 (default: 11) */
  level?: number;
  /** Minimum file size to compress in bytes (default: 1024) */
  threshold?: number;
  /** File extensions to compress */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Output file extension (default: '.pakk') */
  ext?: string;
  /** Also generate .br files (default: false) */
  generateBrotli?: boolean;
  /** Also generate .gz files (default: false) */
  generateGzip?: boolean;
  /** Verbose logging (default: false) */
  verbose?: boolean;
}

interface Compiler {
  hooks: {
    afterEmit: {
      tapPromise: (name: string, callback: (compilation: Compilation) => Promise<void>) => void;
    };
    thisCompilation: {
      tap: (name: string, callback: (compilation: Compilation) => void) => void;
    };
  };
  options: {
    output?: {
      path?: string;
    };
  };
}

interface Compilation {
  assets: Record<string, Asset>;
  emitAsset: (name: string, source: RawSource) => void;
  getAsset: (name: string) => { source: Asset } | undefined;
}

interface Asset {
  source: () => Buffer | string;
  size: () => number;
}

interface RawSource {
  source: () => Buffer;
  size: () => number;
}

const defaultOptions: Required<PakkWebpackOptions> = {
  dictionary: 'auto',
  level: 11,
  threshold: 1024,
  include: ['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg'],
  exclude: ['.map', '.gz', '.br', '.zst', '.pakk', 'hot-update'],
  ext: '.pakk',
  generateBrotli: false,
  generateGzip: false,
  verbose: false,
};

export class PakkPlugin {
  private options: Required<PakkWebpackOptions>;

  constructor(options: PakkWebpackOptions = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  apply(compiler: Compiler) {
    const pluginName = 'PakkPlugin';

    compiler.hooks.afterEmit.tapPromise(pluginName, async (_compilation) => {
      const { readFileSync, writeFileSync, readdirSync, statSync, existsSync } = await import('node:fs');
      const { join, extname, relative } = await import('node:path');
      const { compress, formatBytes } = await import('../core/compressor.js');

      const outputPath = compiler.options.output?.path;
      if (!outputPath || !existsSync(outputPath)) return;

      const files = this.getAllFiles(outputPath, { readdirSync, statSync, join });

      const toCompress = files.filter(file => {
        const ext = extname(file);

        if (this.options.exclude.some(e => file.includes(e))) {
          return false;
        }

        if (!this.options.include.includes(ext)) {
          return false;
        }

        try {
          const stats = statSync(file);
          return stats.size >= this.options.threshold;
        } catch {
          return false;
        }
      });

      if (toCompress.length === 0) {
        if (this.options.verbose) {
          console.log('\n  PAKK: No files to compress\n');
        }
        return;
      }

      console.log(`\n  PAKK: Compressing ${toCompress.length} files...\n`);

      let totalOriginal = 0;
      let totalCompressed = 0;
      let compressedCount = 0;

      for (const filePath of toCompress) {
        try {
          const content = readFileSync(filePath);
          const result = await compress(content, {
            dictionary: this.options.dictionary,
            level: this.options.level,
          });

          // Write PAKK compressed file
          writeFileSync(filePath + this.options.ext, result.data);

          // Generate Brotli if requested
          if (this.options.generateBrotli) {
            const brotliResult = await compress(content, {
              algorithm: 'brotli',
              level: Math.min(this.options.level, 11),
            });
            writeFileSync(filePath + '.br', brotliResult.data);
          }

          // Generate Gzip if requested
          if (this.options.generateGzip) {
            const gzipResult = await compress(content, {
              algorithm: 'gzip',
              level: Math.min(this.options.level, 9),
            });
            writeFileSync(filePath + '.gz', gzipResult.data);
          }

          totalOriginal += result.originalSize;
          totalCompressed += result.compressedSize;
          compressedCount++;

          if (this.options.verbose) {
            const relativePath = relative(outputPath, filePath);
            console.log(
              `  + ${relativePath.padEnd(50)} ` +
              `${formatBytes(result.originalSize).padStart(8)} -> ${formatBytes(result.compressedSize).padStart(8)} ` +
              `(-${result.savings}%)`
            );
          }
        } catch (error) {
          if (this.options.verbose) {
            console.error(`  ! Failed to compress ${filePath}:`, error);
          }
        }
      }

      // Summary
      const savings = totalOriginal > 0
        ? Math.round((1 - totalCompressed / totalOriginal) * 100)
        : 0;

      console.log('  --------------------------------------------------------');
      console.log(`  PAKK: ${compressedCount} files compressed`);
      console.log(`  Size: ${formatBytes(totalOriginal)} -> ${formatBytes(totalCompressed)}`);
      console.log(`  Saved: ${formatBytes(totalOriginal - totalCompressed)} (-${savings}%)`);
      console.log('  --------------------------------------------------------\n');
    });
  }

  private getAllFiles(
    dir: string,
    fs: {
      readdirSync: typeof import('node:fs').readdirSync;
      statSync: typeof import('node:fs').statSync;
      join: typeof import('node:path').join;
    },
    files: string[] = []
  ): string[] {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = fs.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            this.getAllFiles(fullPath, fs, files);
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
}

export default PakkPlugin;
