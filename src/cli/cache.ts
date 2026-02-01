/**
 * PAKK Cache - CI/CD Cache with TAR + ZSTD Compression
 *
 * Architecture optimisée :
 * - Crée UNE archive tar du dossier (streaming)
 * - Compresse avec ZSTD niveau 6 + dictionnaire
 * - Un seul fichier .tar.zst au lieu de 50,000 fichiers
 *
 * Résout le problème de hang sur Windows documenté dans :
 * - https://github.com/actions/cache/issues/301
 * - https://github.com/actions/cache/issues/984
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import pc from 'picocolors';
import { formatBytes, hasZstd } from '../core/compressor.js';
import { getDictionary } from '../dictionaries/index.js';

// Cache metadata
interface CacheManifest {
  version: number;
  key: string;
  createdAt: string;
  originalSize: number;
  compressedSize: number;
  paths: string[];
  compressionLevel: number;
  dictionary: string | null;
}

// Default cache directory
const DEFAULT_CACHE_DIR = process.env['PAKK_CACHE_DIR'] || join(process.cwd(), '.pakk-cache');

// Compression level for cache (3-6 is optimal for CI/CD)
const CACHE_COMPRESSION_LEVEL = 6;

// Platform detection
const IS_WINDOWS = process.platform === 'win32';

/**
 * Get cache key hash
 */
function getCacheKeyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Calculate directory size recursively
 */
function getDirSize(dir: string): number {
  let size = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === '.git' || entry === '.pakk-cache') continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          size += getDirSize(fullPath);
        } else {
          size += stat.size;
        }
      } catch {
        // Skip inaccessible
      }
    }
  } catch {
    // Skip inaccessible
  }
  return size;
}

/**
 * Count files in directory
 */
function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === '.git' || entry === '.pakk-cache') continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          count += countFiles(fullPath);
        } else {
          count++;
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
  return count;
}

/**
 * Check if tar command is available
 */
async function hasTar(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('tar', ['--version'], { stdio: 'ignore', shell: true });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Check if zstd CLI is available
 */
async function hasZstdCli(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('zstd', ['--version'], { stdio: 'ignore', shell: true });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Convert Windows path to Unix-style for tar
 */
function toUnixPath(p: string): string {
  if (IS_WINDOWS) {
    // Convert C:\path\to\file to /c/path/to/file for MSYS/Git Bash tar
    return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');
  }
  return p;
}

/**
 * Create tar archive using CLI (more reliable on Windows)
 */
async function createTarArchive(
  sourcePath: string,
  outputPath: string,
  verbose: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sourceDir = dirname(sourcePath);
    const sourceName = basename(sourcePath);

    // Convert paths for tar on Windows
    const tarOutput = toUnixPath(outputPath);
    const tarSourceDir = toUnixPath(sourceDir);

    // Use tar command
    const args = ['-cf', tarOutput, '-C', tarSourceDir, sourceName];

    if (verbose) {
      console.log(`  ${pc.dim(`tar ${args.join(' ')}`)}`);
    }

    const proc = spawn('tar', args, { shell: true });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`tar error: ${err.message}`));
    });
  });
}

/**
 * Extract tar archive using CLI
 */
async function extractTarArchive(
  archivePath: string,
  outputDir: string,
  verbose: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Convert paths for tar on Windows
    const tarArchive = toUnixPath(archivePath);
    const tarOutputDir = toUnixPath(outputDir);

    const args = ['-xf', tarArchive, '-C', tarOutputDir];

    if (verbose) {
      console.log(`  ${pc.dim(`tar ${args.join(' ')}`)}`);
    }

    const proc = spawn('tar', args, { shell: true });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar extract failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`tar error: ${err.message}`));
    });
  });
}

/**
 * Compress file with zstd-napi + dictionary
 */
