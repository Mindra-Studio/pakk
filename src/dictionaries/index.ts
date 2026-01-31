/**
 * PAKK Dictionary Manager
 *
 * Handles dictionary selection and auto-detection.
 */

import type { DictionaryType, DictionaryMeta } from '../core/types.js';
import { getReactDictionary, REACT_DICTIONARY_META } from './react.dict.js';
import { getVueDictionary, VUE_DICTIONARY_META } from './vue.dict.js';
import { getTypescriptDictionary, TYPESCRIPT_DICTIONARY_META } from './typescript.dict.js';
import { getJavascriptDictionary, JAVASCRIPT_DICTIONARY_META } from './javascript.dict.js';
import { getCssDictionary, CSS_DICTIONARY_META } from './css.dict.js';
import { getJsonDictionary, JSON_DICTIONARY_META } from './json.dict.js';
import { getPythonDictionary, PYTHON_DICTIONARY_META } from './python.dict.js';
import { getRustDictionary, RUST_DICTIONARY_META } from './rust.dict.js';
import { getGoDictionary, GO_DICTIONARY_META } from './go.dict.js';
import { getJavaDictionary, JAVA_DICTIONARY_META } from './java.dict.js';
import { getCDictionary, C_DICTIONARY_META } from './c.dict.js';
import { getCppDictionary, CPP_DICTIONARY_META } from './cpp.dict.js';
import { getHtmlDictionary, HTML_DICTIONARY_META } from './html.dict.js';

/**
 * Get dictionary buffer by type
 */
export function getDictionary(type: DictionaryType): Buffer {
  switch (type) {
    case 'react':
      return getReactDictionary();
    case 'vue':
      return getVueDictionary();
    case 'typescript':
      return getTypescriptDictionary();
    case 'javascript':
      return getJavascriptDictionary();
    case 'css':
      return getCssDictionary();
    case 'html':
      return getHtmlDictionary();
    case 'json':
      return getJsonDictionary();
    case 'python':
      return getPythonDictionary();
    case 'rust':
      return getRustDictionary();
    case 'go':
      return getGoDictionary();
    case 'java':
      return getJavaDictionary();
    case 'c':
      return getCDictionary();
    case 'cpp':
      return getCppDictionary();
    case 'auto':
    default:
      return getTypescriptDictionary(); // Default fallback
  }
}

/**
 * Get dictionary metadata
 */
export function getDictionaryMeta(type: DictionaryType): DictionaryMeta {
  switch (type) {
    case 'react':
      return REACT_DICTIONARY_META;
    case 'vue':
      return VUE_DICTIONARY_META;
    case 'typescript':
      return TYPESCRIPT_DICTIONARY_META;
    case 'javascript':
      return JAVASCRIPT_DICTIONARY_META;
    case 'css':
      return CSS_DICTIONARY_META;
    case 'html':
      return HTML_DICTIONARY_META;
    case 'json':
      return JSON_DICTIONARY_META;
    case 'python':
      return PYTHON_DICTIONARY_META;
    case 'rust':
      return RUST_DICTIONARY_META;
    case 'go':
      return GO_DICTIONARY_META;
    case 'java':
      return JAVA_DICTIONARY_META;
    case 'c':
      return C_DICTIONARY_META;
    case 'cpp':
      return CPP_DICTIONARY_META;
    case 'auto':
    default:
      return TYPESCRIPT_DICTIONARY_META;
  }
}

/**
 * Get all available dictionaries
 */
export function getAllDictionaries(): DictionaryMeta[] {
  return [
    REACT_DICTIONARY_META,
    VUE_DICTIONARY_META,
    TYPESCRIPT_DICTIONARY_META,
    CSS_DICTIONARY_META,
    HTML_DICTIONARY_META,
    JSON_DICTIONARY_META,
    PYTHON_DICTIONARY_META,
    RUST_DICTIONARY_META,
    GO_DICTIONARY_META,
    JAVA_DICTIONARY_META,
    C_DICTIONARY_META,
    CPP_DICTIONARY_META,
  ];
}

/**
 * Auto-detect the best dictionary type for content
 */
