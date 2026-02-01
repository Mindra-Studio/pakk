/**
 * PAKK CLI
 *
 * Smart compression with pre-trained dictionaries.
 *
 * Usage:
 *   pakk compress <files...> [-d dict] [-l level] [-o output]
 *   pakk decompress <files...> [-d dict] [-o output]
 *   pakk bench <files...> [-d dict]
 *   pakk cache <save|restore|list|clear> [options]
 *   pakk install [options]
 *   pakk store <status|prune|clear|path>
 *   pakk info
 *   pakk --help
 */

import { readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import pc from 'picocolors';
import {
  compress,
  decompress,
  benchmark,
  formatBenchmark,
  formatBytes,
  hasZstd,
} from '../core/compressor.js';
import {
  getAllDictionaries,
  detectFromExtension,
} from '../dictionaries/index.js';
import type { DictionaryType } from '../core/types.js';
import { commandCache } from './cache.js';
import { commandInstall, commandStore, commandAdd, commandRemove } from './install.js';

const VERSION = '1.0.0';

interface ParsedArgs {
  command: string;
  files: string[];
  options: {
    dictionary?: DictionaryType;
    level?: number;
    output?: string;
    recursive?: boolean;
    verbose?: boolean;
    help?: boolean;
    version?: boolean;
  };
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    files: [],
    options: {},
  };

  let i = 0;

  // First non-flag argument is the command
  while (i < args.length && args[i]?.startsWith('-')) {
    const arg = args[i]!;
    if (arg === '-h' || arg === '--help') result.options.help = true;
    if (arg === '-V' || arg === '--version') result.options.version = true;
    i++;
  }

  if (i < args.length) {
    result.command = args[i]!;
    i++;
  }

  // Parse remaining arguments
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '-d' || arg === '--dictionary') {
      const val = args[++i];
      if (val) result.options.dictionary = val as DictionaryType;
    } else if (arg === '-l' || arg === '--level') {
      result.options.level = parseInt(args[++i] ?? '11', 10);
    } else if (arg === '-o' || arg === '--output') {
      const val = args[++i];
      if (val) result.options.output = val;
    } else if (arg === '-r' || arg === '--recursive') {
      result.options.recursive = true;
    } else if (arg === '-v' || arg === '--verbose') {
      result.options.verbose = true;
    } else if (arg === '-h' || arg === '--help') {
      result.options.help = true;
    } else if (arg === '-V' || arg === '--version') {
      result.options.version = true;
    } else if (!arg.startsWith('-')) {
      result.files.push(arg);
    }

    i++;
  }

  return result;
}

function printHelp() {
  console.log(`
${pc.bold('PAKK')} - Smart compression with pre-trained dictionaries

${pc.bold('USAGE')}
  pakk <command> [options] [files...]

${pc.bold('COMMANDS')}
  compress     Compress files with PAKK
  decompress   Decompress .pakk files
  bench        Benchmark compression algorithms
  cache        CI/CD cache management (save/restore/list/clear)
  install      Install npm packages with dictionary compression
  add          Add packages to project (pakk add lodash)
  remove       Remove packages from project (pakk rm lodash)
  store        Manage PAKK package store
  info         Show dictionary information

${pc.bold('OPTIONS')}
  -d, --dictionary <type>   Dictionary: react, vue, typescript, css, json, auto
  -l, --level <n>           Compression level (1-19, default: 11)
  -o, --output <path>       Output file or directory
  -r, --recursive           Process directories recursively
  -v, --verbose             Verbose output
  -h, --help                Show this help
  -V, --version             Show version

${pc.bold('EXAMPLES')}
  ${pc.dim('# Compress a file')}
  pakk compress dist/main.js

  ${pc.dim('# Compress with specific dictionary')}
  pakk compress dist/*.js -d react -l 19

  ${pc.dim('# Decompress')}
  pakk decompress dist/main.js.pakk

  ${pc.dim('# Benchmark')}
  pakk bench dist/main.js

  ${pc.dim('# Show dictionaries')}
  pakk info

  ${pc.dim('# Install dependencies')}
  pakk install

  ${pc.dim('# Add a package')}
  pakk add lodash

  ${pc.dim('# Add dev dependency')}
  pakk add -D typescript

  ${pc.dim('# Remove a package')}
  pakk rm lodash

  ${pc.dim('# Show store status')}
  pakk store status
`);
}