async function compressWithZstdDict(
  inputPath: string,
  outputPath: string,
  level: number,
  dictName: string | null,
  verbose: boolean
): Promise<void> {
  const zstdAvailable = await hasZstd();

  if (!zstdAvailable) {
    // Fallback to zstd CLI
    const zstdCliAvailable = await hasZstdCli();
    if (zstdCliAvailable) {
      return compressWithZstdCli(inputPath, outputPath, level, verbose);
    }
    throw new Error('Neither zstd-napi nor zstd CLI available');
  }

  // Use zstd-napi with dictionary
  const zstd = await import('zstd-napi');
  const inputData = readFileSync(inputPath);

  let compressed: Buffer;

  if (dictName) {
    try {
      const dict = getDictionary(dictName as any);
      if (dict && dict.length > 0) {
        const compressor = new zstd.Compressor();
        compressor.setParameters({ compressionLevel: level });
        compressor.loadDictionary(dict);
        compressed = compressor.compress(inputData);

        if (verbose) {
          console.log(`  ${pc.dim(`Using dictionary: ${dictName}`)}`);
        }
      } else {
        compressed = zstd.compress(inputData, { compressionLevel: level });
      }
    } catch {
      // Fallback to no dictionary
      compressed = zstd.compress(inputData, { compressionLevel: level });
    }
  } else {
    compressed = zstd.compress(inputData, { compressionLevel: level });
  }

  writeFileSync(outputPath, compressed);
}

/**
 * Compress file with zstd CLI (fallback)
 */
async function compressWithZstdCli(
  inputPath: string,
  outputPath: string,
  level: number,
  verbose: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [`-${level}`, '-f', inputPath, '-o', outputPath];

    if (verbose) {
      console.log(`  ${pc.dim(`zstd ${args.join(' ')}`)}`);
    }

    const proc = spawn('zstd', args, { shell: true });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zstd failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`zstd error: ${err.message}`));
    });
  });
}

/**
 * Decompress file with zstd-napi + dictionary
 */
async function decompressWithZstdDict(
  inputPath: string,
  outputPath: string,
  dictName: string | null,
  verbose: boolean
): Promise<void> {
  const zstdAvailable = await hasZstd();

  if (!zstdAvailable) {
    // Fallback to zstd CLI
    const zstdCliAvailable = await hasZstdCli();
    if (zstdCliAvailable) {
      return decompressWithZstdCli(inputPath, outputPath, verbose);
    }
    throw new Error('Neither zstd-napi nor zstd CLI available');
  }

  // Use zstd-napi with dictionary
  const zstd = await import('zstd-napi');
  const inputData = readFileSync(inputPath);

  let decompressed: Buffer;

  if (dictName) {
    try {
      const dict = getDictionary(dictName as any);
      if (dict && dict.length > 0) {
        const decompressor = new zstd.Decompressor();
        decompressor.loadDictionary(dict);
        decompressed = decompressor.decompress(inputData);

        if (verbose) {
          console.log(`  ${pc.dim(`Using dictionary: ${dictName}`)}`);
        }
      } else {
        decompressed = zstd.decompress(inputData);
      }
    } catch {
      // Fallback to no dictionary
      decompressed = zstd.decompress(inputData);
    }
  } else {
    decompressed = zstd.decompress(inputData);
  }

  writeFileSync(outputPath, decompressed);
}

/**
 * Decompress file with zstd CLI (fallback)
 */
async function decompressWithZstdCli(
  inputPath: string,
  outputPath: string,
  verbose: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-d', '-f', inputPath, '-o', outputPath];

    if (verbose) {
      console.log(`  ${pc.dim(`zstd ${args.join(' ')}`)}`);
    }

    const proc = spawn('zstd', args, { shell: true });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zstd decompress failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`zstd error: ${err.message}`));
    });
  });
}

/**
 * Detect best dictionary for path
 */
function detectDictionary(paths: string[]): string | null {
  for (const p of paths) {
    const name = basename(p).toLowerCase();
    if (name === 'node_modules' || name.includes('node_modules')) {
      return 'node_modules';
    }
    if (name === 'vendor' || name === 'go.mod') {
      return 'go';
    }
    if (name === 'target' && existsSync(join(dirname(p), 'Cargo.toml'))) {
      return 'rust';
    }
    if (name === '.venv' || name === 'venv' || name === '__pycache__') {
      return 'python';
    }
  }
  return null;
}

/**
 * Save directories to PAKK cache
 *
 * Architecture:
 * 1. Create tar archive of all paths
 * 2. Compress with ZSTD + dictionary (level 6)
 * 3. Store as single .tar.zst file
 */
