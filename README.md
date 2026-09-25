# Inkforge

A 2D side-view physics defense game: the player draws lines and objects with scarce, colour-coded ink to stop enemy waves from reaching the Ink Core.

**Play the latest build:** https://p-leidel.github.io/inkforge/

The project is at **milestone 1, the physics sandbox** ([spec](docs/specs/m1-physics-sandbox.md)). See the [game design document](docs/gdd.md) for the full picture and [`CONTEXT.md`](CONTEXT.md) for the glossary.

## Getting started

Requires Node.js 22.13 or newer (see [`.nvmrc`](.nvmrc)). `npm install` also patches a bug in Phaser Box2D (see [`scripts/patch-phaser-box2d.mjs`](scripts/patch-phaser-box2d.mjs)).

```sh
npm install
npm run dev        # dev server at http://localhost:5173
```

| Command              | What it does                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`        | Start the Vite dev server with hot reload                                                                                            |
| `npm test`           | Run all Vitest tests once                                                                                                            |
| `npm run test:watch` | Run tests in watch mode                                                                                                              |
| `npm run lint`       | Lint with ESLint                                                                                                                     |
| `npm run format`     | Format with Prettier (`format:check` only checks)                                                                                    |
| `npm run typecheck`  | Typecheck with `tsc`                                                                                                                 |
| `npm run build`      | Typecheck and build the static site into `dist/`                                                                                     |
| `npm run preview`    | Serve the built `dist/` locally                                                                                                      |
| `npm run verdict`    | Run the engine stress tests headless and print the numbers for [ADR 0001](docs/adr/0001-phaser-box2d-physics.md#verdict-milestone-1) |

CI runs lint, format check, typecheck, tests and build on every push and pull request. Every push to `main` is deployed to GitHub Pages.

## Playing the sandbox

| Action                                        | Input                         |
| --------------------------------------------- | ----------------------------- |
| Pick a Colour (grey, blue, green, black, red) | Keys 1–5 or click the palette |
| Draw a Line (open Stroke)                     | Hold the left button and drag |
| Draw an Object (end near the start)           | Drag back to the green marker |
| Fill an Object with the picked Colour         | Click inside it (no drag)     |
| Run / pause physics                           | Space                         |
| Reset to when physics last started            | R                             |
| Release a Frozen Object (while running)       | Right-click it                |
| Undo the last Stroke or Fill                  | Ctrl+Z                        |
| Debug overlay (colliders, bodies, fps)        | F1                            |
| Tuning panel (edit the material table live)   | F2                            |

Each Colour is a material with its own hue and texture: grey is grainy, blue glossy, green drippy, black solid and red striped like a fuse. Blue is bouncy and slippery, black grips hardest, and grey is the plain material. An unfilled Object is a light, hollow shell; its Fill adds weight by area, blue half as much as grey and black three times as much. A hit only wakes a Frozen Object that it would really set moving, so a light ball can't wake a heavy box.

Every time physics starts, the sandbox takes a snapshot, and R takes the world back to it and pauses, so you can build, watch it play out and try again. A retry plays out exactly like the first run: every start rebuilds the physics world from its snapshot.

F2 opens a panel with every number of the material table ([`src/materials/material-table.ts`](src/materials/material-table.ts)): friction, bounce and density per Colour and role, and the shared constants. Edits apply from the next physics step (densities to Objects drawn or filled afterwards), survive R and Clear, and are lost on reload; **Copy as JSON** copies the table to paste back over the defaults in the code. Changed values are outlined in yellow, and **Defaults** puts them all back.

The toolbar clears the Arena and runs the engine stress tests: **Ball cannon** (3000 px/s balls at a 4 px Line), **Box tower** (10 drawn boxes) and **Pebbles** (100 drawn pebbles). Each shows its measurements under the toolbar.

The **Gallery** row below it clears the Arena and plays a ready-made demo of the Colours: **Bounce** drops the same ball onto a Line of each Colour, **Slide** puts the same box on a ramp of each Colour, and **Knock** throws the same ball at a hollow, a grey-filled and a black-filled box.

## Project structure

```
├── .github/workflows/   CI and GitHub Pages deploy
├── docs/                GDD, specs, ADRs and agent docs
├── public/              Static files copied as-is into the build
├── src/
│   ├── main.ts          Entry point: boots Phaser
│   ├── geometry/        Pure 2D maths: vectors, polygons, clipping, convex decomposition
│   ├── materials/       The Colours and the material table (pure data)
│   ├── stroke/          Stroke pipeline: raw pointer samples → Line, Object or rejection
│   ├── physics/         Physics module; the only code that talks to the engine (ADR 0001)
│   ├── sandbox/         Headless Sandbox world: Arena, Strokes, pause, undo, seeded RNG
│   ├── stress-tests/    Scripted engine stress tests (ball cannon, box tower, pebbles)
│   ├── gallery/         Colour gallery demos, built through the Sandbox world
│   ├── scenes/          Phaser scenes: input → Sandbox world commands
│   └── rendering/       Phaser drawing: world, debug overlay, toolbar, feedback
├── scripts/             Developer scripts (engine verdict)
├── index.html
└── CONTEXT.md           Domain glossary
```

`geometry/`, `materials/`, `stroke/`, `physics/`, `sandbox/` and `gallery/` have no Phaser dependency and run headless under Vitest. Tests live next to the code they cover as `*.test.ts`.
