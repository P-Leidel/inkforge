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
| Undo the last Stroke or Fill still there      | Ctrl+Z                        |
| Debug overlay (colliders, durability, fps)    | F1                            |
| Tuning panel (edit the material table live)   | F2                            |

Each Colour is a material with its own hue and texture: grey is grainy, blue glossy, green drippy, black solid and red striped like a fuse. Blue is bouncy and slippery, black grips hardest, and grey is the plain material. An unfilled Object is a light, hollow shell; its Fill adds weight by area, blue half as much as grey and black three times as much. A hit only wakes a Frozen Object that it would really set moving, so a light ball can't wake a heavy box.

Hard hits break Objects. An impact whose impulse (how hard the hit stops or throws a body; heavier and faster hits harder) beats an Object's damage threshold wears away its durability, both sides checked against their own Outline Colour. Resting and sliding never do damage, and the Terrain takes none. Objects crack in three stages as they wear, and at zero durability they burst into Debris that falls through everything and fades. Red is the most fragile and black by far the toughest; a blue Object also breaks on its third hard impact. Frozen Objects take damage too, so a hit that is too weak to wake one can still crack or break it. F1 shows the durability each Piece and Object has left, and a blue Object's impacts so far (×1/3).

Lines break Piece by Piece. Every Line is split into equal Pieces of about 48 px (one enemy wide, tunable in F2), each with its own durability and damage threshold from its Line Colour. A Piece cracks in three stages like an Object, and at zero it breaks off as a whole and bursts into Debris, while the rest of the Line stays exactly where it was drawn, even when split in two. Lines are tougher than Objects of their Colour: a box landing on grey at most cracks it, and it takes a boulder (a black box filled with black) to smash through. Blue Lines wear down from bounces, black ones hold almost anything, and red ones crumble under any hard hit. However many Pieces of one Line an Object lands on, that is one impact for the Object.

A broken Object's Fill comes out. Grey releases a shower of pebbles and black fewer, heavier stones: more for a bigger Fill, up to 18 pebbles or 8 stones, together weighing what the Fill weighed. Rubble comes out where the Object was, moving as it moved, and is flung outward from its centre. It rolls, piles up and deals damage by the same rule as anything else, so falling stones crack Lines, but it never breaks and can't be filled or Released. A hit from a pebble only wakes a Frozen Object light enough to be set moving by it. At most 150 pieces of Rubble exist at once; the oldest fade out to make room. You can't draw an Object over Rubble. Undo leaves Rubble where it is, Clear removes it and R brings it back as it was. Blue, green and red Fills release nothing yet. F1 shows each piece's collider circle.

Green is glue. Anything moving across a green Line, Objects and Rubble alike, is dragged back by a force proportional to its speed, and its spin is slowed at the same rate. The force isn't scaled by weight, so heavy things are slowed less: a hollow ball rolled onto green stops within a Piece or two, while a black-filled one rolls on much further. A body touching several green Pieces at once is dragged once. The glue wears as it works: each green Piece loses durability by the momentum its drag removes, and breaks like any other Piece when it runs out. Things resting on green don't wear it.

A green Object sticks, once. After it starts moving (Released, knocked awake, or at the end of a squeeze), it glues itself to the first new thing it touches: the Terrain, a Line, another Object or Rubble. What it touched as it started moving doesn't count until it has been away from it for a moment, so a green box doesn't stick to the Line it was resting on or rolls along, but to what it lands on. Stuck to the Terrain, a Line or a Frozen Object it hangs fixed; stuck to a moving Object, the two move as one, and a green box that hits a Frozen one hard enough to wake it flies on stuck to it. A blob of glue shows where it holds. When either side breaks, is undone or is removed by the Rubble cap, the green Object falls free, and it never sticks again. R brings back bonds, which green Objects have stuck, and the green Pieces' wear. Pausing and starting again never makes anything stick.

Drawing a Line through an Object, moving or Frozen, squeezes the Object off the Line: it slides the shortest way off, passing through Lines and Terrain, and then restarts from rest. While it slides, it deals and takes no damage.

Every time physics starts, the sandbox takes a snapshot, and R takes the world back to it and pauses, so you can build, watch it play out and try again. A retry plays out exactly like the first run: every start rebuilds the physics world from its snapshot. R brings back broken Objects and Pieces with the damage they had. Contacts touching when physics starts deal no damage until they come apart, so pressing Space never breaks a build. Undo removes what's left of a Line and skips Strokes that have broken completely, and Clear also sweeps away the Debris.

F2 opens a panel with every number of the material table ([`src/materials/material-table.ts`](src/materials/material-table.ts)): friction, bounce, density, durability, damage threshold, impact limit, glue drag and wear, and whether an Outline sticks, per Colour and role, a Fill's kick speed and the size and number of its Rubble, and the shared constants such as the Piece length, damage per impulse, the Rubble cap and the kick's spread. Edits apply from the next physics step (densities to Objects drawn or filled afterwards), survive R and Clear, and are lost on reload; **Copy as JSON** copies the table to paste back over the defaults in the code. Changed values are outlined in yellow, and **Defaults** puts them all back.

The toolbar clears the Arena and runs the engine stress tests: **Ball cannon** (3000 px/s balls at a 4 px black Line), **Box tower** (10 drawn boxes) and **Pebbles** (100 drawn pebbles). Each shows its measurements under the toolbar.

The **Gallery** row below it clears the Arena and plays a ready-made demo of the Colours. **Bounce** drops the same ball onto a Line of each Colour; **Slide** puts the same box on a ramp of each Colour; **Knock** throws the same ball at a hollow, a grey-filled and a black-filled box; **Drop** drops a box of each Colour from high up; **Third bounce** bounces a blue ball until its third bounce breaks it; **Boulder** drops the same boulder onto a grey and a black Line: it smashes through grey and cracks black; **Rubble** breaks a grey-filled and a black-filled box side by side on a short black Line: the pebbles and stones spill onto a grey Line below, and the stones crack it; **Glue** rolls a hollow, a grey-filled and a black-filled ball across green floors, and a hollow one across grey: on green the hollow ball stops first and the black-filled one last; and **Stick** throws green Objects: a box glues itself under a Line and hangs there, a ball glues itself to a wall, and a box knocks a Frozen box loose and tumbles down stuck to it.

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
│   ├── sandbox/         Headless Sandbox world: a module per kind of Arena contents, the Contact ledger, rules, pause, Reset
│   ├── stress-tests/    Scripted engine stress tests (ball cannon, box tower, pebbles)
│   ├── gallery/         Colour gallery demos, built through the Sandbox world
│   ├── scenes/          Phaser scenes: input → Sandbox world commands
│   └── rendering/       Phaser drawing: world, debug overlay, toolbar, feedback
├── scripts/             Developer scripts (engine verdict)
├── index.html
└── CONTEXT.md           Domain glossary
```

`geometry/`, `materials/`, `stroke/`, `physics/`, `sandbox/` and `gallery/` have no Phaser dependency and run headless under Vitest. Tests live next to the code they cover as `*.test.ts`.