export async function cacheSave(
  paths: string[],
  key: string,
  options: {
    cacheDir?: string;
    verbose?: boolean;
    level?: number;
    dictionary?: string;
  } = {}
): Promise<{ originalSize: number; compressedSize: number; fileCount: number }> {
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const verbose = options.verbose ?? false;
  const level = options.level ?? CACHE_COMPRESSION_LEVEL;

  // Check prerequisites
  const tarAvailable = await hasTar();
  if (!tarAvailable) {
    throw new Error('tar command not found. Please install tar.');
  }

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const keyHash = getCacheKeyHash(key);
  const cacheFile = join(cacheDir, `${keyHash}.tar.zst`);
  const manifestFile = join(cacheDir, `${keyHash}.manifest.json`);
  const tempTar = join(cacheDir, `${keyHash}.tar`);

  // Remove existing cache
  if (existsSync(cacheFile)) unlinkSync(cacheFile);
  if (existsSync(manifestFile)) unlinkSync(manifestFile);
  if (existsSync(tempTar)) unlinkSync(tempTar);

  console.log(`\n${pc.bold('PAKK Cache Save')}`);
  console.log(`${pc.dim('Key:')} ${key}`);
  console.log(`${pc.dim('Hash:')} ${keyHash}`);
  console.log(`${pc.dim('Level:')} ${level}\n`);

  // Calculate original size and file count
  let totalOriginalSize = 0;
  let totalFileCount = 0;
  const validPaths: string[] = [];

  for (const inputPath of paths) {
    const absPath = resolve(inputPath);
    if (!existsSync(absPath)) {
      console.log(`${pc.yellow('!')} Path not found: ${inputPath}`);
      continue;
    }

    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      const size = getDirSize(absPath);
      const count = countFiles(absPath);
      totalOriginalSize += size;
      totalFileCount += count;
      console.log(`  ${pc.cyan('→')} ${inputPath} ${pc.dim(`(${count.toLocaleString()} files, ${formatBytes(size)})`)}`);
    } else {
      totalOriginalSize += stat.size;
      totalFileCount += 1;
      console.log(`  ${pc.cyan('→')} ${inputPath} ${pc.dim(`(${formatBytes(stat.size)})`)}`);
    }
    validPaths.push(absPath);
  }

  if (validPaths.length === 0) {
    throw new Error('No valid paths to cache');
  }

  // Detect dictionary
  const dictName = options.dictionary || detectDictionary(validPaths);
  if (dictName) {
    console.log(`${pc.dim('Dictionary:')} ${dictName}`);
  }

  console.log('');

  const startTime = performance.now();

  // Step 1: Create tar archive
  console.log(`${pc.cyan('1.')} Creating tar archive...`);

  // For multiple paths, we need to handle them specially
  // Create a combined tar by running tar for each path
  if (validPaths.length === 1) {
    await createTarArchive(validPaths[0]!, tempTar, verbose);
  } else {
    // Multiple paths - create tar with all of them
    await new Promise<void>((resolve, reject) => {
      // Build tar command for multiple paths (convert paths for Windows)
      const args = ['-cf', toUnixPath(tempTar)];
      for (const p of validPaths) {
        args.push('-C', toUnixPath(dirname(p)), basename(p));
      }

      if (verbose) {
        console.log(`  ${pc.dim(`tar ${args.join(' ')}`)}`);
      }

      const proc = spawn('tar', args, { shell: true });
      let stderr = '';
      proc.stderr?.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tar failed: ${stderr}`));
      });
      proc.on('error', reject);
    });
  }

  const tarSize = statSync(tempTar).size;
  console.log(`   ${pc.dim('Tar size:')} ${formatBytes(tarSize)}`);

  // Step 2: Compress with ZSTD + dictionary
  console.log(`${pc.cyan('2.')} Compressing with ZSTD (level ${level})...`);

  await compressWithZstdDict(tempTar, cacheFile, level, dictName, verbose);

  // Clean up temp tar
  unlinkSync(tempTar);

  const compressedSize = statSync(cacheFile).size;
  const elapsed = Math.round(performance.now() - startTime);
  const ratio = totalOriginalSize > 0 ? (compressedSize / totalOriginalSize * 100).toFixed(1) : '0';
  const savings = totalOriginalSize > 0 ? Math.round((1 - compressedSize / totalOriginalSize) * 100) : 0;

  // Write manifest
  const manifest: CacheManifest = {
    version: 2,
    key,
    createdAt: new Date().toISOString(),
    originalSize: totalOriginalSize,
    compressedSize,
    paths: validPaths.map((p) => basename(p)),
    compressionLevel: level,
    dictionary: dictName,
  };
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  // Summary
  console.log(`\n${pc.dim('─'.repeat(50))}`);
  console.log(`${pc.bold('Files:')}       ${totalFileCount.toLocaleString()}`);
  console.log(`${pc.bold('Original:')}    ${formatBytes(totalOriginalSize)}`);
  console.log(`${pc.bold('Compressed:')}  ${formatBytes(compressedSize)} ${pc.green(`(${ratio}%, -${savings}%)`)}`);
  console.log(`${pc.bold('Time:')}        ${elapsed}ms`);
  console.log(`${pc.bold('Speed:')}       ${formatBytes(Math.round(totalOriginalSize / (elapsed / 1000)))}/s`);
  console.log(`\n${pc.green('✓')} Cache saved: ${cacheFile}\n`);

  return { originalSize: totalOriginalSize, compressedSize, fileCount: totalFileCount };
}

/**
 * Restore from PAKK cache
 */
export async function cacheRestore(
  key: string,
  options: {
    cacheDir?: string;
    outputDir?: string;
    verbose?: boolean;
  } = {}
): Promise<{ restored: boolean; fileCount: number; size: number }> {
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const outputDir = options.outputDir || process.cwd();
  const verbose = options.verbose ?? false;

  const keyHash = getCacheKeyHash(key);
  const cacheFile = join(cacheDir, `${keyHash}.tar.zst`);
  const manifestFile = join(cacheDir, `${keyHash}.manifest.json`);
  const tempTar = join(cacheDir, `${keyHash}.restore.tar`);

  console.log(`\n${pc.bold('PAKK Cache Restore')}`);
  console.log(`${pc.dim('Key:')} ${key}`);
  console.log(`${pc.dim('Hash:')} ${keyHash}\n`);

  // Check if cache exists
  if (!existsSync(cacheFile)) {
    // Try legacy format (directory-based)
    const legacyCacheDir = join(cacheDir, keyHash);
    if (existsSync(legacyCacheDir)) {
      console.log(`${pc.yellow('!')} Legacy cache format detected. Please re-save the cache.`);
    } else {
      console.log(`${pc.yellow('Cache not found')}`);
    }
    return { restored: false, fileCount: 0, size: 0 };
  }

  // Read manifest
  let manifest: CacheManifest | null = null;
  if (existsSync(manifestFile)) {
    try {
      manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
    } catch {
      // Ignore manifest errors
    }
  }

  if (manifest) {
    console.log(`${pc.dim('Created:')} ${manifest.createdAt}`);
    console.log(`${pc.dim('Paths:')} ${manifest.paths.join(', ')}`);
    console.log(`${pc.dim('Size:')} ${formatBytes(manifest.compressedSize)} (${formatBytes(manifest.originalSize)} uncompressed)`);
    if (manifest.dictionary) {
      console.log(`${pc.dim('Dictionary:')} ${manifest.dictionary}`);
    }
    console.log('');
  }

  const startTime = performance.now();

  // Step 1: Decompress with ZSTD
  console.log(`${pc.cyan('1.')} Decompressing...`);
  await decompressWithZstdDict(cacheFile, tempTar, manifest?.dictionary || null, verbose);

  const tarSize = statSync(tempTar).size;
  console.log(`   ${pc.dim('Tar size:')} ${formatBytes(tarSize)}`);

  // Step 2: Extract tar
  console.log(`${pc.cyan('2.')} Extracting...`);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  await extractTarArchive(tempTar, outputDir, verbose);

  // Clean up
  unlinkSync(tempTar);

  const elapsed = Math.round(performance.now() - startTime);
  const restoredSize = manifest?.originalSize || tarSize;

  console.log(`\n${pc.dim('─'.repeat(50))}`);
  console.log(`${pc.bold('Restored:')} ${formatBytes(restoredSize)}`);
  console.log(`${pc.bold('Time:')} ${elapsed}ms`);
  console.log(`${pc.bold('Speed:')} ${formatBytes(Math.round(restoredSize / (elapsed / 1000)))}/s`);
  console.log(`\n${pc.green('✓')} Cache restored to: ${outputDir}\n`);

  return {
    restored: true,
    fileCount: manifest?.paths.length || 1,
    size: restoredSize,
  };
}

/**
 * List cached entries
 */
export async function cacheList(options: { cacheDir?: string } = {}): Promise<void> {
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;

  console.log(`\n${pc.bold('PAKK Cache')}`);
  console.log(`${pc.dim('Location:')} ${cacheDir}\n`);

  if (!existsSync(cacheDir)) {
    console.log(`${pc.yellow('No cache found')}\n`);
    return;
  }

  const entries = readdirSync(cacheDir).filter((f) => f.endsWith('.manifest.json'));
  let totalSize = 0;

  if (entries.length === 0) {
    console.log(`${pc.yellow('No cache entries')}\n`);
    return;
  }

  console.log('  Key                              Compressed    Original    Ratio    Created');
  console.log('  ' + '─'.repeat(76));

  for (const entry of entries) {
    const manifestPath = join(cacheDir, entry);

    try {
      const manifest: CacheManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const date = new Date(manifest.createdAt).toLocaleDateString();
      const ratio = manifest.originalSize > 0
        ? Math.round((manifest.compressedSize / manifest.originalSize) * 100)
        : 0;

      console.log(
        `  ${manifest.key.substring(0, 30).padEnd(30)}  ` +
        `${formatBytes(manifest.compressedSize).padStart(10)}  ` +
        `${formatBytes(manifest.originalSize).padStart(10)}  ` +
        `${(ratio + '%').padStart(5)}    ` +
        `${date}`
      );

      totalSize += manifest.compressedSize;
    } catch {
      // Skip invalid entries
    }
  }

  console.log('  ' + '─'.repeat(76));
  console.log(`  ${pc.bold('Total cache size:')} ${formatBytes(totalSize)}\n`);
}

/**
 * Clear cache
 */
export async function cacheClear(
  key?: string,
  options: { cacheDir?: string } = {}
): Promise<void> {
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;

  if (key) {
    const keyHash = getCacheKeyHash(key);
    const cacheFile = join(cacheDir, `${keyHash}.tar.zst`);
    const manifestFile = join(cacheDir, `${keyHash}.manifest.json`);

    let cleared = false;

    if (existsSync(cacheFile)) {
      unlinkSync(cacheFile);
      cleared = true;
    }
    if (existsSync(manifestFile)) {
      unlinkSync(manifestFile);
      cleared = true;
    }

    // Also check legacy format
    const legacyDir = join(cacheDir, keyHash);
    if (existsSync(legacyDir)) {
      const { rmSync } = await import('node:fs');
      rmSync(legacyDir, { recursive: true, force: true });
      cleared = true;
    }

    if (cleared) {
      console.log(`${pc.green('✓')} Cleared cache for key: ${key}`);
    } else {
      console.log(`${pc.yellow('!')} Cache not found for key: ${key}`);
    }
  } else {
    if (existsSync(cacheDir)) {
      const { rmSync } = await import('node:fs');
      rmSync(cacheDir, { recursive: true, force: true });
      console.log(`${pc.green('✓')} Cleared all cache`);
    } else {
      console.log(`${pc.yellow('!')} No cache to clear`);
    }
  }
}

/**
 * Parse cache subcommand arguments
 */
export interface CacheArgs {
  subcommand: 'save' | 'restore' | 'list' | 'clear';
  paths: string[];
  key?: string;
  cacheDir?: string;
  outputDir?: string;
  verbose?: boolean;
  level?: number;
  dictionary?: string;
}

export function parseCacheArgs(args: string[]): CacheArgs {
  const result: CacheArgs = {
    subcommand: 'list',
    paths: [],
  };

  let i = 0;

  // First arg is subcommand
  if (args[i] && !args[i]!.startsWith('-')) {
    result.subcommand = args[i] as CacheArgs['subcommand'];
    i++;
  }

  // Parse remaining args
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '-k' || arg === '--key') {
      const val = args[++i];
      if (val) result.key = val;
    } else if (arg === '-c' || arg === '--cache-dir') {
      const val = args[++i];
      if (val) result.cacheDir = val;
    } else if (arg === '-o' || arg === '--output') {
      const val = args[++i];
      if (val) result.outputDir = val;
    } else if (arg === '-v' || arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '-l' || arg === '--level') {
      result.level = parseInt(args[++i] ?? '6', 10);
    } else if (arg === '-d' || arg === '--dictionary') {
      const val = args[++i];
      if (val) result.dictionary = val;
    } else if (!arg.startsWith('-')) {
      result.paths.push(arg);
    }

    i++;
  }

  return result;
}

/**
 * Print cache help
 */
export function printCacheHelp(): void {
  console.log(`
${pc.bold('PAKK Cache')} - CI/CD cache with TAR + ZSTD compression

${pc.bold('USAGE')}
  pakk cache <command> [options]

${pc.bold('COMMANDS')}
  save <paths...>    Save directories to cache (creates .tar.zst)
  restore            Restore from cache
  list               List cached entries
  clear [key]        Clear cache (all or specific key)

${pc.bold('OPTIONS')}
  -k, --key <key>        Cache key (required for save/restore)
  -c, --cache-dir <dir>  Cache directory (default: .pakk-cache)
  -o, --output <dir>     Output directory for restore (default: cwd)
  -l, --level <n>        Compression level 1-19 (default: 6)
  -d, --dictionary <d>   Dictionary: node_modules, go, rust, python
  -v, --verbose          Verbose output

${pc.bold('EXAMPLES')}
  ${pc.dim('# Save node_modules to cache')}
  pakk cache save node_modules -k "deps-abc123"

  ${pc.dim('# Restore from cache')}
  pakk cache restore -k "deps-abc123"

  ${pc.dim('# Save with custom level')}
  pakk cache save node_modules -k "deps-abc" -l 3

  ${pc.dim('# List cached entries')}
  pakk cache list

${pc.bold('ARCHITECTURE')}
  PAKK Cache uses TAR + ZSTD (same as GitHub Actions):

  ${pc.dim('1.')} Create single tar archive of all paths
  ${pc.dim('2.')} Compress with ZSTD level 6 + dictionary
  ${pc.dim('3.')} Store as .tar.zst (one file, not 50,000)

  This avoids the Windows hang issue documented in:
  ${pc.dim('https://github.com/actions/cache/issues/301')}

${pc.bold('ENVIRONMENT')}
  PAKK_CACHE_DIR    Override default cache directory
`);
}

/**
 * Main cache command handler
 */
export async function commandCache(args: string[]): Promise<void> {
  const parsed = parseCacheArgs(args);

  if (args.includes('-h') || args.includes('--help')) {
    printCacheHelp();
    return;
  }

  switch (parsed.subcommand) {
    case 'save':
      if (!parsed.key) {
        console.error(pc.red('Error: --key is required for save'));
        process.exit(1);
      }
      if (parsed.paths.length === 0) {
        console.error(pc.red('Error: No paths specified'));
        process.exit(1);
      }
      await cacheSave(parsed.paths, parsed.key, {
        ...(parsed.cacheDir && { cacheDir: parsed.cacheDir }),
        ...(parsed.verbose && { verbose: parsed.verbose }),
        ...(parsed.level && { level: parsed.level }),
        ...(parsed.dictionary && { dictionary: parsed.dictionary }),
      });
      break;

    case 'restore': {
      if (!parsed.key) {
        console.error(pc.red('Error: --key is required for restore'));
        process.exit(1);
      }
      const result = await cacheRestore(parsed.key, {
        ...(parsed.cacheDir && { cacheDir: parsed.cacheDir }),
        ...(parsed.outputDir && { outputDir: parsed.outputDir }),
        ...(parsed.verbose && { verbose: parsed.verbose }),
      });
      if (!result.restored) {
        process.exit(1);
      }
      break;
    }

    case 'list':
      await cacheList(parsed.cacheDir ? { cacheDir: parsed.cacheDir } : {});
      break;

    case 'clear':
      await cacheClear(parsed.key, parsed.cacheDir ? { cacheDir: parsed.cacheDir } : {});
      break;

    default:
      printCacheHelp();
  }
}
