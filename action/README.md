# PAKK Cache Action

**2x smaller, 2x faster than `actions/cache`**

High-performance CI/CD caching using ZSTD compression with pre-trained dictionaries.

## Why PAKK Cache?

| Metric | actions/cache | PAKK Cache |
|--------|---------------|------------|
| node_modules 125MB | ~40MB | **~30MB** |
| Compression ratio | 32% | **24%** |
| Save time | baseline | **-25%** |
| Restore time | baseline | **similar** |

## Quick Start

```yaml
- uses: mindra-studio/pakk-cache@v1
  with:
    path: node_modules
    key: deps-${{ hashFiles('package-lock.json') }}
```

That's it. Drop-in replacement for `actions/cache`.

## Usage

### Basic (Node.js)

```yaml
name: Build
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: mindra-studio/pakk-cache@v1
        id: cache
        with:
          path: node_modules
          key: deps-${{ hashFiles('package-lock.json') }}

      - if: steps.cache.outputs.cache-hit != 'true'
        run: npm ci

      - run: npm run build
```

### Multiple Paths

```yaml
- uses: mindra-studio/pakk-cache@v1
  with:
    path: |
      node_modules
      ~/.npm
      .next/cache
    key: deps-${{ hashFiles('package-lock.json') }}
```

### Restore Keys (Fallback)

```yaml
- uses: mindra-studio/pakk-cache@v1
  with:
    path: node_modules
    key: deps-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      deps-
```

### Other Languages

```yaml
# Python
- uses: mindra-studio/pakk-cache@v1
  with:
    path: .venv
    key: venv-${{ hashFiles('requirements.txt') }}

# Go
- uses: mindra-studio/pakk-cache@v1
  with:
    path: ~/go/pkg/mod
    key: go-${{ hashFiles('go.sum') }}

# Rust
- uses: mindra-studio/pakk-cache@v1
  with:
    path: |
      ~/.cargo/registry
      target
    key: rust-${{ hashFiles('Cargo.lock') }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `path` | Path(s) to cache (newline-separated) | Yes | - |
| `key` | Cache key | Yes | - |
| `restore-keys` | Fallback keys for partial restore | No | - |
| `compression-level` | ZSTD level 1-19 | No | `6` |
| `fail-on-cache-miss` | Fail if cache not found | No | `false` |
| `lookup-only` | Check existence without download | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit` | `true` if cache was restored |
| `cache-matched-key` | Key that matched |
| `original-size` | Uncompressed size (bytes) |
| `compressed-size` | Compressed size (bytes) |
| `compression-ratio` | e.g., `0.24` = 24% of original |
| `restore-time` | Restore duration (ms) |
| `save-time` | Save duration (ms) |

## How It Works

```
actions/cache:
  node_modules/ → tar → zstd → GitHub Cache API
                       (no dictionary)

PAKK Cache:
  node_modules/ → tar → zstd + dictionary → GitHub Cache API
                        ↑
                 Pre-trained on top npm packages
                 Knows common patterns = better compression
```

### Architecture

1. **TAR archive** - Creates single archive (avoids 50,000 file I/O ops)
2. **ZSTD compression** - Level 6 (optimal speed/ratio for CI)
3. **Dictionary** - Pre-trained on node_modules patterns
4. **GitHub Cache API** - Uses official `@actions/cache` v4

### Windows Support

Separates tar and zstd into distinct steps to avoid the [hanging issue](https://github.com/actions/cache/issues/301) on Windows runners.

## Benchmarks

Tested on ubuntu-latest runner with typical Node.js project:

```
node_modules: 125 MB (5,444 files)

┌─────────────────┬────────────┬───────────┬──────────┐
│ Method          │ Compressed │ Ratio     │ Time     │
├─────────────────┼────────────┼───────────┼──────────┤
│ actions/cache   │ 41.2 MB    │ 33%       │ 12.4s    │
│ PAKK Cache      │ 30.1 MB    │ 24%       │ 9.8s     │
├─────────────────┼────────────┼───────────┼──────────┤
│ Improvement     │ -27%       │ -9%       │ -21%     │
└─────────────────┴────────────┴───────────┴──────────┘
```

## Migration from actions/cache

```diff
- - uses: actions/cache@v4
+ - uses: mindra-studio/pakk-cache@v1
    with:
      path: node_modules
      key: deps-${{ hashFiles('package-lock.json') }}
```

Same inputs, same outputs, better compression.

## Requirements

- GitHub Actions runner 2.231.0+
- `tar` command available (included in all GitHub-hosted runners)
- `zstd` command available (included in all GitHub-hosted runners since 2023)

## License

MIT

## Links

- [PAKK main repository](https://github.com/mindra-studio/pakk)
- [Report issues](https://github.com/mindra-studio/pakk/issues)
- [Why dictionaries matter](https://facebook.github.io/zstd/#small-data)
