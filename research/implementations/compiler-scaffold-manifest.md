# engine/compiler — game-scaffold & asset-manifest

Phase 4 generation plumbing. Two plain-code (non-agent) modules: `game-scaffold.ts` writes the
`generations/<game-name>/` directory tree exactly per `generations/info.md`; `asset-manifest.ts`
writes/reads the `config/` JSON binding assets to code variables and runs the manifest-first
bidirectional validation pass.

## game-scaffold.ts

Imports: `node:fs/promises` (mkdir, writeFile, stat), `node:path`.

| Export | Signature | Purpose |
|---|---|---|
| `GAME_TREE` | `readonly string[]` | The 30 relative dir paths from info.md, parents-first. |
| `GAME_FILES` | `{ main: 'main.ts'; tests: 'tests/tests.ts' }` | Seeded file paths. |
| `ScaffoldResult` | interface | `{ gameRoot, gameName, directories[], files[] }` (absolute paths). |
| `ScaffoldOptions` | interface | `{ generationsDir?, allowExisting? }`. |
| `slugifyGameName(rawName)` | `(string) => string` | FS-safe slug; falls back to `"game"`. |
| `defaultGenerationsDir()` | `() => string` | `<cwd>/generations`. |
| `scaffoldGame(rawGameName, options?)` | `=> Promise<ScaffoldResult>` | Creates full tree + `main.ts` and `tests/tests.ts` skeletons. Idempotent by default (`allowExisting` true); never clobbers existing seeded files. |
| `verifyScaffold(gameRoot)` | `=> Promise<string[]>` | Returns missing relative paths (empty = complete). |

Tree (exact, from info.md): `multiplayer/ research/ references/ reports/ assets/{sprites,background,images,sfx,music,scenes,fonts,text} systems/{rules,animations,entities,ai,calls,physics,controller} ui/{components,methods} saves/ config/ render/ tests/` plus files `main.ts`, `tests/tests.ts`.

### Usage
```ts
import { scaffoldGame } from '@/engine/compiler/game-scaffold';
const { gameRoot } = await scaffoldGame('My Cool Game'); // -> generations/my-cool-game/
```

## asset-manifest.ts

Imports: `node:fs/promises` (readFile, writeFile, stat, readdir), `node:path`, `zod`.

Files written under `<gameRoot>/config/`: `assets.manifest.json` (`MANIFEST_FILENAME`),
`style.json` (`STYLE_FILENAME`).

| Export | Signature | Purpose |
|---|---|---|
| `ASSET_CATEGORIES` / `AssetCategorySchema` | enum | The 8 `assets/` subfolders. |
| `AssetEntrySchema` / `AssetEntry` | zod / type | `{ variable, path, category, description?, license? }`; `variable` must be a valid JS identifier; `path` is relative to game root (POSIX). |
| `AssetManifestSchema` / `AssetManifest` | zod / type | `{ game, generatedAt, assets: Record<variable, AssetEntry> }`. |
| `StyleManifestSchema` / `StyleManifest` | zod / type | `{ palette[], spriteResolution?, perspective?, outline?, notes? }`. |
| `ValidationIssue` / `ValidationResult` | interface | `kind: 'missing-asset' \| 'unreferenced-key' \| 'duplicate-path'`. |
| `buildManifest(game, entries)` | `=> AssetManifest` | Validates each entry, rejects duplicate variable names, stamps `generatedAt`. |
| `writeManifest(gameRoot, manifest)` / `readManifest(gameRoot)` | `=> Promise<string>` / `Promise<AssetManifest>` | Round-trips `config/assets.manifest.json`. |
| `writeStyle(gameRoot, style)` / `readStyle(gameRoot)` | analogous | Round-trips `config/style.json` (the style bible). |
| `validateManifest(gameRoot, manifest)` | `=> Promise<ValidationResult>` | Bidirectional, plain-code (no agent). |

### Validation rules (manifest-first contract)
1. **missing-asset** — a manifest entry's `path` does not exist on disk under `gameRoot`.
2. **unreferenced-key** — a manifest `variable` appears in none of the code under `systems/`,
   `ui/`, `render/`, or `main.ts` (whole-word regex match on the identifier).
3. **duplicate-path** — two entries point at the same asset file.

### Usage
```ts
import { buildManifest, writeManifest, validateManifest } from '@/engine/compiler/asset-manifest';
const manifest = buildManifest('my-game', [
  { variable: 'heroSprite', path: 'assets/sprites/hero.png', category: 'sprites' },
]);
await writeManifest(gameRoot, manifest);
const { ok, issues } = await validateManifest(gameRoot, manifest); // run BEFORE coder, again after
```

## Tests
`game-scaffold.test.ts`, `asset-manifest.test.ts` — `node:assert` via `npx tsx`, scaffolding into
`os.tmpdir()`, full cleanup. Cover: tree completeness, slug edge cases, idempotency,
`allowExisting=false` throw, manifest/style round-trips, duplicate-variable rejection, and all
three validation kinds (missing asset, unreferenced key, duplicate path) plus the happy path.

Note: test files import siblings with a `.js` extension (TS bundler resolution rejects `.ts`
import specifiers; tsx resolves the `.js` to the `.ts` source).
