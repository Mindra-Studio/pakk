/**
 * PAKK Next.js Plugin
 *
 * Adds PAKK compression to Next.js builds.
 * Compatible with both Webpack and Turbopack (Next.js 16+)
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withPakk } from 'pakk/next';
 *
 * export default withPakk({
 *   dictionary: 'react',
 *   level: 11,
 * })({
 *   // Your Next.js config
 * });
 * ```
 */

import type { DictionaryType } from '../core/types.js';

export interface PakkNextOptions {
  /** Dictionary to use: 'react', 'vue', 'typescript', 'auto' (default: 'react') */
  dictionary?: DictionaryType;
  /** Compression level 1-19 (default: 11) */
  level?: number;
  /** Minimum file size to compress in bytes (default: 1024) */
  threshold?: number;
  /** File extensions to compress */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Also generate .br files (default: false) */
  generateBrotli?: boolean;
  /** Verbose logging (default: false) */
  verbose?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NextConfig = any;

interface WebpackConfig {
  plugins?: unknown[];
  [key: string]: unknown;
}

interface WebpackContext {
  isServer: boolean;
  dev: boolean;
  [key: string]: unknown;
}

interface Compiler {
  hooks: {
    afterEmit: {
      tapPromise: (name: string, callback: (compilation: Compilation) => Promise<void>) => void;
    };
  };
  options: {
    output?: {
      path?: string;
    };
  };
}

interface Compilation {
  assets: Record<string, unknown>;
}

const defaultOptions: Required<PakkNextOptions> = {
  dictionary: 'react',
  level: 11,
  threshold: 1024,
  include: ['.js', '.css', '.html', '.json'],
  exclude: ['.map', '.gz', '.br', '.zst', '.pakk', '_next/static/chunks/webpack', 'node_modules'],
  generateBrotli: false,
  verbose: false,
};

/**
 * Compress files in a directory (works for both Webpack and Turbopack output)
 */
async function compressDirectory(
  outputPath: string,
  options: Required<PakkNextOptions>
): Promise<void> {
  const { readFileSync, writeFileSync, statSync, readdirSync } = await import('node:fs');
  const { extname, relative, join } = await import('node:path');
  const { compress, formatBytes } = await import('../core/compressor.js');

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

  const files = getAllFiles(outputPath);
  const toCompress = files.filter(file => {
    const ext = extname(file);

    if (options.exclude.some(e => file.includes(e))) {
      return false;
    }

    if (!options.include.includes(ext)) {
      return false;
    }

    try {
      const stats = statSync(file);
      return stats.size >= options.threshold;
    } catch {
      return false;
    }
  });

  if (toCompress.length === 0) return;

  console.log(`\n  PAKK: Compressing ${toCompress.length} files...`);

  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const filePath of toCompress) {
    try {
      const content = readFileSync(filePath);
      const result = await compress(content, {
        dictionary: options.dictionary,
        level: options.level,
      });

      writeFileSync(filePath + '.pakk', result.data);

      if (options.generateBrotli) {
        const brotliResult = await compress(content, {
          algorithm: 'brotli',
          level: Math.min(options.level, 11),
        });
        writeFileSync(filePath + '.br', brotliResult.data);
      }

      totalOriginal += result.originalSize;
      totalCompressed += result.compressedSize;

      if (options.verbose) {
        const relativePath = relative(outputPath, filePath);
        console.log(
          `  + ${relativePath}: ${formatBytes(result.originalSize)} -> ${formatBytes(result.compressedSize)} (-${result.savings}%)`
        );
      }
    } catch (error) {
      if (options.verbose) {
        console.error(`  ! Failed: ${filePath}`, error);
      }
    }
  }

  const savings = totalOriginal > 0
    ? Math.round((1 - totalCompressed / totalOriginal) * 100)
    : 0;

  console.log(`  PAKK: Saved ${formatBytes(totalOriginal - totalCompressed)} (-${savings}%)\n`);
}

/**
 * Webpack plugin for PAKK (legacy, for webpack mode)
 */
class PakkWebpackPlugin {
  private options: Required<PakkNextOptions>;

  constructor(options: PakkNextOptions = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tapPromise('PakkPlugin', async (_compilation) => {
      const outputPath = compiler.options.output?.path;
      if (!outputPath) return;

      await compressDirectory(outputPath, this.options);
    });
  }
}

/**
 * Create Next.js config wrapper with PAKK compression
 * Works with both Webpack and Turbopack (Next.js 16+)
 */
export function withPakk(pakkOptions: PakkNextOptions = {}) {
  const options = { ...defaultOptions, ...pakkOptions };

  return (nextConfig: NextConfig = {}): NextConfig => {
    // Store options for post-build access
    const pakkConfig = {
      ...nextConfig,

      // Add empty turbopack config to silence the warning
      turbopack: nextConfig.turbopack ?? {},

      // Webpack plugin (for --webpack mode)
      webpack: (config: WebpackConfig, context: WebpackContext) => {
        // Only add plugin for production client builds
        if (!context.dev && !context.isServer) {
          config.plugins = config.plugins ?? [];
          config.plugins.push(new PakkWebpackPlugin(options));
        }

        // Call existing webpack config if present
        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, context);
        }

        return config;
      },
    };

    // For Turbopack: Register a build completion handler
    // This uses process events since Turbopack doesn't have plugin hooks
    if (process.env['NODE_ENV'] === 'production' && !process.env['__PAKK_REGISTERED__']) {
      process.env['__PAKK_REGISTERED__'] = 'true';

      // Run compression after build completes
      process.on('beforeExit', async () => {
        const { existsSync } = await import('node:fs');
        const { join } = await import('node:path');

        const outputDir = join(process.cwd(), '.next');
        const staticDir = join(outputDir, 'static');

        if (existsSync(staticDir)) {
          await compressDirectory(staticDir, options);
        }
      });
    }

    return pakkConfig;
  };
}

/**
 * Standalone function to compress Next.js output
 * Can be used as a postbuild script
 */
export async function compressNextOutput(options: PakkNextOptions = {}) {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const opts = { ...defaultOptions, ...options };
  const outputDir = join(process.cwd(), '.next');
  const staticDir = join(outputDir, 'static');

  if (!existsSync(staticDir)) {
    console.log('  PAKK: No .next/static directory found');
    return;
  }

  await compressDirectory(staticDir, opts);
}

export { PakkWebpackPlugin };
export default withPakk;
