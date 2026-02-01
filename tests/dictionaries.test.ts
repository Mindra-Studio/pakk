/**
 * PAKK Dictionary Tests
 *
 * Note: Dictionaries are now trained ZSTD binary dictionaries,
 * not text patterns. Content tests verify binary format, not text patterns.
 */

import { describe, it, expect } from 'vitest';
import {
  getDictionary,
  getDictionaryMeta,
  getAllDictionaries,
  detectDictionaryType,
  detectFromExtension,
  getReactDictionary,
  getVueDictionary,
  getTypescriptDictionary,
  getCssDictionary,
  getJsonDictionary,
  REACT_DICTIONARY_META,
  VUE_DICTIONARY_META,
  TYPESCRIPT_DICTIONARY_META,
  CSS_DICTIONARY_META,
  JSON_DICTIONARY_META,
} from '../src/dictionaries/index.js';
import type { DictionaryType } from '../src/core/types.js';

describe('getDictionary', () => {
  it('should return Buffer for react dictionary', () => {
    const dict = getDictionary('react');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for vue dictionary', () => {
    const dict = getDictionary('vue');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for typescript dictionary', () => {
    const dict = getDictionary('typescript');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for javascript dictionary', () => {
    const dict = getDictionary('javascript');
    expect(dict).toBeInstanceOf(Buffer);
    // javascript now has its own dictionary
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for css dictionary', () => {
    const dict = getDictionary('css');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(500);
  });

  it('should return Buffer for json dictionary', () => {
    const dict = getDictionary('json');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(500);
  });

  it('should return typescript dictionary for auto', () => {
    const dict = getDictionary('auto');
    expect(dict).toBeInstanceOf(Buffer);
    expect(Buffer.compare(dict, getDictionary('typescript'))).toBe(0);
  });

  it('should return Buffer for python dictionary', () => {
    const dict = getDictionary('python');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for rust dictionary', () => {
    const dict = getDictionary('rust');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for go dictionary', () => {
    const dict = getDictionary('go');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for java dictionary', () => {
    const dict = getDictionary('java');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for c dictionary', () => {
    const dict = getDictionary('c');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });

  it('should return Buffer for cpp dictionary', () => {
    const dict = getDictionary('cpp');
    expect(dict).toBeInstanceOf(Buffer);
    expect(dict.length).toBeGreaterThan(1000);
  });
});

describe('getDictionaryMeta', () => {
  it('should return metadata for each dictionary', () => {
    const types: DictionaryType[] = ['react', 'vue', 'typescript', 'css', 'json', 'python', 'rust', 'go', 'java', 'c', 'cpp'];

    for (const type of types) {
      const meta = getDictionaryMeta(type);
      expect(meta.name).toBeDefined();
      expect(meta.version).toBeDefined();
      expect(meta.description).toBeDefined();
      expect(meta.frameworks).toBeInstanceOf(Array);
      expect(meta.sizeBytes).toBeGreaterThan(0);
      expect(meta.patternCount).toBeGreaterThanOrEqual(0); // Trained dictionaries have internal patterns
      expect(meta.trainedOn).toBeInstanceOf(Array);
    }
  });
});

describe('getAllDictionaries', () => {
  it('should return all available dictionaries', () => {
    const all = getAllDictionaries();

    expect(all.length).toBe(13); // react, vue, typescript, javascript, css, html, json, python, rust, go, java, c, cpp, node_modules

    // Check that all expected dictionaries are present by checking frameworks
    const allFrameworks = all.flatMap(d => d.frameworks);
    expect(allFrameworks).toContain('react');
    expect(allFrameworks).toContain('vue');
    expect(allFrameworks).toContain('typescript');
    expect(allFrameworks).toContain('css');
    expect(allFrameworks).toContain('json');
    expect(allFrameworks).toContain('python');
    expect(allFrameworks).toContain('rust');
    expect(allFrameworks).toContain('go');
    expect(allFrameworks).toContain('java');
    expect(allFrameworks).toContain('c');
    expect(allFrameworks).toContain('cpp');
  });
});

