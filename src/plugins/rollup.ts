/**
 * PAKK Rollup Plugin
 *
 * Adds PAKK compression to Rollup builds.
 *
 * @example
 * ```js
 * // rollup.config.js
 * import { pakk } from 'pakk/rollup';
 *
 * export default {
 *   input: 'src/index.js',
 *   output: { dir: 'dist', format: 'esm' },
 *   plugins: [
 *     pakk({
 *       dictionary: 'typescript',
 *       level: 11,
 *     })
 *   ]
 * };
 * ```
 */

import type { DictionaryType } from '../core/types.js';

export interface PakkRollupOptions {
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

interface OutputBundle {
  [fileName: string]: OutputAsset | OutputChunk;
}

interface OutputAsset {
  type: 'asset';
  fileName: string;
  source: string | Uint8Array;
}

interface OutputChunk {
  type: 'chunk';
  fileName: string;
  code: string;
  map?: unknown;
}

interface OutputOptions {
  dir?: string;
  file?: string;
}

interface PluginContext {
  emitFile: (emittedFile: EmittedFile) => string;
}

interface EmittedFile {
  type: 'asset';
  fileName: string;
  source: string | Uint8Array;
}

interface Plugin {
  name: string;
  generateBundle?: (
    this: PluginContext,
    options: OutputOptions,
    bundle: OutputBundle,
    isWrite: boolean
  ) => void | Promise<void>;
}

const defaultOptions: Required<PakkRollupOptions> = {
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

export function pakk(userOptions: PakkRollupOptions = {}): Plugin {
  const options = { ...defaultOptions, ...userOptions };

  return {
    name: 'pakk',

    async generateBundle(this: PluginContext, _outputOptions, bundle, isWrite) {
      // Only process when actually writing to disk
      if (!isWrite) return;

      const { compress, formatBytes } = await import('../core/compressor.js');

      const entries = Object.entries(bundle);
      const toCompress: Array<{ fileName: string; content: Buffer }> = [];

      for (const [fileName, output] of entries) {
        // Check extension
        const ext = '.' + fileName.split('.').pop();
        if (!options.include.includes(ext)) continue;
        if (options.exclude.some(e => fileName.includes(e))) continue;

        // Get content
        let content: Buffer;
        if (output.type === 'chunk') {
          content = Buffer.from(output.code, 'utf8');
        } else if (output.type === 'asset') {
          content = typeof output.source === 'string'
            ? Buffer.from(output.source, 'utf8')
            : Buffer.from(output.source);
        } else {
          continue;
        }

        // Check threshold
        if (content.length < options.threshold) continue;

        toCompress.push({ fileName, content });
      }

      if (toCompress.length === 0) {
        if (options.verbose) {
          console.log('\n  PAKK: No files to compress\n');
        }
        return;
      }

      console.log(`\n  PAKK: Compressing ${toCompress.length} files...\n`);

      let totalOriginal = 0;
      let totalCompressed = 0;

      for (const { fileName, content } of toCompress) {
        try {
          const result = await compress(content, {
            dictionary: options.dictionary,
            level: options.level,
          });

          // Emit compressed file
          this.emitFile({
            type: 'asset',
            fileName: fileName + options.ext,
            source: result.data,
          });

          // Generate Brotli if requested
          if (options.generateBrotli) {
            const brotliResult = await compress(content, {
              algorithm: 'brotli',
              level: Math.min(options.level, 11),
            });
            this.emitFile({
              type: 'asset',
              fileName: fileName + '.br',
              source: brotliResult.data,
            });
          }

          // Generate Gzip if requested
          if (options.generateGzip) {
            const gzipResult = await compress(content, {
              algorithm: 'gzip',
              level: Math.min(options.level, 9),
            });
            this.emitFile({
              type: 'asset',
              fileName: fileName + '.gz',
              source: gzipResult.data,
            });
          }

          totalOriginal += result.originalSize;
          totalCompressed += result.compressedSize;

          if (options.verbose) {
            console.log(
              `  + ${fileName.padEnd(40)} ` +
              `${formatBytes(result.originalSize)} -> ${formatBytes(result.compressedSize)} ` +
              `(-${result.savings}%)`
            );
          }
        } catch (error) {
          if (options.verbose) {
            console.error(`  ! Failed to compress ${fileName}:`, error);
          }
        }
      }

      // Summary
      const savings = totalOriginal > 0
        ? Math.round((1 - totalCompressed / totalOriginal) * 100)
        : 0;

      console.log('  --------------------------------------------------------');
      console.log(`  PAKK: ${toCompress.length} files compressed`);
      console.log(`  Size: ${formatBytes(totalOriginal)} -> ${formatBytes(totalCompressed)}`);
      console.log(`  Saved: ${formatBytes(totalOriginal - totalCompressed)} (-${savings}%)`);
      console.log('  --------------------------------------------------------\n');
    },
  };
}

export default pakk;