export function detectDictionaryType(content: Buffer | string): DictionaryType {
  const text = typeof content === 'string'
    ? content
    : content.toString('utf8', 0, Math.min(50000, content.length));

  // Check for HTML
  if (isHtml(text)) {
    return 'html';
  }

  // Check for CSS
  if (isCss(text)) {
    return 'css';
  }

  // Check for JSON
  if (isJson(text)) {
    return 'json';
  }

  // Check for minified JavaScript FIRST (common in production builds)
  if (isMinifiedJs(text)) {
    return 'javascript';
  }

  // Check for JavaScript/TypeScript patterns BEFORE other languages
  // This prevents JS with 'import' being detected as Python
  if (isJavaScriptOrTypeScript(text)) {
    // Check for Vue
    if (isVue(text)) {
      return 'vue';
    }

    // Check for React
    if (isReact(text)) {
      return 'react';
    }

    return 'typescript';
  }

  // Check for Python (after JS to avoid false positives)
  if (isPython(text)) {
    return 'python';
  }

  // Check for Rust
  if (isRust(text)) {
    return 'rust';
  }

  // Check for Go
  if (isGo(text)) {
    return 'go';
  }

  // Check for Java
  if (isJava(text)) {
    return 'java';
  }

  // Check for C++
  if (isCpp(text)) {
    return 'cpp';
  }

  // Check for C
  if (isC(text)) {
    return 'c';
  }

  // Default to TypeScript/JavaScript
  return 'typescript';
}

/**
 * Detect file type from extension
 */
export function detectFromExtension(filename: string): DictionaryType {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  switch (ext) {
    // HTML
    case 'html':
    case 'htm':
    case 'xhtml':
    case 'svg':
    case 'xml':
      return 'html';

    // CSS
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'styl':
    case 'stylus':
      return 'css';

    // JSON
    case 'json':
    case 'jsonc':
    case 'json5':
      return 'json';

    // Vue
    case 'vue':
      return 'vue';

    // React/JSX
    case 'jsx':
    case 'tsx':
      return 'react';

    // Python
    case 'py':
    case 'pyw':
    case 'pyi':
    case 'pyx':
    case 'pxd':
      return 'python';

    // Rust
    case 'rs':
      return 'rust';

    // Go
    case 'go':
      return 'go';

    // Java
    case 'java':
      return 'java';

    // C
    case 'c':
    case 'h':
      return 'c';

    // C++
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c++':
    case 'hpp':
    case 'hh':
    case 'hxx':
    case 'h++':
    case 'ipp':
      return 'cpp';

    // JS/TS - detect from content
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'ts':
    case 'mts':
    case 'cts':
    default:
      return 'auto';
  }
}

// Detection helpers