describe('detectDictionaryType', () => {
  it('should detect React content', () => {
    const reactCode = `
      const App = () => {
        const [count, setCount] = useState(0);
        useEffect(() => {
          console.log(count);
        }, [count]);
        return _jsx("div", { children: count });
      };
    `;

    expect(detectDictionaryType(reactCode)).toBe('react');
  });

  it('should detect Vue content', () => {
    // Vue 3 code with multiple Vue-specific patterns
    const vueCode = `
      import { createApp, ref, reactive, onMounted, computed } from 'vue';
      const app = createApp({
        setup() {
          const count = ref(0);
          const state = reactive({ items: [] });
          const doubled = computed(() => count.value * 2);
          onMounted(() => console.log('mounted'));
          return { count, state, doubled };
        }
      });
      _createVNode("div", null, count.value);
      _createElementVNode("span", null, "hello");
    `;

    expect(detectDictionaryType(vueCode)).toBe('vue');
  });

  it('should detect CSS content', () => {
    const css = `
      @media (min-width: 768px) {
        .container {
          display: flex;
          flex-direction: column;
        }
      }
    `;

    expect(detectDictionaryType(css)).toBe('css');
  });

  it('should detect JSON content', () => {
    const json = JSON.stringify({ name: 'test', version: '1.0.0' });
    expect(detectDictionaryType(json)).toBe('json');
  });

  it('should detect Python content', () => {
    const pythonCode = `
def main():
    print("Hello")

class MyClass:
    def __init__(self):
        self.value = 42
    `;
    expect(detectDictionaryType(pythonCode)).toBe('python');
  });

  it('should detect Rust content', () => {
    const rustCode = `
fn main() {
    let mut x = 5;
    println!("{}", x);
}

impl MyTrait for MyStruct {
    fn method(&self) -> Option<i32> {
        Some(42)
    }
}
    `;
    expect(detectDictionaryType(rustCode)).toBe('rust');
  });

  it('should detect Go content', () => {
    const goCode = `
package main

import "fmt"

func main() {
    if err != nil {
        return
    }
    fmt.Println("Hello")
}
    `;
    expect(detectDictionaryType(goCode)).toBe('go');
  });

  it('should detect Java content', () => {
    const javaCode = `
package com.example;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
    `;
    expect(detectDictionaryType(javaCode)).toBe('java');
  });

  it('should default to typescript for unknown content', () => {
    const generic = 'function foo() { return 42; }';
    expect(detectDictionaryType(generic)).toBe('typescript');
  });

  it('should handle Buffer input', () => {
    // Need at least 2 React patterns for detection
    const buffer = Buffer.from('const [x, setX] = useState(0); useEffect(() => {}, []);');
    expect(detectDictionaryType(buffer)).toBe('react');
  });
});

describe('detectFromExtension', () => {
  it('should detect CSS from extension', () => {
    expect(detectFromExtension('style.css')).toBe('css');
    expect(detectFromExtension('style.scss')).toBe('css');
    expect(detectFromExtension('style.sass')).toBe('css');
    expect(detectFromExtension('style.less')).toBe('css');
  });

  it('should detect JSON from extension', () => {
    expect(detectFromExtension('config.json')).toBe('json');
    expect(detectFromExtension('tsconfig.json')).toBe('json');
    expect(detectFromExtension('data.jsonc')).toBe('json');
  });

  it('should detect Vue from extension', () => {
    expect(detectFromExtension('App.vue')).toBe('vue');
  });

  it('should detect React from JSX/TSX extension', () => {
    expect(detectFromExtension('App.jsx')).toBe('react');
    expect(detectFromExtension('App.tsx')).toBe('react');
  });

  it('should detect Python from extension', () => {
    expect(detectFromExtension('app.py')).toBe('python');
    expect(detectFromExtension('script.pyw')).toBe('python');
  });

  it('should detect Rust from extension', () => {
    expect(detectFromExtension('lib.rs')).toBe('rust');
  });

  it('should detect Go from extension', () => {
    expect(detectFromExtension('main.go')).toBe('go');
  });

  it('should detect Java from extension', () => {
    expect(detectFromExtension('Main.java')).toBe('java');
  });

  it('should detect C from extension', () => {
    expect(detectFromExtension('main.c')).toBe('c');
    expect(detectFromExtension('header.h')).toBe('c');
  });

  it('should detect C++ from extension', () => {
    expect(detectFromExtension('main.cpp')).toBe('cpp');
    expect(detectFromExtension('main.cc')).toBe('cpp');
    expect(detectFromExtension('header.hpp')).toBe('cpp');
  });

  it('should return auto for JS/TS files', () => {
    expect(detectFromExtension('index.js')).toBe('auto');
    expect(detectFromExtension('index.ts')).toBe('auto');
    expect(detectFromExtension('index.mjs')).toBe('auto');
    expect(detectFromExtension('index.cjs')).toBe('auto');
  });
});