function printVersion() {
  console.log(`pakk v${VERSION}`);
}

async function commandCompress(files: string[], options: ParsedArgs['options']) {
  if (files.length === 0) {
    console.error(pc.red('Error: No files specified'));
    process.exit(1);
  }

  const allFiles = expandFiles(files, options.recursive ?? false);

  if (allFiles.length === 0) {
    console.error(pc.red('Error: No valid files found'));
    process.exit(1);
  }

  console.log(`\n${pc.bold('PAKK Compress')}\n`);

  const zstdAvailable = await hasZstd();
  if (!zstdAvailable) {
    console.log(pc.yellow('  Note: zstd-napi not available, using Brotli fallback\n'));
  }

  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const filePath of allFiles) {
    try {
      const content = readFileSync(filePath);
      const dict = options.dictionary ?? detectFromExtension(filePath);

      const result = await compress(content, {
        dictionary: dict,
        level: options.level ?? 11,
      });

      const outputPath = options.output
        ? (allFiles.length === 1 ? options.output : join(options.output, basename(filePath) + '.pakk'))
        : filePath + '.pakk';

      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        const { mkdirSync } = await import('node:fs');
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, result.data);

      totalOriginal += result.originalSize;
      totalCompressed += result.compressedSize;

      console.log(
        `  ${pc.green('+')} ${basename(filePath).padEnd(40)} ` +
        `${formatBytes(result.originalSize).padStart(8)} ${pc.dim('->')} ${formatBytes(result.compressedSize).padStart(8)} ` +
        `${pc.cyan(`-${result.savings}%`)} ` +
        `${pc.dim(`[${result.algorithm}]`)}`
      );
    } catch (error) {
      console.error(`  ${pc.red('!')} ${basename(filePath)}: ${error}`);
    }
  }

  const savings = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

  console.log(`\n  ${pc.dim('─'.repeat(60))}`);
  console.log(`  ${pc.bold('Total:')} ${formatBytes(totalOriginal)} ${pc.dim('->')} ${formatBytes(totalCompressed)} ${pc.cyan(`(-${savings}%)`)}`);
  console.log(`  ${pc.bold('Saved:')} ${formatBytes(totalOriginal - totalCompressed)}\n`);
}

async function commandDecompress(files: string[], options: ParsedArgs['options']) {
  if (files.length === 0) {
    console.error(pc.red('Error: No files specified'));
    process.exit(1);
  }

  console.log(`\n${pc.bold('PAKK Decompress')}\n`);

  for (const filePath of files) {
    try {
      if (!existsSync(filePath)) {
        console.error(`  ${pc.red('!')} ${filePath}: File not found`);
        continue;
      }

      const content = readFileSync(filePath);

      const result = await decompress(content,
        options.dictionary ? { dictionary: options.dictionary } : {}
      );

      // Remove .pakk extension or add .out
      let outputPath: string;
      if (options.output) {
        outputPath = files.length === 1 ? options.output : join(options.output, basename(filePath).replace(/\.pakk$/, ''));
      } else {
        outputPath = filePath.endsWith('.pakk')
          ? filePath.slice(0, -5)
          : filePath + '.out';
      }

      writeFileSync(outputPath, result);

      console.log(
        `  ${pc.green('+')} ${basename(filePath)} ${pc.dim('->')} ${basename(outputPath)} ` +
        `${pc.dim(`(${formatBytes(result.length)})`)}`
      );
    } catch (error) {
      console.error(`  ${pc.red('!')} ${basename(filePath)}: ${error}`);
    }
  }

  console.log('');
}

