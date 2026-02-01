/**
 * PAKK Plugin Tests
 */

import { describe, it, expect } from 'vitest';
import { pakk as vitePlugin } from '../src/plugins/vite.js';
import { withPakk, PakkWebpackPlugin } from '../src/plugins/next.js';
import { PakkPlugin } from '../src/plugins/webpack.js';

describe('Vite Plugin', () => {
  it('should export pakk function', () => {
    expect(typeof vitePlugin).toBe('function');
  });

  it('should return a valid Vite plugin object', () => {
    const plugin = vitePlugin();

    expect(plugin.name).toBe('pakk');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('post');
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.closeBundle).toBe('function');
  });

  it('should accept options', () => {
    const plugin = vitePlugin({
      dictionary: 'react',
      level: 19,
      threshold: 512,
      verbose: true,
    });

    expect(plugin.name).toBe('pakk');
  });

  it('should use default options', () => {
    const plugin = vitePlugin({});
    expect(plugin.name).toBe('pakk');
  });
});

describe('Next.js Plugin', () => {
  it('should export withPakk function', () => {
    expect(typeof withPakk).toBe('function');
  });

  it('should return a config wrapper function', () => {
    const wrapper = withPakk();
    expect(typeof wrapper).toBe('function');
  });

  it('should wrap Next.js config', () => {
    const wrapper = withPakk({ dictionary: 'react' });
    const config = wrapper({ reactStrictMode: true });

    expect(config.reactStrictMode).toBe(true);
    expect(typeof config.webpack).toBe('function');
  });

  it('should preserve existing webpack config', () => {
    let existingCalled = false;
    const existingConfig = {
      webpack: (config: Record<string, unknown>) => {
        existingCalled = true;
        return config;
      },
    };

    const wrapper = withPakk();
    const config = wrapper(existingConfig);

    // Call webpack function to test it chains correctly
    const mockWebpackConfig = { plugins: [] };
    const mockContext = { dev: false, isServer: false };
    config.webpack!(mockWebpackConfig, mockContext);

    expect(existingCalled).toBe(true);
  });

  it('should export PakkWebpackPlugin class', () => {
    expect(typeof PakkWebpackPlugin).toBe('function');
    const plugin = new PakkWebpackPlugin();
    expect(typeof plugin.apply).toBe('function');
  });
});

describe('Webpack Plugin', () => {
  it('should export PakkPlugin class', () => {
    expect(typeof PakkPlugin).toBe('function');
  });

  it('should create plugin instance', () => {
    const plugin = new PakkPlugin();
    expect(plugin).toBeInstanceOf(PakkPlugin);
  });

  it('should have apply method', () => {
    const plugin = new PakkPlugin();
    expect(typeof plugin.apply).toBe('function');
  });

  it('should accept options', () => {
    const plugin = new PakkPlugin({
      dictionary: 'vue',
      level: 15,
      threshold: 2048,
      ext: '.zst',
      generateBrotli: true,
      verbose: true,
    });

    expect(plugin).toBeInstanceOf(PakkPlugin);
  });

  it('should use default options when none provided', () => {
    const plugin = new PakkPlugin();
    expect(plugin).toBeInstanceOf(PakkPlugin);
  });
});

describe('Plugin options validation', () => {
  it('should handle all dictionary types in Vite plugin', () => {
    const dicts = ['react', 'vue', 'typescript', 'css', 'json', 'auto'] as const;

    for (const dictionary of dicts) {
      const plugin = vitePlugin({ dictionary });
      expect(plugin.name).toBe('pakk');
    }
  });

  it('should handle all dictionary types in Next.js plugin', () => {
    const dicts = ['react', 'vue', 'typescript', 'css', 'json', 'auto'] as const;

    for (const dictionary of dicts) {
      const wrapper = withPakk({ dictionary });
      const config = wrapper({});
      expect(typeof config.webpack).toBe('function');
    }
  });

  it('should handle all dictionary types in Webpack plugin', () => {
    const dicts = ['react', 'vue', 'typescript', 'css', 'json', 'auto'] as const;

    for (const dictionary of dicts) {
      const plugin = new PakkPlugin({ dictionary });
      expect(plugin).toBeInstanceOf(PakkPlugin);
    }
  });

  it('should handle compression levels in Vite plugin', () => {
    for (let level = 1; level <= 19; level++) {
      const plugin = vitePlugin({ level });
      expect(plugin.name).toBe('pakk');
    }
  });
});
