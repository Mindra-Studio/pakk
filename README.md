# PAKK

**ZSTD + Dictionnaires pré-entraînés pour assets web**

[![npm version](https://img.shields.io/npm/v/pakk.svg)](https://www.npmjs.com/package/pakk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

PAKK combine ZSTD avec des dictionnaires spécialisés entraînés sur 1.7GB de code open source. Résultat : **15% plus compact que Brotli, 11x plus rapide**.

```bash
npm install pakk
```

---

## Benchmarks

### Comparaison complète (6 fichiers, 1.55 MB)

| Algorithme | Taille compressée | Ratio | Temps | vs Brotli |
|------------|-------------------|-------|-------|-----------|
| gzip-9 | 434.0 KB | 27.3% | 18ms | -20% |
| **Brotli-11** | 362.3 KB | 22.8% | 2275ms | baseline |
| ZSTD-19 | 453.0 KB | 28.5% | 12ms | -25% |
| **PAKK** | **308.7 KB** | **19.4%** | **201ms** | **+15%** |

### Détail par fichier

| Fichier | Original | gzip-9 | Brotli-11 | ZSTD-19 | PAKK |
|---------|----------|--------|-----------|---------|------|
| jquery.min.js | 85.5 KB | 29.6 KB | 26.8 KB | 31.5 KB | **15.8 KB** |
| d3.min.js | 273.1 KB | 91.0 KB | 75.8 KB | 93.6 KB | **60.2 KB** |
| three.min.js | 654.2 KB | 163.3 KB | 132.2 KB | 169.2 KB | **127.0 KB** |
| vue.global.prod.js | 143.7 KB | 52.3 KB | 46.7 KB | 54.8 KB | **42.4 KB** |
| bootstrap.min.css | 227.5 KB | 29.9 KB | 22.2 KB | 33.6 KB | **19.5 KB** |
| chart.min.js | 200.3 KB | 67.8 KB | 58.7 KB | 70.3 KB | **43.8 KB** |

### Gain par fichier vs Brotli-11

| Fichier | PAKK vs Brotli |
|---------|----------------|
| jquery.min.js | **+41%** |
| chart.min.js | **+25%** |
| d3.min.js | **+21%** |
| bootstrap.min.css | **+12%** |
| vue.global.prod.js | **+9%** |
| three.min.js | **+4%** |

### Observation clé

ZSTD seul (sans dictionnaire) est **25% moins efficace** que Brotli sur du code web.
La valeur de PAKK vient des **dictionnaires pré-entraînés**, pas de ZSTD lui-même.

---

## Table des matières

1. [Comment ça marche](#comment-ça-marche)
2. [Démarrage rapide](#démarrage-rapide)
3. [Dictionnaires disponibles](#dictionnaires-disponibles)
4. [Plugins Build Tools](#plugins-build-tools)
5. [Configuration serveur](#configuration-serveur)
6. [Entraîner vos dictionnaires](#entraîner-vos-dictionnaires)
7. [Roadmap](#roadmap)
8. [FAQ](#faq)

---

## Comment ça marche

Les algorithmes de compression (gzip, Brotli, ZSTD) construisent un modèle statistique à partir des données d'entrée. Sur des fichiers volumineux, c'est efficace. Sur des bundles web typiques (< 1MB), le modèle n'a pas assez de données pour atteindre son potentiel.

PAKK utilise des **dictionnaires pré-entraînés** : le modèle statistique est construit à l'avance sur 1.7GB de code open source (Next.js, React, Vue, Bootstrap, etc.). Le compresseur démarre avec une connaissance des patterns fréquents dans le code web.

```
Standard:  [Fichier] → [Construire modèle] → [Compresser] → Sortie
PAKK:      [Dictionnaire] + [Fichier] → [Compresser] → Sortie
                ↑
         Modèle pré-entraîné sur
         1.7GB de code réel
```

Sources de données d'entraînement : Next.js, Cal.com, Uniswap, shadcn-ui, wagmi, viem, RainbowKit, CPython, Go stdlib, ripgrep.

---

## Démarrage rapide

### Utilisation CLI

```bash
# Compresser un fichier
npx pakk compress bundle.js

# Compresser récursivement
npx pakk compress src/ --recursive

# Benchmark contre Brotli/gzip
npx pakk benchmark bundle.js --verbose

# Spécifier un type de dictionnaire
npx pakk compress bundle.js --dictionary react
```

### API Programmatique

```typescript
import { compress, decompress } from 'pakk';

// Auto-détection du meilleur dictionnaire
const compressed = await compress(buffer);
const original = await decompress(compressed);

// Spécifier un dictionnaire
const compressed = await compress(buffer, {
  dictionary: 'react',
  level: 11
});
```

---

## Dictionnaires disponibles

| Dictionnaire | Taille | Optimisé pour |
|--------------|--------|---------------|
| `javascript` | 1 MB | Bundles JS minifiés (jQuery, Three.js, D3, etc.) |
| `react` | 512 KB | Applications React/Next.js/Remix |
| `vue` | 52 KB | Applications Vue/Nuxt |
| `typescript` | 201 KB | Code source TypeScript |
| `html` | 359 KB | Documents HTML |
| `css` | 512 KB | Feuilles de style CSS/SCSS |
| `json` | 258 KB | Fichiers de données JSON |
| `go` | 512 KB | Code source Go |
| `rust` | 379 KB | Code source Rust |
| `python` | 512 KB | Code source Python |
| `c` | 262 KB | Code source C |
| `cpp` | 262 KB | Code source C++ |
| `java` | 70 KB | Code source Java |
| `auto` | - | Auto-détection depuis le contenu |

---

## Dossier d'entraînement (pakk-entrainement)

Le dossier `pakk-entrainement` contient toutes les données d'entraînement pour créer les dictionnaires PAKK. Voici sa structure :

### Structure du dossier

```
pakk-entrainement/
├── js/                    # JavaScript minifié et source
│   ├── jquery.min.js
│   ├── lodash.min.js
│   ├── d3.min.js
│   ├── react.min.js
│   ├── react-dom.min.js
│   ├── three-orbit-controls.js
│   ├── angular-core.js
│   └── ...
├── css/                   # Frameworks CSS
│   ├── bootstrap.min.css
│   ├── bulma.css
│   └── ...
├── html/                  # Templates HTML
│   ├── material-dashboard.html
│   ├── tailwind-admin.html
│   └── ...
├── json/                  # Fichiers JSON variés
│   ├── api-posts.json
│   ├── ethereum-tokens.json
│   └── ...
├── web3/                  # Code Web3/Ethereum
│   ├── ethers.min.js
│   ├── uniswap-swap.tsx
│   ├── rainbowkit-connect.tsx
│   └── ...
├── solidity/              # Contrats Solidity
│   ├── ERC20.sol
│   ├── UniswapV3Pool.sol
│   └── ...
├── nextjs/                # Clone du repo Next.js (cloned)
├── calcom/                # Clone du repo Cal.com (cloned)
├── uniswap/               # Clone du repo Uniswap (cloned)
├── shadcn/                # Clone du repo shadcn-ui (cloned)
├── wagmi/                 # Clone du repo wagmi (cloned)
├── viem/                  # Clone du repo viem (cloned)
├── rainbowkit/            # Clone du repo RainbowKit (cloned)
├── cpython/               # Clone du repo CPython (cloned)
├── golang/                # Clone du repo Go stdlib (cloned)
├── django/                # Clone du repo Django (cloned)
├── ripgrep-rust/          # Clone du repo ripgrep (cloned)
└── nickel-rust/           # Clone du repo Nickel (cloned)
```

### Comment utiliser pakk-entrainement

#### 1. Ajouter des fichiers individuels

```bash
# Télécharger une bibliothèque JS minifiée
curl -sL "https://unpkg.com/vue@3/dist/vue.global.prod.js" \
  -o pakk-entrainement/js/vue.min.js

# Télécharger un framework CSS
curl -sL "https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css" \
  -o pakk-entrainement/css/bootstrap.min.css

# Télécharger des données JSON
curl -sL "https://jsonplaceholder.typicode.com/posts" \
  -o pakk-entrainement/json/api-posts.json
```

#### 2. Cloner des projets GitHub

```bash
cd pakk-entrainement

# Cloner Next.js (React/TypeScript)
git clone --depth 1 https://github.com/vercel/next.js.git nextjs

# Cloner un projet Web3
git clone --depth 1 https://github.com/Uniswap/web-interface.git uniswap

# Cloner CPython pour le dictionnaire Python
git clone --depth 1 https://github.com/python/cpython.git cpython

# Cloner Go stdlib pour le dictionnaire Go
git clone --depth 1 https://github.com/golang/go.git golang

# Cloner un projet Rust
git clone --depth 1 https://github.com/BurntSushi/ripgrep.git ripgrep-rust
```

#### 3. Organisation recommandée

| Type de dictionnaire | Dossier source | Fichiers à collecter |
|---------------------|----------------|---------------------|
| `javascript` | `js/` | `*.min.js` (bundles minifiés) |
| `react` | `nextjs/`, `shadcn/`, `calcom/` | `*.tsx`, `*.jsx` |
| `css` | `css/` | `*.css`, `*.min.css` |
| `html` | `html/` | `*.html` |
| `json` | `json/` | `*.json` |
| `python` | `cpython/`, `django/` | `*.py` |
| `go` | `golang/` | `*.go` |
| `rust` | `ripgrep-rust/`, `nickel-rust/` | `*.rs` |

#### 4. Exemple : Enrichir le dictionnaire JavaScript

```bash
cd pakk-entrainement/js

# Télécharger des librairies populaires
curl -sL "https://unpkg.com/three@0.160/build/three.min.js" -o three.min.js
curl -sL "https://unpkg.com/chart.js@4/dist/chart.min.js" -o chart.min.js
curl -sL "https://unpkg.com/ethers@6/dist/ethers.min.js" -o ethers.min.js
curl -sL "https://unpkg.com/axios/dist/axios.min.js" -o axios.min.js
curl -sL "https://unpkg.com/gsap/dist/gsap.min.js" -o gsap.min.js
curl -sL "https://unpkg.com/swiper/swiper-bundle.min.js" -o swiper.min.js

# Copier des bundles de projets locaux
cp ~/my-project/dist/bundle.min.js ./my-bundle.min.js
```

---

## Entraîner vos dictionnaires

### Prérequis

```bash
# Installer zstd CLI
# macOS
brew install zstd

# Ubuntu/Debian
apt install zstd

# Windows (via Chocolatey)
choco install zstd

# Windows (via Scoop)
scoop install zstd
```

### Processus complet d'entraînement

#### Étape 1 : Collecter les données

Viser **10-100x** la taille cible du dictionnaire en données d'entraînement.

| Dictionnaire cible | Taille dict | Données nécessaires |
|-------------------|-------------|---------------------|
| 128 KB | ~12 MB minimum |
| 512 KB | ~50 MB minimum |
| 1 MB | ~100 MB minimum |

#### Étape 2 : Lister les fichiers d'entraînement

```bash
# Pour JavaScript (bundles minifiés uniquement)
find pakk-entrainement/js -name "*.min.js" -size +5k > js-files.txt

# Pour React (composants TSX)
find pakk-entrainement/nextjs pakk-entrainement/shadcn pakk-entrainement/calcom \
  -name "*.tsx" -size +2k -size -100k > react-files.txt

# Pour CSS
find pakk-entrainement/css -name "*.css" -size +5k > css-files.txt

# Pour Python
find pakk-entrainement/cpython pakk-entrainement/django \
  -name "*.py" -size +2k -size -50k > python-files.txt

# Pour Go
find pakk-entrainement/golang/src -name "*.go" -size +2k -size -50k > go-files.txt

# Pour Rust
find pakk-entrainement/ripgrep-rust pakk-entrainement/nickel-rust \
  -name "*.rs" -size +2k -size -50k > rust-files.txt
```

#### Étape 3 : Entraîner le dictionnaire

**Commande de base :**
```bash
zstd --train training-data/*.js -o my-dictionary.dict
```

**Commande optimisée (recommandée) :**
```bash
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=1048576 \
     $(cat js-files.txt | head -500) \
     -o trained-dicts/javascript.dict
```

### Paramètres d'entraînement

| Paramètre | Description | Valeur recommandée |
|-----------|-------------|-------------------|
| `--train-cover` | Algorithme COVER (meilleur que default) | Toujours utiliser |
| `d=6` | Paramètre de taille de segment | 6-8 |
| `steps=100` | Itérations d'optimisation | 100-500 (plus = plus lent mais meilleur) |
| `split=100` | Utiliser tous les échantillons | 100 |
| `--maxdict` | Taille max du dictionnaire en bytes | 131072 à 1048576 |

### Commandes d'entraînement par langage

```bash
# JavaScript (1 MB - bundles minifiés)
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=1048576 \
     pakk-entrainement/js/*.min.js \
     -o trained-dicts/javascript.dict

# React (512 KB - composants TSX)
cat react-files.txt | head -1000 | xargs \
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=524288 \
     -o trained-dicts/react.dict

# CSS (512 KB)
zstd --train-cover=d=6,steps=200,split=100 \
     --maxdict=524288 \
     pakk-entrainement/css/*.css \
     -o trained-dicts/css.dict

# Python (512 KB)
cat python-files.txt | head -1000 | xargs \
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=524288 \
     -o trained-dicts/python.dict

# Go (512 KB)
cat go-files.txt | head -1000 | xargs \
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=524288 \
     -o trained-dicts/go.dict

# Rust (512 KB)
cat rust-files.txt | head -500 | xargs \
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=524288 \
     -o trained-dicts/rust.dict
```

### Tips d'entraînement

Basé sur nos recherches et [ZSTD Issue #4127](https://github.com/facebook/zstd/issues/4127) :

1. **Plus de données n'est pas toujours mieux** - Qualité > quantité
2. **La taille du dictionnaire est sensible** - Tester plusieurs tailles (64KB, 128KB, 256KB, 512KB, 1MB)
3. **Matcher vos données de production** - Entraîner sur des fichiers similaires à ce que vous compresserez
4. **Utiliser `--train-cover`** - Plus lent mais meilleurs résultats que `--train-fastcover`
5. **Tester sur de vrais fichiers** - Valider le ratio de compression avant de déployer

---

## Mettre à jour les dictionnaires

### Étape 1 : Ré-entraîner le dictionnaire

Après avoir ajouté de nouvelles données dans `pakk-entrainement/` :

```bash
# Exemple : mettre à jour le dictionnaire JavaScript
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=1048576 \
     pakk-entrainement/js/*.min.js \
     -o trained-dicts/javascript.dict
```

### Étape 2 : Convertir en module TypeScript

```bash
cd pakk
node scripts/convert-dicts.cjs
```

Ce script :
1. Lit chaque fichier `.dict` dans `trained-dicts/`
2. Encode en Base64
3. Génère un fichier TypeScript dans `src/dictionaries/`

### Étape 3 : Reconstruire le projet

```bash
npm run build
```

### Étape 4 : Tester les nouveaux dictionnaires

```bash
# Tester la compression
npx pakk benchmark test-file.js --verbose

# Comparer avec Brotli
npx pakk benchmark test-file.js --compare
```

### Automatiser la mise à jour

Script bash pour tout mettre à jour :

```bash
#!/bin/bash
# update-dictionaries.sh

set -e

echo "1. Entraînement des dictionnaires..."

# JavaScript
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=1048576 \
     pakk-entrainement/js/*.min.js \
     -o trained-dicts/javascript.dict

# React
find pakk-entrainement/nextjs pakk-entrainement/shadcn -name "*.tsx" | head -1000 | xargs \
zstd --train-cover=d=6,steps=100,split=100 \
     --maxdict=524288 \
     -o trained-dicts/react.dict

# Ajouter les autres dictionnaires...

echo "2. Conversion en TypeScript..."
node scripts/convert-dicts.cjs

echo "3. Build..."
npm run build

echo "4. Tests..."
npm test

echo "Mise à jour terminée !"
```

---

## Plugins Build Tools

### Vite

```typescript
// vite.config.ts
import { pakk } from 'pakk/vite';

export default {
  plugins: [
    pakk({
      dictionary: 'react',
      threshold: 1024,
    })
  ]
};
```

### Next.js

```javascript
// next.config.js
const { withPakk } = require('pakk/next');

module.exports = withPakk({
  dictionary: 'react',
})({
  // votre config next
});
```

### Webpack

```javascript
// webpack.config.js
const { PakkPlugin } = require('pakk/webpack');

module.exports = {
  plugins: [
    new PakkPlugin({
      dictionary: 'auto',
      generateBrotli: true, // fallback
    })
  ]
};
```

### esbuild

```typescript
import esbuild from 'esbuild';
import { pakk } from 'pakk/esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  plugins: [pakk({ dictionary: 'react' })],
});
```

### Rollup

```javascript
// rollup.config.js
import { pakk } from 'pakk/rollup';

export default {
  plugins: [
    pakk({
      dictionary: 'javascript',
      include: ['**/*.js'],
    })
  ]
};
```

---

## Configuration serveur

### Nginx

```nginx
location ~ \.(pakk)$ {
    add_header Content-Encoding zstd;
    add_header Vary Accept-Encoding;
    types { application/javascript js; }
}

# Servir .pakk quand le client supporte zstd
map $http_accept_encoding $pakk_suffix {
    ~zstd ".pakk";
    default "";
}

location ~ ^(.+)\.(js|css)$ {
    try_files $uri$pakk_suffix $uri =404;
}
```

### Caddy

```caddyfile
encode zstd gzip

@zstd {
    header Accept-Encoding *zstd*
    file {path}.pakk
}
rewrite @zstd {path}.pakk
```

### Express.js

```javascript
import express from 'express';
import { expressMiddleware } from 'pakk/middleware';

const app = express();
app.use(expressMiddleware({ dictionary: 'auto' }));
```

---

## Support navigateur

ZSTD est supporté dans les navigateurs modernes :

| Navigateur | Version | Support |
|------------|---------|---------|
| Chrome | 123+ | Complet |
| Firefox | 126+ | Complet |
| Safari | 18+ | Complet |
| Edge | 123+ | Complet |

Pour les anciens navigateurs, PAKK peut générer des fallbacks Brotli/gzip :

```typescript
pakk({
  generateBrotli: true,
  generateGzip: true,
})
```

---

## Roadmap

### Phase 1: pakk bundle (v1.0) - EN COURS
> *-74% sur ton bundle, une ligne de config*

- [x] Core compressor avec ZSTD + dictionnaires pré-entraînés
- [x] 13 dictionnaires optimisés (JS, React, CSS, HTML, JSON, Go, Python, Rust, C, C++...)
- [x] CLI: `pakk compress`, `pakk benchmark`, `pakk info`
- [x] Plugin Vite - fonctionnel
- [x] Plugin Next.js - fonctionnel (compatible Turbopack)
- [x] Plugin Webpack - fonctionnel
- [x] Plugins esbuild, Rollup, Parcel
- [x] Tests E2E sur vrais projets
- [ ] Publication npm
- [ ] Landing page avec démo interactive

#### Résultats E2E sur vrais projets

| Stack | Fichiers | Avant | Après | Gain |
|-------|----------|-------|-------|------|
| Vite + React + Web3 | 84 | 3.22 MB | 863 KB | **-74%** |
| Next.js 16 + Turbopack | 28 | 4.04 MB | 1.05 MB | **-74%** |

### Phase 2: pakk git (v1.5)
> *Ton repo de 2GB → 546MB*

```bash
$ pakk git optimize
Analyzing .git/objects...
Repacking with ZSTD dictionaries...

Before: 2.1 GB
After:  546 MB (-74%)
```

- [ ] Commande `pakk git optimize`
- [ ] Compression du dossier `.git/objects` avec dictionnaires spécialisés
- [ ] Re-pack intelligent basé sur le type de fichiers
- [ ] Support shallow clone optimisé
- [ ] Intégration GitHub Actions

### Phase 3: pakk install (v2.0)
> *npm install, mais 74% plus léger*

```bash
$ pakk install lodash
Downloading lodash@4.17.21...
Cache hit! Decompressing with dictionary...

npm:  2.3s (download 1.2MB)
pakk: 0.4s (download 312KB, cached dict)
```

- [ ] Cache npm intelligent avec dictionnaires par écosystème
- [ ] Dictionnaires pré-entraînés pour top 1000 packages npm
- [ ] `pakk install <package>` - drop-in replacement
- [ ] Intégration native avec pnpm/yarn/bun

---

## FAQ

### Pourquoi ne pas simplement utiliser Brotli ?

Brotli est excellent mais plafonne à la qualité 11. PAKK avec des dictionnaires pré-entraînés atteint de meilleurs ratios tout en étant 5-7x plus rapide à compresser.

### PAKK fonctionne-t-il avec du contenu dynamique ?

Oui ! PAKK excelle à compresser du contenu dynamique car le dictionnaire est pré-calculé. Pas de pénalité de démarrage à froid.

### Quel est l'overhead de décompression ?

La décompression ZSTD est extrêmement rapide - typiquement 1-2GB/s. Le dictionnaire ajoute un overhead minimal (~1ms pour le charger).

### Puis-je utiliser PAKK avec mon CDN ?

Oui. Générez les fichiers `.pakk` au build time, puis configurez votre CDN pour les servir avec `Content-Encoding: zstd`.

### Le dictionnaire est-il inclus dans chaque fichier ?

Non. L'ID du dictionnaire est embarqué (4 bytes), mais le dictionnaire lui-même doit être disponible lors de la décompression. Pour HTTP, les navigateurs utilisent le dictionnaire partagé.

### Comment choisir la taille du dictionnaire ?

| Cas d'usage | Taille recommandée |
|-------------|-------------------|
| Petits fichiers (<10KB) | 64-128 KB |
| Bundles moyens (10-100KB) | 256-512 KB |
| Gros bundles (>100KB) | 512KB - 1 MB |
| API JSON répétitives | 128-256 KB |

### Puis-je entraîner un dictionnaire pour mon projet spécifique ?

Oui ! Collectez vos fichiers de production dans `pakk-entrainement/` et suivez le guide d'entraînement ci-dessus.

---

## Méthodologie des benchmarks

Tous les benchmarks exécutés sur :
- Windows 11, Intel i7-12700K, 32GB RAM
- Node.js 20.x
- ZSTD niveau de compression 11 (égal au max de Brotli)
- Chaque test exécuté 3 fois, médiane reportée

Reproduire localement :
```bash
npx pakk benchmark path/to/file.js --verbose
```

---

## Contribuer

```bash
# Cloner le repo
git clone https://github.com/mindra-studio/pakk.git
cd pakk

# Installer les dépendances
npm install

# Build
npm run build

# Lancer les tests
npm test

# Entraîner les dictionnaires (nécessite les données d'entraînement)
node scripts/convert-dicts.cjs
```

### Ajouter un nouveau dictionnaire

1. Collecter les fichiers d'entraînement dans `pakk-entrainement/<langage>/`
2. Ajouter l'entrée dans `scripts/convert-dicts.cjs`
3. Entraîner : `zstd --train-cover=d=6,steps=100 ... -o trained-dicts/<langage>.dict`
4. Convertir : `node scripts/convert-dicts.cjs`
5. Ajouter la détection dans `src/dictionaries/index.ts`

---

## Licence

MIT

---

## Remerciements

- [Facebook ZSTD](https://github.com/facebook/zstd) - L'algorithme de compression
- [zstd-napi](https://github.com/nicola-test/zstd-napi) - Bindings Node.js
- [Roblox ZSTD research](https://github.com/facebook/zstd/issues/4127) - Optimisations d'entraînement
- [Chrome Compression Dictionary Transport](https://developer.chrome.com/blog/shared-dictionary-compression) - Inspiration

---

<p align="center">
  <b>PAKK - Parce que chaque kilooctet compte</b>
</p>