async function commandBench(files: string[], options: ParsedArgs['options']) {
  if (files.length === 0) {
    console.error(pc.red('Error: No files specified'));
    process.exit(1);
  }

  console.log(`\n${pc.bold('PAKK Benchmark')}`);

  const zstdAvailable = await hasZstd();
  if (!zstdAvailable) {
    console.log(pc.yellow('\n  Note: zstd-napi not available, PAKK results will be limited\n'));
  }

  for (const filePath of files) {
    try {
      if (!existsSync(filePath)) {
        console.error(`  ${pc.red('!')} ${filePath}: File not found`);
        continue;
      }

      const content = readFileSync(filePath);
      const dict = options.dictionary ?? detectFromExtension(filePath);

      const result = await benchmark(basename(filePath), content,
        dict && dict !== 'auto' ? { dictionary: dict } : {}
      );

      console.log(formatBenchmark(result));
    } catch (error) {
      console.error(`  ${pc.red('!')} ${filePath}: ${error}`);
    }
  }

  console.log('');
}

async function commandInfo() {
  console.log(`\n${pc.bold('PAKK Dictionaries')}\n`);

  const dictionaries = getAllDictionaries();

  console.log('  Name          Size      Patterns   Frameworks');
  console.log('  ' + '─'.repeat(56));

  for (const dict of dictionaries) {
    console.log(
      `  ${dict.name.padEnd(12)}  ${formatBytes(dict.sizeBytes).padStart(8)}  ` +
      `${dict.patternCount.toString().padStart(8)}   ${dict.frameworks.slice(0, 3).join(', ')}`
    );
  }

  console.log('');

  // Check zstd availability
  const zstdAvailable = await hasZstd();
  console.log(`  ${pc.bold('ZSTD Status:')} ${zstdAvailable ? pc.green('Available (zstd-napi)') : pc.yellow('Not available (using Brotli fallback)')}`);

  if (!zstdAvailable) {
    console.log(`\n  ${pc.dim('Install zstd-napi for best compression:')}`);
    console.log(`  ${pc.cyan('npm install zstd-napi')}`);
  }

  console.log('');
}

function expandFiles(patterns: string[], recursive: boolean): string[] {
  const files: string[] = [];

  for (const pattern of patterns) {
    if (!existsSync(pattern)) {
      // Could be a glob pattern - for now, skip
      continue;
    }

    const stat = statSync(pattern);

    if (stat.isFile()) {
      files.push(pattern);
    } else if (stat.isDirectory() && recursive) {
      files.push(...getFilesRecursive(pattern));
    } else if (stat.isDirectory()) {
      // Non-recursive: just get immediate files
      const entries = readdirSync(pattern);
      for (const entry of entries) {
        const fullPath = join(pattern, entry);
        try {
          if (statSync(fullPath).isFile()) {
            files.push(fullPath);
          }
        } catch {
          // Skip
        }
      }
    }
  }

  return files;
}

function getFilesRecursive(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...getFilesRecursive(fullPath));
        } else {
          files.push(fullPath);
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }

  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.options.version) {
    printVersion();
    return;
  }

  // Handle commands with their own help/args parsing
  if (args.command === 'cache') {
    await commandCache(process.argv.slice(3));
    return;
  }

  if (args.command === 'install' || args.command === 'i') {
    await commandInstall(process.argv.slice(3));
    return;
  }

  if (args.command === 'store') {
    await commandStore(process.argv.slice(3));
    return;
  }

  if (args.command === 'add' || args.command === 'a') {
    await commandAdd(process.argv.slice(3));
    return;
  }

  if (args.command === 'remove' || args.command === 'rm' || args.command === 'uninstall' || args.command === 'un') {
    await commandRemove(process.argv.slice(3));
    return;
  }

  if (args.options.help || !args.command) {
    printHelp();
    return;
  }

  switch (args.command) {
    case 'compress':
    case 'c':
      await commandCompress(args.files, args.options);
      break;

    case 'decompress':
    case 'd':
    case 'extract':
    case 'x':
      await commandDecompress(args.files, args.options);
      break;

    case 'bench':
    case 'benchmark':
    case 'b':
      await commandBench(args.files, args.options);
      break;

    case 'info':
    case 'i':
      await commandInfo();
      break;

    default:
      console.error(pc.red(`Unknown command: ${args.command}`));
      console.log('Run "pakk --help" for usage information.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error(pc.red('Error:'), error.message);
  process.exit(1);
});