function isHtml(text: string): boolean {
  const htmlPatterns = [
    /<!DOCTYPE\s+html/i,
    /<html[\s>]/i,
    /<head[\s>]/i,
    /<body[\s>]/i,
    /<div[\s>]/i,
    /<script[\s>]/i,
    /<style[\s>]/i,
    /<link[\s>]/i,
    /<meta[\s>]/i,
    /<title[\s>]/i,
    /<p[\s>]/i,
    /<span[\s>]/i,
    /<a\s+href/i,
    /<img\s+src/i,
    /<svg[\s>]/i,
    /class=["']/,
    /id=["']/,
  ];

  let matches = 0;
  for (const pattern of htmlPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

function isCss(text: string): boolean {
  const cssPatterns = [
    /@media\s*\(/,
    /@keyframes\s+\w/,
    /@import\s+['"]/,
    /@font-face\s*\{/,
    /\.[a-z][\w-]*\s*\{/,
    /#[a-z][\w-]*\s*\{/,
    /:\s*(flex|grid|block|none|inline)/,
    /\{[^}]*:\s*[^}]+;[^}]*\}/,
  ];

  let matches = 0;
  for (const pattern of cssPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
}

function isJson(text: string): boolean {
  const trimmed = text.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < Math.min(trimmed.length, 1000); i++) {
    const char = trimmed[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braces++;
    else if (char === '}') braces--;
    else if (char === '[') brackets++;
    else if (char === ']') brackets--;
  }

  return braces >= 0 && brackets >= 0;
}

function isPython(text: string): boolean {
  // Strong Python indicators (very unlikely in other languages)
  const strongPythonPatterns = [
    /^def\s+\w+\s*\([^)]*\)\s*:/m,  // def func(): with colon
    /^class\s+\w+.*:\s*$/m,         // class Foo: with colon at end
    /if\s+__name__\s*==\s*["']__main__["']/,
    /def\s+__init__\s*\(\s*self/,
    /def\s+__\w+__\s*\(/,           // dunder methods
    /@\w+\s*\n\s*def/,              // decorator before def
    /except\s+\w+\s*:/,             // except Error:
    /elif\s+.*:/,                    // elif with colon
    /^\s*self\.\w+\s*=/m,           // self.x =
  ];

  // Weak Python indicators (may appear in other languages)
  const weakPythonPatterns = [
    /^from\s+\w+\s+import/m,        // from x import
    /\bTrue\b|\bFalse\b|\bNone\b/,  // Python booleans
    /print\s*\(/,
    /:\s*\n\s{4}/,                  // colon then indented block
  ];

  // Count strong matches (need fewer)
  let strongMatches = 0;
  for (const pattern of strongPythonPatterns) {
    if (pattern.test(text)) {
      strongMatches++;
      if (strongMatches >= 2) return true;
    }
  }

  // If we have one strong match, check for weak ones
  if (strongMatches >= 1) {
    let weakMatches = 0;
    for (const pattern of weakPythonPatterns) {
      if (pattern.test(text)) {
        weakMatches++;
        if (strongMatches + weakMatches >= 3) return true;
      }
    }
  }

  return false;
}

function isRust(text: string): boolean {
  const rustPatterns = [
    /^fn\s+\w+/m,
    /^pub\s+fn/m,
    /^struct\s+\w+/m,
    /^enum\s+\w+/m,
    /^impl\s+/m,
    /^trait\s+\w+/m,
    /^use\s+\w+::/m,
    /^mod\s+\w+/m,
    /let\s+mut\s+/,
    /\.unwrap\(\)/,
    /\.expect\(/,
    /Option<|Result<|Vec<|Box<|Rc<|Arc</,
    /Some\(|None|Ok\(|Err\(/,
    /\?\s*;?\s*$/m,
    /#\[derive\(/,
    /&self|&mut self/,
    /::\s*new\s*\(/,
    /->.*\{/,
  ];

  let matches = 0;
  for (const pattern of rustPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

function isGo(text: string): boolean {
  const goPatterns = [
    /^package\s+\w+/m,
    /^import\s+\(/m,
    /^func\s+\w+\s*\(/m,
    /^func\s+\(\w+\s+\*?\w+\)/m,
    /^type\s+\w+\s+struct/m,
    /^type\s+\w+\s+interface/m,
    /if\s+err\s*!=\s*nil/,
    /:\s*=\s*/,
    /\bnil\b/,
    /\bdefer\s+/,
    /\bgo\s+func/,
    /\bchan\s+/,
    /<-\w+|<-\s*\w+/,
    /\.Error\(\)/,
    /fmt\.Print/,
    /make\(map\[|make\(\[\]/,
    /\bfunc\s*\(/,
  ];

  let matches = 0;
  for (const pattern of goPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

function isJava(text: string): boolean {
  const javaPatterns = [
    /^package\s+[\w.]+;/m,
    /^import\s+[\w.]+;/m,
    /^import\s+static\s+[\w.]+;/m,
    /public\s+class\s+\w+/,
    /public\s+interface\s+\w+/,
    /public\s+enum\s+\w+/,
    /public\s+static\s+void\s+main/,
    /private\s+(final\s+)?[\w<>[\]]+\s+\w+/,
    /@Override/,
    /@Autowired/,
    /@Service|@Repository|@Controller|@Component/,
    /System\.out\.print/,
    /\.equals\(/,
    /\.hashCode\(\)/,
    /new\s+\w+\s*</,
    /throws\s+\w+Exception/,
    /implements\s+\w+/,
    /extends\s+\w+/,
  ];

  let matches = 0;
  for (const pattern of javaPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

function isCpp(text: string): boolean {
  const cppPatterns = [
    /#include\s*<\w+>/,
    /^class\s+\w+\s*[:{]/m,
    /^namespace\s+\w+/m,
    /std::/,
    /public:|private:|protected:/,
    /virtual\s+/,
    /template\s*</,
    /typename\s+/,
    /using\s+namespace/,
    /new\s+\w+\(/,
    /delete\s+\w+/,
    /nullptr/,
    /auto\s+\w+\s*=/,
    /cout\s*<<|cin\s*>>/,
    /constexpr\s+/,
    /->\s*\w+\s*\(/,
    /::\s*\w+\s*\(/,
    /unique_ptr|shared_ptr|make_unique|make_shared/,
  ];

  let matches = 0;
  for (const pattern of cppPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

function isC(text: string): boolean {
  const cPatterns = [
    /#include\s*<stdio\.h>/,
    /#include\s*<stdlib\.h>/,
    /#include\s*<string\.h>/,
    /#define\s+\w+/,
    /^typedef\s+struct/m,
    /^struct\s+\w+\s*\{/m,
    /int\s+main\s*\(/,
    /printf\s*\(/,
    /scanf\s*\(/,
    /malloc\s*\(/,
    /free\s*\(/,
    /sizeof\s*\(/,
    /NULL/,
    /->|&\w+|\*\w+/,
    /unsigned\s+(int|char|long)/,
    /void\s*\*/,
  ];

  // Make sure it's not C++
  if (isCpp(text)) return false;

  let matches = 0;
  for (const pattern of cPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 3) return true;
    }
  }

  return false;
}

function isJavaScriptOrTypeScript(text: string): boolean {
  // Strong JS/TS indicators (unique to JS/TS, not in Python/other)
  const strongJsPatterns = [
    // ES6+ imports with quotes (Python uses no quotes)
    /^import\s+.*\s+from\s+['"]/m,
    /^import\s+\{[^}]+\}\s+from\s+['"]/m,
    /^export\s+(default|const|function|class|type|interface)\s+/m,
    /^export\s+\{/m,
    // JS-specific syntax
    /\bconst\s+\w+\s*=\s*\(/,           // const x = (
    /\blet\s+\w+\s*=\s*[\[{('"]/,       // let x = [ or { or ( or '/"
    /\bvar\s+\w+\s*=/,                   // var (not in modern languages)
    /=>\s*[\{(]/,                        // arrow functions
    /\bfunction\s*\*?\s*\w*\s*\([^)]*\)\s*\{/,  // function declarations
    /\bclass\s+\w+\s*(extends\s+\w+\s*)?\{/,    // class without colon
    // TypeScript specific
    /:\s*(string|number|boolean|any|void|never|unknown|null|undefined)\s*[;,)=\]]/,
    /interface\s+\w+\s*(<[^>]+>)?\s*\{/,
    /type\s+\w+\s*(<[^>]+>)?\s*=/,
    /as\s+(const|string|number|any|unknown)/,
    /<\w+(\s*,\s*\w+)*>\s*\(/,           // generics with function call
    // Promise/async patterns (JS style)
    /\.then\s*\(\s*(async\s*)?\(?/,
    /\.catch\s*\(\s*\(?/,
    /async\s+(function|\(|\w+\s*=>)/,
    /await\s+\w+/,
    // Common JS APIs
    /console\.(log|error|warn|info|debug)\s*\(/,
    /require\s*\(\s*['"]/,
    /module\.exports\s*=/,
    /Object\.(keys|values|entries|assign|freeze)\s*\(/,
    /Array\.(isArray|from|of)\s*\(/,
    /JSON\.(parse|stringify)\s*\(/,
    /Promise\.(all|race|resolve|reject)\s*\(/,
    // Web3/Ethereum patterns
    /\bethers\b|\bviem\b|\bwagmi\b/,
    /\bweb3\b|\bWeb3\b/,
    /\bprovider\b.*\bgetSigner\b|\bgetSigner\b.*\bprovider\b/,
    /\buseAccount\b|\buseConnect\b|\buseDisconnect\b/,
    /\bconnectAsync\b|\bdisconnectAsync\b/,
    /\bRainbowKit\b|\brainbow\b/,
    /\bMetaMask\b|\bmetamask\b/,
    /\bcontract\b.*\babi\b|\babi\b.*\bcontract\b/i,
    /0x[a-fA-F0-9]{40}/,                 // Ethereum addresses
    // Angular patterns
    /@(Component|Injectable|NgModule|Directive|Pipe|Input|Output)\s*\(/,
    /\bngOnInit\b|\bngOnDestroy\b|\bngOnChanges\b/,
    /\bObservable\b|\bSubject\b|\bBehaviorSubject\b/,
    /\.subscribe\s*\(/,
    /\bfrom\s*\(\s*['"]rxjs['"]/,
    // React patterns
    /\buseState\b|\buseEffect\b|\buseCallback\b|\buseMemo\b|\buseRef\b/,
    /\bReact\.(createElement|Component|Fragment|memo|forwardRef)\b/,
    /\b_?jsx\b|\b_?jsxs\b/,
    // Node.js
    /process\.(env|argv|cwd|exit)/,
    /\b__dirname\b|\b__filename\b/,
    // DOM APIs
    /document\.(getElementById|querySelector|createElement)/,
    /window\.(location|localStorage|sessionStorage|addEventListener)/,
  ];

  let matches = 0;
  for (const pattern of strongJsPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 2) return true;  // Only need 2 strong matches
    }
  }

  // Weak patterns (could be in other languages)
  const weakJsPatterns = [
    /\bconst\s+\w+\s*=/,
    /\blet\s+\w+\s*=/,
    /\.map\s*\(/,
    /\.filter\s*\(/,
    /\.reduce\s*\(/,
    /\.forEach\s*\(/,
    /\bnew\s+\w+\s*\(/,
    /\bthrow\s+new\s+\w*Error/,
    /\btry\s*\{/,
    /\bcatch\s*\(\w+\)\s*\{/,
  ];

  if (matches >= 1) {
    for (const pattern of weakJsPatterns) {
      if (pattern.test(text)) {
        matches++;
        if (matches >= 3) return true;
      }
    }
  }

  return false;
}

function isMinifiedJs(text: string): boolean {
  // Check for minified JavaScript characteristics
  const lines = text.split('\n');
  const avgLineLength = text.length / Math.max(lines.length, 1);

  // If average line length > 500 chars, likely minified
  if (avgLineLength > 500) {
    return true;
  }

  // Check first 8000 chars for minification patterns
  const sample = text.slice(0, 8000);

  // Strong minification indicators
  const strongMinifiedPatterns = [
    // Bundler markers
    /webpackJsonp|__webpack_require__|__webpack_exports__/,
    /\["__esModule"\]/,
    /__TURBOPACK__|__turbopack_/,
    /\b_interopRequireDefault\b|\b_interopRequireWildcard\b/,
    /\bdefineProperty\s*\(\s*exports\s*,/,
    // Terser/UglifyJS patterns
    /void\s*0\b/,
    /!0\b|!1\b/,                         // true/false minified
    /\btypeof\s+\w\s*[!=]==/,
    // Very dense code patterns
    /[;,]\w=[^,;]{1,30}[;,]\w=/,         // a=x,b=y pattern
    /\)\s*\{[^}]{0,50}\}\s*\(/,          // }(  tight function calls
    /\w\.\w\.\w\.\w\.\w/,                // deep property chains
  ];

  let minifiedScore = 0;
  for (const pattern of strongMinifiedPatterns) {
    if (pattern.test(sample)) {
      minifiedScore += 2;
    }
  }

  // IIFE patterns
  const iifePatterns = [
    /^\s*[\!\(]function\s*\(/,
    /^\s*\(function\s*\(\w?,?\w?,?\w?\)\s*\{/,
    /^\s*\(\s*\(\s*\)\s*=>\s*\{/,
    /^\s*\(\s*function\s*\(\s*\)\s*\{/,
  ];

  for (const pattern of iifePatterns) {
    if (pattern.test(sample)) {
      minifiedScore++;
    }
  }

  // Short variable names in dense patterns
  if (/function\s*\(\s*\w\s*,\s*\w\s*,\s*\w\s*\)/.test(sample)) minifiedScore++;
  if (/\(\s*\w\s*,\s*\w\s*\)\s*=>/.test(sample)) minifiedScore++;
  if (/\bvar\s+\w\s*,\s*\w\s*,\s*\w\s*[,;=]/.test(sample)) minifiedScore++;

  // Whitespace analysis
  const whitespaceRatio = (sample.match(/\s/g) || []).length / sample.length;
  const newlineRatio = (sample.match(/\n/g) || []).length / sample.length;

  // Very low whitespace ratio
  if (whitespaceRatio < 0.08 && sample.length > 1000) {
    minifiedScore += 3;
  } else if (whitespaceRatio < 0.12 && sample.length > 1000) {
    minifiedScore += 2;
  }

  // Very few newlines relative to content
  if (newlineRatio < 0.002 && sample.length > 2000) {
    minifiedScore += 2;
  }

  // No multi-line comments in large sample
  const hasBlockComments = /\/\*[\s\S]{10,}?\*\//.test(sample);
  const hasLineComments = /\/\/[^\n]{5,}/.test(sample);
  if (!hasBlockComments && !hasLineComments && sample.length > 3000) {
    minifiedScore++;
  }

  return minifiedScore >= 3;
}

function isVue(text: string): boolean {
  const vuePatterns = [
    /__VUE__/,
    /createVNode\(/,
    /createElementVNode\(/,
    /defineComponent\(/,
    /_createVNode\(/,
    /_createElementVNode\(/,
    /_resolveComponent\(/,
    /\bref\s*\(/,
    /\breactive\s*\(/,
    /\bcomputed\s*\(/,
    /onMounted\s*\(/,
    /onUnmounted\s*\(/,
    /useRouter\s*\(\)/,
    /useRoute\s*\(\)/,
    /defineNuxtConfig/,
    /useFetch\s*\(/,
    /useAsyncData\s*\(/,
  ];

  let matches = 0;
  for (const pattern of vuePatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
}

function isReact(text: string): boolean {
  const reactPatterns = [
    // React core
    /__REACT/,
    /React\.createElement/,
    /React\.(Component|PureComponent|Fragment|memo|forwardRef|lazy|Suspense)/,
    /\bjsx\s*\(|\bjsxs\s*\(/,
    /_jsx\s*\(|_jsxs\s*\(/,
    /createRoot\s*\(|hydrateRoot\s*\(/,
    /ReactDOM\.(render|createRoot|hydrateRoot)/,
    // React hooks
    /\buseState\s*\(/,
    /\buseEffect\s*\(/,
    /\buseCallback\s*\(/,
    /\buseMemo\s*\(/,
    /\buseRef\s*\(/,
    /\buseContext\s*\(/,
    /\buseReducer\s*\(/,
    /\buseLayoutEffect\s*\(/,
    /\buseImperativeHandle\s*\(/,
    /\buseDebugValue\s*\(/,
    /\buseTransition\s*\(/,
    /\buseDeferredValue\s*\(/,
    /\buseId\s*\(/,
    /\buseSyncExternalStore\s*\(/,
    // Next.js
    /useRouter\s*\(\)/,
    /usePathname\s*\(\)/,
    /useSearchParams\s*\(\)/,
    /useParams\s*\(\)/,
    /"use client"/,
    /"use server"/,
    /\bnext\/\w+/,
    /getServerSideProps|getStaticProps|getStaticPaths/,
    // React Query / TanStack
    /\buseQuery\s*\(/,
    /\buseMutation\s*\(/,
    /\buseInfiniteQuery\s*\(/,
    /QueryClient|QueryClientProvider/,
    // Web3 React patterns
    /\buseAccount\s*\(/,
    /\buseConnect\s*\(/,
    /\buseDisconnect\s*\(/,
    /\buseNetwork\s*\(/,
    /\buseBalance\s*\(/,
    /\buseContractRead\s*\(/,
    /\buseContractWrite\s*\(/,
    /\busePrepareContractWrite\s*\(/,
    /\buseWaitForTransaction\s*\(/,
    /\buseSignMessage\s*\(/,
    /\buseSendTransaction\s*\(/,
    /RainbowKitProvider|ConnectButton/,
    /WagmiConfig|WagmiProvider/,
    // State management
    /\buseSelector\s*\(/,
    /\buseDispatch\s*\(/,
    /\buseStore\s*\(/,
    /\buseAtom\s*\(/,
    /\buseRecoilState\s*\(/,
    /\buseRecoilValue\s*\(/,
    // UI libraries
    /\bstyled\s*\./,
    /\bcss\s*`/,
    /\bclassName\s*=/,
    /\bclassNames\s*\(/,
    /\bclsx\s*\(/,
    /\bcn\s*\(/,
    // Form libraries
    /\buseForm\s*\(/,
    /\buseFormContext\s*\(/,
    /\bregister\s*\(/,
    /\bhandleSubmit\s*\(/,
  ];

  let matches = 0;
  for (const pattern of reactPatterns) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
}

// Re-export individual dictionaries
export { getReactDictionary, REACT_DICTIONARY_META } from './react.dict.js';
export { getVueDictionary, VUE_DICTIONARY_META } from './vue.dict.js';
export { getTypescriptDictionary, TYPESCRIPT_DICTIONARY_META } from './typescript.dict.js';
export { getJavascriptDictionary, JAVASCRIPT_DICTIONARY_META } from './javascript.dict.js';
export { getCssDictionary, CSS_DICTIONARY_META } from './css.dict.js';
export { getHtmlDictionary, HTML_DICTIONARY_META } from './html.dict.js';
export { getJsonDictionary, JSON_DICTIONARY_META } from './json.dict.js';
export { getPythonDictionary, PYTHON_DICTIONARY_META } from './python.dict.js';
export { getRustDictionary, RUST_DICTIONARY_META } from './rust.dict.js';
export { getGoDictionary, GO_DICTIONARY_META } from './go.dict.js';
export { getJavaDictionary, JAVA_DICTIONARY_META } from './java.dict.js';
export { getCDictionary, C_DICTIONARY_META } from './c.dict.js';
export { getCppDictionary, CPP_DICTIONARY_META } from './cpp.dict.js';