describe('individual dictionary getters', () => {
  it('should cache React dictionary', () => {
    const dict1 = getReactDictionary();
    const dict2 = getReactDictionary();
    expect(dict1).toBe(dict2); // Same reference
  });

  it('should cache Vue dictionary', () => {
    const dict1 = getVueDictionary();
    const dict2 = getVueDictionary();
    expect(dict1).toBe(dict2);
  });

  it('should cache TypeScript dictionary', () => {
    const dict1 = getTypescriptDictionary();
    const dict2 = getTypescriptDictionary();
    expect(dict1).toBe(dict2);
  });

  it('should cache CSS dictionary', () => {
    const dict1 = getCssDictionary();
    const dict2 = getCssDictionary();
    expect(dict1).toBe(dict2);
  });

  it('should cache JSON dictionary', () => {
    const dict1 = getJsonDictionary();
    const dict2 = getJsonDictionary();
    expect(dict1).toBe(dict2);
  });
});

describe('dictionary metadata exports', () => {
  it('should export REACT_DICTIONARY_META', () => {
    expect(REACT_DICTIONARY_META.name).toContain('React');
    expect(REACT_DICTIONARY_META.frameworks).toContain('react');
    expect(REACT_DICTIONARY_META.frameworks).toContain('next.js');
  });

  it('should export VUE_DICTIONARY_META', () => {
    expect(VUE_DICTIONARY_META.name).toContain('Vue');
    expect(VUE_DICTIONARY_META.frameworks).toContain('vue');
    expect(VUE_DICTIONARY_META.frameworks).toContain('nuxt');
  });

  it('should export TYPESCRIPT_DICTIONARY_META', () => {
    expect(TYPESCRIPT_DICTIONARY_META.name).toContain('TypeScript');
  });

  it('should export CSS_DICTIONARY_META', () => {
    expect(CSS_DICTIONARY_META.name).toContain('CSS');
    expect(CSS_DICTIONARY_META.frameworks).toContain('css');
  });

  it('should export JSON_DICTIONARY_META', () => {
    expect(JSON_DICTIONARY_META.name).toContain('JSON');
  });
});

describe('trained dictionary format', () => {
  it('should have valid ZSTD dictionary magic number', () => {
    // ZSTD dictionaries start with magic number 0xEC30A437 (little-endian)
    const react = getReactDictionary();
    const vue = getVueDictionary();
    const ts = getTypescriptDictionary();
    const css = getCssDictionary();
    const json = getJsonDictionary();

    // Check magic bytes (ZSTD dictionary magic: 37 A4 30 EC in little-endian)
    const ZSTD_DICT_MAGIC = Buffer.from([0x37, 0xa4, 0x30, 0xec]);

    expect(react.subarray(0, 4).equals(ZSTD_DICT_MAGIC)).toBe(true);
    expect(vue.subarray(0, 4).equals(ZSTD_DICT_MAGIC)).toBe(true);
    expect(ts.subarray(0, 4).equals(ZSTD_DICT_MAGIC)).toBe(true);
    expect(css.subarray(0, 4).equals(ZSTD_DICT_MAGIC)).toBe(true);
    expect(json.subarray(0, 4).equals(ZSTD_DICT_MAGIC)).toBe(true);
  });

  it('should have reasonable dictionary sizes', () => {
    // Trained dictionaries are typically 50KB-1MB depending on training data
    const react = getReactDictionary();
    const vue = getVueDictionary();
    const json = getJsonDictionary();

    expect(react.length).toBeGreaterThan(1000);
    expect(react.length).toBeLessThan(600000); // 512KB max

    expect(vue.length).toBeGreaterThan(1000);
    expect(vue.length).toBeLessThan(600000);

    expect(json.length).toBeGreaterThan(1000);
    expect(json.length).toBeLessThan(300000);
  });
});
