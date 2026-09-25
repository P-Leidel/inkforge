# Inkforge

A 2D side-view physics defense game: the player draws lines and objects with scarce, colour-coded ink to stop enemy waves from reaching the Ink Core.

**Play the latest build:** https://p-leidel.github.io/inkforge/

The project is at **milestone 1, the physics sandbox** ([spec](docs/specs/m1-physics-sandbox.md)). See the [game design document](docs/gdd.md) for the full picture and [`CONTEXT.md`](CONTEXT.md) for the glossary.

## Getting started

Requires Node.js 22.13 or newer (see [`.nvmrc`](.nvmrc)).

```sh
npm install
npm run dev        # dev server at http://localhost:5173
```

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Start the Vite dev server with hot reload         |
| `npm test`           | Run all Vitest tests once                         |
| `npm run test:watch` | Run tests in watch mode                           |
| `npm run lint`       | Lint with ESLint                                  |
| `npm run format`     | Format with Prettier (`format:check` only checks) |
| `npm run typecheck`  | Typecheck with `tsc`                              |
| `npm run build`      | Typecheck and build the static site into `dist/`  |
| `npm run preview`    | Serve the built `dist/` locally                   |

CI runs lint, format check, typecheck, tests and build on every push and pull request. Every push to `main` is deployed to GitHub Pages.

## Project structure

```
├── .github/workflows/   CI and GitHub Pages deploy
├── docs/                GDD, specs, ADRs and agent docs
├── public/              Static files copied as-is into the build
├── src/
│   ├── main.ts          Entry point: boots Phaser
│   ├── geometry/        Pure 2D maths: vectors, polygons, clipping, convex decomposition
│   ├── stroke/          Stroke pipeline: raw pointer samples → Line, Object or rejection
│   ├── physics/         Physics module; the only code that talks to the engine (ADR 0001)
│   ├── sandbox/         Headless Sandbox world: Arena, Strokes, pause, undo, seeded RNG
│   ├── stress-tests/    Scripted engine stress tests (ball cannon, box tower, pebbles)
│   ├── scenes/          Phaser scenes: input → Sandbox world commands
│   └── rendering/       Phaser drawing: world, debug overlay, toolbar, feedback
├── index.html
└── CONTEXT.md           Domain glossary
```

`geometry/`, `stroke/`, `physics/` and `sandbox/` have no Phaser dependency and run headless under Vitest. Tests live next to the code they cover as `*.test.ts`.
