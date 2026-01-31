/**
 * PAKK Parcel Plugin
 *
 * Adds PAKK compression to Parcel builds.
 *
 * This is a Parcel Optimizer plugin that compresses output files.
 *
 * @example
 * ```json
 * // .parcelrc
 * {
 *   "extends": "@parcel/config-default",
 *   "optimizers": {
 *     "*.{js,css,html}": ["...", "pakk/parcel"]
 *   }
 * }
 * ```
 *
 * @example
 * ```js
 * // pakk.config.js (for configuration)
 * module.exports = {
 *   dictionary: 'react',
 *   level: 11,
 *   threshold: 1024,
 * };
 * ```
 */

import type { DictionaryType } from '../core/types.js';

export interface PakkParcelOptions {
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

// Parcel Optimizer types
interface Optimizer {
  optimize: (options: OptimizeOptions) => Promise<OptimizeResult>;
}

interface OptimizeOptions {
  bundle: Bundle;
  contents: Buffer;
  map?: unknown;
  getSourceMapReference: (map: unknown) => string | null;
}

interface Bundle {
  type: string;
  filePath: string;
  name: string;
  env: BundleEnv;
}

interface BundleEnv {
  minify: boolean;
  shouldOptimize: boolean;
}

interface OptimizeResult {
  contents: Buffer;
  map?: unknown;
}

interface PluginOptions {
  config?: PakkParcelOptions;
}

const defaultOptions: Required<PakkParcelOptions> = {
  dictionary: 'auto',
  level: 11,
  threshold: 1024,
  include: ['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg'],
  exclude: ['.map', '.gz', '.br', '.zst', '.pakk'],
  ext: '.pakk',
  generateBrotli: false,
  generateGzip: false,
  verbose: false,
};

/**
 * Create a Parcel Optimizer plugin
 */
export function createOptimizer(pluginOptions: PluginOptions = {}): Optimizer {
  const options = { ...defaultOptions, ...pluginOptions.config };

  return {
    async optimize({ bundle, contents }) {
      // Skip if below threshold
      if (contents.length < options.threshold) {
        return { contents };
      }

      // Check if file type is included
      const ext = '.' + bundle.type;
      if (!options.include.includes(ext)) {
        return { contents };
      }

      // Check excludes
      if (options.exclude.some(e => bundle.filePath.includes(e))) {
        return { contents };
      }

      const { compress, formatBytes } = await import('../core/compressor.js');
      const { writeFileSync } = await import('node:fs');

      try {
        const result = await compress(contents, {
          dictionary: options.dictionary,
          level: options.level,
        });

        // Write compressed file alongside original
        writeFileSync(bundle.filePath + options.ext, result.data);

        // Generate Brotli if requested
        if (options.generateBrotli) {
          const brotliResult = await compress(contents, {
            algorithm: 'brotli',
            level: Math.min(options.level, 11),
          });
          writeFileSync(bundle.filePath + '.br', brotliResult.data);
        }

        // Generate Gzip if requested
        if (options.generateGzip) {
          const gzipResult = await compress(contents, {
            algorithm: 'gzip',
            level: Math.min(options.level, 9),
          });
          writeFileSync(bundle.filePath + '.gz', gzipResult.data);
        }

        if (options.verbose) {
          console.log(
            `  PAKK: ${bundle.name} ` +
            `${formatBytes(result.originalSize)} -> ${formatBytes(result.compressedSize)} ` +
            `(-${result.savings}%)`
          );
        }

        // Return original contents (we write compressed as separate file)
        return { contents };
      } catch (error) {
        if (options.verbose) {
          console.error(`  PAKK: Failed to compress ${bundle.name}:`, error);
        }
        return { contents };
      }
    },
  };
}

/**
 * Parcel plugin factory (used by Parcel's plugin system)
 *
 * @example
 * In .parcelrc:
 * {
 *   "extends": "@parcel/config-default",
 *   "optimizers": {
 *     "*.{js,css,html}": ["...", "pakk/parcel"]
 *   }
 * }
 */
export default {
  default: createOptimizer,
};

// Export for programmatic usage
export { createOptimizer as pakk };
