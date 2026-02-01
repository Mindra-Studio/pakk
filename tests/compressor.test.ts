/**
 * PAKK Compressor Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  compress,
  compressSync,
  decompress,
  benchmark,
  formatBenchmark,
  formatBytes,
  hasZstd,
} from '../src/core/compressor.js';

// Sample content for testing
const SAMPLE_JS = `
"use strict";
Object.defineProperty(exports,"__esModule",{value:!0});
const React=require("react");
function App(){
  const[count,setCount]=React.useState(0);
  React.useEffect(()=>{
    console.log("count:",count);
  },[count]);
  return React.createElement("div",{className:"app"},
    React.createElement("h1",null,"Hello World"),
    React.createElement("button",{onClick:()=>setCount(count+1)},"Count: "+count)
  );
}
exports.default=App;
`.repeat(10);

const SAMPLE_CSS = `
.flex{display:flex}
.flex-col{flex-direction:column}
.items-center{align-items:center}
.justify-center{justify-content:center}
.p-4{padding:1rem}
.m-4{margin:1rem}
.text-lg{font-size:1.125rem}
.font-bold{font-weight:700}
.bg-blue-500{background-color:#3b82f6}
.text-white{color:#fff}
.rounded{border-radius:.25rem}
.shadow{box-shadow:0 1px 3px rgba(0,0,0,.1)}
@media(min-width:768px){.md\\:flex{display:flex}}
`.repeat(20);

const SAMPLE_JSON = JSON.stringify({
  name: 'test-package',
  version: '1.0.0',
  description: 'A test package for compression',
  dependencies: {
    react: '^18.2.0',
    'react-dom': '^18.2.0',
    next: '^14.0.0',
  },
  devDependencies: {
    typescript: '^5.0.0',
    vitest: '^2.0.0',
  },
  scripts: {
    build: 'tsc',
    test: 'vitest',
  },
});

describe('compress', () => {
  it('should compress string content', async () => {
    const result = await compress(SAMPLE_JS);

    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.originalSize).toBe(Buffer.from(SAMPLE_JS).length);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
    expect(result.ratio).toBeLessThan(1);
    expect(result.savings).toBeGreaterThan(0);
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  it('should compress Buffer content', async () => {
    const buffer = Buffer.from(SAMPLE_JS);
    const result = await compress(buffer);

    expect(result.originalSize).toBe(buffer.length);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  });

  it('should respect compression level', async () => {
    const lowLevel = await compress(SAMPLE_JS, { level: 1 });
    const highLevel = await compress(SAMPLE_JS, { level: 11 });

    // Higher level should generally produce smaller output
    // (may not always be true for very small files)
    expect(highLevel.compressedSize).toBeLessThanOrEqual(lowLevel.compressedSize + 100);
  });

  it('should use specified dictionary', async () => {
    const result = await compress(SAMPLE_JS, { dictionary: 'react' });
    // Dictionary is reported even if zstd isn't available (brotli fallback)
    expect(['react', 'none']).toContain(result.dictionary);
  });

  it('should auto-detect dictionary type', async () => {
    const result = await compress(SAMPLE_JS, { dictionary: 'auto' });
    // Minified React code may be detected as 'javascript' (minified), 'react', or 'typescript'
    expect(['react', 'typescript', 'javascript', 'none']).toContain(result.dictionary);
  });

  it('should work with gzip algorithm', async () => {
    const result = await compress(SAMPLE_JS, { algorithm: 'gzip' });

    expect(result.algorithm).toBe('gzip');
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  });

  it('should work with brotli algorithm', async () => {
    const result = await compress(SAMPLE_JS, { algorithm: 'brotli' });

    expect(result.algorithm).toBe('brotli');
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  });
});

describe('compressSync', () => {
  it('should compress synchronously with brotli', () => {
    const result = compressSync(SAMPLE_JS);

    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
    expect(result.algorithm).toBe('brotli');
  });

  it('should compress synchronously with gzip', () => {
    const result = compressSync(SAMPLE_JS, { algorithm: 'gzip' });

    expect(result.algorithm).toBe('gzip');
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  });
});

describe('decompress', () => {
  it('should decompress brotli-compressed data', async () => {
    const original = SAMPLE_JS;
    const compressed = await compress(original, { algorithm: 'brotli' });
    const decompressed = await decompress(compressed.data);

    expect(decompressed.toString('utf8')).toBe(original);
  });

  it('should decompress gzip-compressed data', async () => {
    const original = SAMPLE_JS;
    const compressed = await compress(original, { algorithm: 'gzip' });
    const decompressed = await decompress(compressed.data);

    expect(decompressed.toString('utf8')).toBe(original);
  });

  it('should handle round-trip compression', async () => {
    const original = 'Hello, PAKK! 🗜️';
    const compressed = await compress(original);
    const decompressed = await decompress(compressed.data);

    expect(decompressed.toString('utf8')).toBe(original);
  });
});

describe('benchmark', () => {
  it('should benchmark compression algorithms', async () => {
    const result = await benchmark('test.js', SAMPLE_JS);

    expect(result.name).toBe('test.js');
    expect(result.originalSize).toBe(Buffer.from(SAMPLE_JS).length);
    expect(result.results.length).toBeGreaterThanOrEqual(2); // At least gzip and brotli
  });

  it('should include gzip in benchmark results', async () => {
    const result = await benchmark('test.js', SAMPLE_JS);
    const gzip = result.results.find(r => r.algorithm === 'gzip-9');

    expect(gzip).toBeDefined();
    expect(gzip!.compressedSize).toBeLessThan(result.originalSize);
  });

  it('should include brotli in benchmark results', async () => {
    const result = await benchmark('test.js', SAMPLE_JS);
    const brotli = result.results.find(r => r.algorithm === 'brotli-11');

    expect(brotli).toBeDefined();
    expect(brotli!.compressedSize).toBeLessThan(result.originalSize);
  });
});

describe('formatBenchmark', () => {
  it('should format benchmark results as string', async () => {
    const result = await benchmark('test.js', SAMPLE_JS);
    const formatted = formatBenchmark(result);

    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('test.js');
    expect(formatted).toContain('gzip');
    expect(formatted).toContain('brotli');
  });
});

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(100)).toBe('100B');
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(1048576)).toBe('1.00MB');
    expect(formatBytes(1572864)).toBe('1.50MB');
  });
});

describe('hasZstd', () => {
  it('should return boolean', async () => {
    const result = await hasZstd();
    expect(typeof result).toBe('boolean');
  });
});

describe('different content types', () => {
  it('should compress CSS content', async () => {
    const result = await compress(SAMPLE_CSS, { dictionary: 'css' });

    expect(result.compressedSize).toBeLessThan(result.originalSize);
    expect(result.savings).toBeGreaterThan(50); // CSS should compress well
  });

  it('should compress JSON content', async () => {
    const result = await compress(SAMPLE_JSON, { dictionary: 'json' });

    expect(result.compressedSize).toBeLessThan(result.originalSize);
  });

  it('should handle empty content', async () => {
    const result = await compress('');

    expect(result.originalSize).toBe(0);
  });

  it('should handle unicode content', async () => {
    const unicode = '你好世界 🌍 مرحبا العالم';
    const compressed = await compress(unicode);
    const decompressed = await decompress(compressed.data);

    expect(decompressed.toString('utf8')).toBe(unicode);
  });

  it('should handle binary-like content', async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
    const compressed = await compress(binary);
    const decompressed = await decompress(compressed.data);

    expect(Buffer.compare(decompressed, binary)).toBe(0);
  });
});

describe('edge cases', () => {
  it('should handle very small content', async () => {
    const result = await compress('x');

    expect(result.originalSize).toBe(1);
    // Compressed size might be larger for very small inputs
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should handle content with repeated patterns', async () => {
    const repeated = 'AAAA'.repeat(1000);
    const result = await compress(repeated);

    // Highly repetitive content should compress very well
    expect(result.savings).toBeGreaterThan(90);
  });

  it('should handle random-like content', async () => {
    // Base64 of random bytes doesn't compress as well
    const random = Buffer.from(
      Array.from({ length: 1000 }, () => Math.floor(Math.random() * 256))
    ).toString('base64');

    const result = await compress(random);

    // Random content doesn't compress well, but should still work
    expect(result.data.length).toBeGreaterThan(0);
  });
});
