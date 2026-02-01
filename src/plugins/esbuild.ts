/**
 * PAKK esbuild Plugin
 *
 * Adds PAKK compression to esbuild builds.
 *
 * @example
 * ```js
 * // build.js
 * import esbuild from 'esbuild';
 * import { pakk } from 'pakk/esbuild';
 *
 * await esbuild.build({
 *   entryPoints: ['src/index.ts'],
 *   outdir: 'dist',
 *   bundle: true,
 *   plugins: [
 *     pakk({
 *       dictionary: 'react',
 *       level: 11,
 *     })
 *   ],
 * });
 * ```
 */

import type { DictionaryType } from '../core/types.js';

export interface PakkEsbuildOptions {
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

interface Plugin {
  name: string;
  setup: (build: PluginBuild) => void | Promise<void>;
}

interface PluginBuild {
  initialOptions: BuildOptions;
  onEnd: (callback: (result: BuildResult) => void | Promise<void>) => void;
}

interface BuildOptions {
  outdir?: string;
  outfile?: string;
  write?: boolean;
}

interface BuildResult {
  outputFiles?: OutputFile[];
  errors: Message[];
  warnings: Message[];
}

interface OutputFile {
  path: string;
  contents: Uint8Array;
  text: string;
}

interface Message {
  text: string;
}

const defaultOptions: Required<PakkEsbuildOptions> = {
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

export function pakk(userOptions: PakkEsbuildOptions = {}): Plugin {
  const options = { ...defaultOptions, ...userOptions };

  return {
    name: 'pakk',

    setup(build) {
      // Check if write is disabled (required to access outputFiles)
      const hasOutputFiles = build.initialOptions.write === false;

      build.onEnd(async (result) => {
        // Skip if there are errors
        if (result.errors.length > 0) return;

        const { compress, formatBytes } = await import('../core/compressor.js');
        const { writeFileSync, readFileSync, readdirSync, statSync, existsSync } = await import('node:fs');
        const { join, extname, relative } = await import('node:path');

        const filesToCompress: Array<{ path: string; content: Buffer }> = [];

        if (hasOutputFiles && result.outputFiles) {
          // If write: false, use outputFiles
          for (const file of result.outputFiles) {
            const ext = extname(file.path);
            if (!options.include.includes(ext)) continue;
            if (options.exclude.some(e => file.path.includes(e))) continue;

            const content = Buffer.from(file.contents);
            if (content.length < options.threshold) continue;

            filesToCompress.push({ path: file.path, content });

            // Write the original file since write: false
            writeFileSync(file.path, file.contents);
          }
        } else {
          // If write: true (default), read files from disk
          const outDir = build.initialOptions.outdir || build.initialOptions.outfile?.replace(/[^/\\]+$/, '');
          if (!outDir || !existsSync(outDir)) return;

          const files = getAllFiles(outDir, { readdirSync, statSync, join });

          for (const filePath of files) {
            const ext = extname(filePath);
            if (!options.include.includes(ext)) continue;
            if (options.exclude.some(e => filePath.includes(e))) continue;

            try {
              const content = readFileSync(filePath);
              if (content.length < options.threshold) continue;

              filesToCompress.push({ path: filePath, content });
            } catch {
              // Skip unreadable files
            }
          }
        }

        if (filesToCompress.length === 0) {
          if (options.verbose) {
            console.log('\n  PAKK: No files to compress\n');
          }
          return;
        }

        console.log(`\n  PAKK: Compressing ${filesToCompress.length} files...\n`);

        let totalOriginal = 0;
        let totalCompressed = 0;
        const outDir = build.initialOptions.outdir || '';

        for (const { path: filePath, content } of filesToCompress) {
          try {
            const result = await compress(content, {
              dictionary: options.dictionary,
              level: options.level,
            });

            // Write compressed file
            writeFileSync(filePath + options.ext, result.data);

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

            totalOriginal += result.originalSize;
            totalCompressed += result.compressedSize;

            if (options.verbose) {
              const relativePath = relative(outDir, filePath);
              console.log(
                `  + ${relativePath.padEnd(40)} ` +
                `${formatBytes(result.originalSize)} -> ${formatBytes(result.compressedSize)} ` +
                `(-${result.savings}%)`
              );
            }
          } catch (error) {
            if (options.verbose) {
              console.error(`  ! Failed to compress ${filePath}:`, error);
            }
          }
        }

        // Summary
        const savings = totalOriginal > 0
          ? Math.round((1 - totalCompressed / totalOriginal) * 100)
          : 0;

        console.log('  --------------------------------------------------------');
        console.log(`  PAKK: ${filesToCompress.length} files compressed`);
        console.log(`  Size: ${formatBytes(totalOriginal)} -> ${formatBytes(totalCompressed)}`);
        console.log(`  Saved: ${formatBytes(totalOriginal - totalCompressed)} (-${savings}%)`);
        console.log('  --------------------------------------------------------\n');
      });
    },
  };
}

function getAllFiles(
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
          getAllFiles(fullPath, fs, files);
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
