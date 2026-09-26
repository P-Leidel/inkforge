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

| Command              | What it does                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`        | Start the Vite dev server with hot reload                                                                                                                     |
| `npm test`           | Run all Vitest tests once                                                                                                                                     |
| `npm run test:watch` | Run tests in watch mode                                                                                                                                       |
| `npm run lint`       | Lint with ESLint                                                                                                                                              |
| `npm run format`     | Format with Prettier (`format:check` only checks)                                                                                                             |
| `npm run typecheck`  | Typecheck with `tsc`                                                                                                                                          |
| `npm run build`      | Typecheck and build the static site into `dist/`                                                                                                              |
| `npm run preview`    | Serve the built `dist/` locally                                                                                                                               |
| `npm run verdict`    | Run the engine stress tests and the Demolition scene headless and print the numbers for [ADR 0001](docs/adr/0001-phaser-box2d-physics.md#verdict-milestone-1) |

CI runs lint, format check, typecheck, tests and build on every push and pull request. Every push to `main` is deployed to GitHub Pages.

## Playing the sandbox

| Action                                                    | Input                         |
| --------------------------------------------------------- | ----------------------------- |
| Pick a Colour (grey, blue, green, black, red)             | Keys 1–5 or click the palette |
| Draw a Line (open Stroke)                                 | Hold the left button and drag |
| Draw an Object (end near the start)                       | Drag back to the green marker |
| Fill an Object with the picked Colour                     | Click inside it (no drag)     |
| Run / pause physics                                       | Space                         |
| Reset to when physics last started                        | R                             |
| Release a Frozen Object (while running)                   | Right-click it                |
| Undo the last Stroke or Fill still there                  | Ctrl+Z                        |
| Erase what the brush passes over (for testing)            | E or the palette, then drag   |
| Stats; press again for colliders, durability, Blast rings | F1                            |
| Copy the stats, with browser and GPU                      | F3                            |
| Tuning panel (edit the material table live)               | F2                            |

The Eraser is a testing tool of the sandbox, not part of the game. It removes whatever its brush (12 px) touches: a whole Object with its Fill, the Pieces of a Line it crosses (the rest stays), Rubble, Droplets and Patches. Erasing isn't breaking: no Debris, no Fill comes out and red doesn't explode, but a green Object stuck to what was erased falls free. It works paused and running; R brings back what was erased while running, and erased Strokes are gone from undo. Keys 1–5 go back to drawing.

Each Colour is a material with its own hue and texture: grey is grainy, blue glossy, green drippy, black solid and red striped like a fuse. Blue is bouncy and slippery, black grips hardest, and grey is the plain material. An unfilled Object is a light, hollow shell; its Fill adds weight by area, blue half as much as grey and black three times as much. A hit only wakes a Frozen Object that it would really set moving, so a light ball can't wake a heavy box.

Hard hits break Objects. An impact whose impulse (how hard the hit stops or throws a body; heavier and faster hits harder) beats an Object's damage threshold wears away its durability, both sides checked against their own Outline Colour. Resting and sliding never do damage, and the Terrain takes none. Objects crack in three stages as they wear, and at zero durability they burst into Debris that falls through everything and fades. Red is the most fragile and black by far the toughest; a blue Object also breaks on its third hard impact. Frozen Objects take damage too, so a hit that is too weak to wake one can still crack or break it. F1 shows the durability each Piece and Object has left, and a blue Object's impacts so far (×1/3).

Lines break Piece by Piece. Every Line is split into equal Pieces of about 48 px (one enemy wide, tunable in F2), each with its own durability and damage threshold from its Line Colour. A Piece cracks in three stages like an Object, and at zero it breaks off as a whole and bursts into Debris, while the rest of the Line stays exactly where it was drawn, even when split in two. Lines are tougher than Objects of their Colour: a box landing on grey at most cracks it, and it takes a boulder (a black box filled with black) to smash through. Blue Lines wear down from bounces, black ones hold almost anything, and red ones crumble under any hard hit and burn like a fuse (below). However many Pieces of one Line an Object lands on, that is one impact for the Object.

A broken Object's Fill comes out. Grey releases a shower of pebbles and black fewer, heavier stones: more for a bigger Fill, up to 18 pebbles or 8 stones, together weighing what the Fill weighed. Rubble comes out where the Object was, moving as it moved, and is flung outward from its centre. It rolls, piles up and deals damage by the same rule as anything else, so falling stones crack Lines, but it never breaks and can't be filled or Released. A hit from a pebble only wakes a Frozen Object light enough to be set moving by it. At most 150 pieces of Rubble exist at once; the oldest fade out to make room. You can't draw an Object over Rubble. Undo leaves Rubble where it is, Clear removes it and R brings it back as it was. A red Fill releases a Blast instead (below). F1 shows each piece's collider circle.

Green is glue. Anything moving across a green Line, Objects and Rubble alike, is dragged back by a force proportional to its speed, and its spin is slowed at the same rate. The force isn't scaled by weight, so heavy things are slowed less: a hollow ball rolled onto green stops within a Piece or two, while a black-filled one rolls on much further. A body touching several green Pieces at once is dragged once. The glue wears as it works: each green Piece loses durability by the momentum its drag removes, and breaks like any other Piece when it runs out. Things resting on green don't wear it.

A green Object sticks, once. After it starts moving (Released, knocked awake, or at the end of a squeeze), it glues itself to the first new thing it touches: the Terrain, a Line, another Object or Rubble. What it touched as it started moving doesn't count until it has been away from it for a moment, so a green box doesn't stick to the Line it was resting on or rolls along, but to what it lands on. Stuck to the Terrain, a Line or a Frozen Object it hangs fixed; stuck to a moving Object, the two move as one, and a green box that hits a Frozen one hard enough to wake it flies on stuck to it. A blob of glue shows where it holds. When either side breaks, is undone or is removed by the Rubble cap, the green Object falls free, and it never sticks again. R brings back bonds, which green Objects have stuck, and the green Pieces' wear. Pausing and starting again never makes anything stick.

A broken blue- or green-filled Object throws out a Spill: 10 to 15 Droplets, flung outward from where it was, faster than Rubble. Droplets fly through each other, never deal damage and never wake a Frozen Object, however hard they hit it; one that leaves the Arena is gone. Each Droplet becomes a Patch where it first lands: a thin strip of its ink laid along the surface there, on the Terrain, a Line, an Object or Rubble, and no longer than the edge it landed on. A bigger Fill leaves longer Patches. A Patch moves with what it is on (also when a Frozen Object is knocked loose) without weighing it down, and works like its Colour: a blue Patch bounces whatever lands on it, and a green one drags on what moves across it like a green Line. Hits on a Patch damage what it lies on by the usual rule; the Patch itself wears only as it is used, a blue one by each bounce it gives and a green one by the momentum its glue takes out, and vanishes in a puff when it is used up. A Patch goes when what it lies on breaks, is undone or is removed by the Rubble cap; on the Terrain it lasts until it is used up. At most 200 Patches exist at once; the oldest go first. Undo leaves Patches on everything else, Clear removes them, and R brings back Patches and Droplets in flight.

Red explodes. A red Object is fragile and goes off when it is destroyed, however that happens: a 40 px red ball survives rolling down a ramp or a drop of twice its height, and explodes from three times its height or any fast hit; a heavier one, filled or bigger, goes off from lower. So does a red Fill in an Object of any Colour. The Blast is a ring spreading out from the Object's centre at 800 px/s, drawn in red and fading and thinning as it weakens: at distance d from its centre it has S × (1 − d/R)² of its strength left, and it stops at its reach R. More red ink makes a bigger, stronger Blast (both grow with the square root of the red Outline's length × the Line thickness plus the red Fill's area, within limits), and a red Outline with a red Fill makes one combined Blast. The ring acts once on each Piece, Object, piece of Rubble and Droplet it reaches, measured to its nearest point, at the strength it has there. It pushes whatever moves outward (light things fly fast, up to 1200 px/s faster than they were), damages Pieces and Objects whose damage threshold it beats (it isn't an impact, so it doesn't count towards blue's three), and wakes a Frozen Object when its push would set it moving faster than a waking hit would, then pushes it; a weaker Blast only damages it. Red it destroys explodes in turn, so a chain of bombs goes off one by one as each ring travels to the next, and only red within reach goes off. Blasts pass straight through Lines and the Terrain, and leave the Terrain and Patches alone. A bomb's Fill comes out first, so its Blast throws its own pebbles as shrapnel and its Droplets. F1 shows each ring and, dotted, its reach. R brings back rings still spreading with what they have already acted on, so pausing mid-chain and pressing R replays the rest the same.

Red Lines burn like a fuse. A red Piece is the most fragile Piece there is, and it explodes too when it is destroyed, by a hard hit or a Blast: a small Blast of fixed size (reach 100 px, strength 2400) from its centre, however much red it holds. That is strong enough to destroy the next red Piece, so a red Line lit anywhere burns Piece by Piece to both ends and round bends, each Piece going as the ring from the one before reaches it, and sets off any bomb at its end. Its Blasts push, damage and wake like any other, so a red strip is a mine: a box dropped on it is blown apart as it burns, while one set down gently leaves it alone. With the default table a red Piece's Blast must still destroy a red Piece 48 px from its centre; a unit test checks this, so a tuning change that breaks the fuse fails CI. R brings back the unburnt Pieces and the rings still spreading.

Drawing a Line through an Object, moving or Frozen, squeezes the Object off the Line: it slides the shortest way off, passing through Lines and Terrain, and then restarts from rest, touching the Line it slid off. While it slides, it deals and takes no damage, and it settles onto what it stops against as if physics had just started, so even a heavy Object drawn over a red Line doesn't set it off.

Every time physics starts, the sandbox takes a snapshot, and R takes the world back to it and pauses, so you can build, watch it play out and try again. A retry plays out exactly like the first run: every start rebuilds the physics world from its snapshot. R brings back broken Objects and Pieces with the damage they had. Contacts touching when physics starts deal no damage until they come apart, so pressing Space never breaks a build. Undo removes what's left of a Line and skips Strokes that have broken completely, and Clear also sweeps away the Debris.

F2 opens a panel with every number of the material table ([`src/materials/material-table.ts`](src/materials/material-table.ts)): friction, bounce, density, durability, damage threshold, impact limit, glue drag and wear, and whether an Outline sticks or a Line or Outline explodes, per Colour and role, a Fill's kick speed, the size and number of its Rubble, whether it spills or explodes and how bounces wear its Patches, and the shared constants such as the Piece length, damage per impulse, the Rubble cap, the kick's spread, the Droplets' count and size, the Patches' length, thickness, capacity and cap, and the Blasts' speed, size, push and top push speed, and a Piece's Blast's fixed reach and strength. Edits apply from the next physics step (densities to Objects drawn or filled afterwards), survive R and Clear, and are lost on reload; **Copy as JSON** copies the table to paste back over the defaults in the code. Changed values are outlined in yellow, and **Defaults** puts them all back.

The toolbar clears the Arena and runs the engine stress tests: **Ball cannon** (3000 px/s balls at a 4 px black Line), **Box tower** (10 drawn boxes) and **Pebbles** (100 drawn pebbles). Each shows its measurements under the toolbar.

The **Gallery** row below it clears the Arena and plays a ready-made demo of the Colours. **Bounce** drops the same ball onto a Line of each Colour: blue bounces it back up, and red goes off under it; **Slide** puts the same box on a ramp of each Colour; **Knock** throws the same ball at a hollow, a grey-filled and a black-filled box; **Drop** drops a box of each Colour from high up: red explodes, well away from the rest; **Third bounce** bounces a blue ball until its third bounce breaks it; **Boulder** drops the same boulder onto a grey and a black Line: it smashes through grey and cracks black; **Rubble** breaks a grey-filled and a black-filled box side by side on a short black Line: the pebbles and stones spill onto a grey Line below, and the stones crack it; **Glue** rolls a hollow, a grey-filled and a black-filled ball across green floors, and a hollow one across grey: on green the hollow ball stops first and the black-filled one last; **Stick** throws green Objects: a box glues itself under a Line and hangs there, a ball glues itself to a wall, and a box knocks a Frozen box loose and tumbles down stuck to it; **Spill** breaks a blue-filled and a green-filled box on anvils above a Line and a Frozen box: their Droplets coat everything they land on, and a ball thrown up after them bounces high off the blue Patches and stops dead on the green ones; **Chain** drops a bomb at the end of a row of Frozen red bombs that curls up into the air: they go off one by one, straight through a black Line, and knock two Frozen boxes loose, while a bomb hanging out of reach stays; **Shrapnel** drops a grey-filled red box onto an anvil: its Blast throws the pebbles, which knock loose two Frozen posts the Blast itself can't reach; **Fuse** drops a bomb on the far end of a red Line winding down across the Arena: it burns Piece by Piece, round every bend, to a Frozen bomb whose Blast knocks two Frozen boxes loose; **Mines** drops a box on each of two red strips: the one set down gently leaves its strip alone, and the grey-filled one dropped from high sets its strip off and is blown apart, pebbles and all; and **Demolition** is the worst case for performance: a big bomb dropped at the end of a row of four more sets off a chain that tears through three grey-filled boxes and a black-filled one, a blue- and a green-filled Object and a wall of grey, blue, green and black Lines, leaving about 60 Rubble, 30 Droplets and five Blasts in well under a second.

F1 opens the stats panel, in every scene: fps and the longest frame over the last second; since the start, the average fps, the longest frame, the frames over 20 ms and over 33 ms and the 1% low (the fps 99% of frames reach), counted from the frame after a scene was loaded or R was pressed, and only while physics runs; where the last second's time went (physics, the scene's drawing, Phaser's render); bodies by kind; and what the renderer replays each frame, with the textures that Strokes, Patches and Rubble are baked into and their memory. A graph shows the last 240 frames, split the same way, with guides at 60 fps and 33 ms. It is drawn from one font texture and plain rectangles, redrawn four times a second, so leaving it on while measuring costs the game next to nothing, and milestone 2's exit criterion, at least 60 fps on average and no frame over 33 ms, can be read in the browser. F3 or **Copy readings** copies it all with the browser, the GPU and the screen size, to paste into an issue. Press F1 again for the debug view on top (colliders, durability, Blast rings), which does cost frame time, and once more to close it. `npm run verdict` times the same scene headless: the whole Sandbox world step over the run and during the chain, and one read of every view per step, as each frame's drawing makes. `npm test` holds the render budget: the Demolition chain may replay at most 1,500 drawing calls in any frame, Strokes that stand still replay none, and textures are freed with what they show (`src/rendering/world-renderer.test.ts`).

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
│   ├── sandbox/         Headless Sandbox world: a module per kind of Arena contents, the Contact ledger, the Material rules, pause, Reset
│   ├── stress-tests/    Scripted engine stress tests (ball cannon, box tower, pebbles)
│   ├── gallery/         Colour gallery demos, built through the Sandbox world
│   ├── scenes/          Phaser scenes: input → Sandbox world commands
│   └── rendering/       Phaser drawing: world, debug overlay, toolbar, feedback
├── scripts/             Developer scripts (engine verdict)
├── index.html
└── CONTEXT.md           Domain glossary
```

`geometry/`, `materials/`, `stroke/`, `physics/`, `sandbox/` and `gallery/` have no Phaser dependency and run headless under Vitest. Tests live next to the code they cover as `*.test.ts`.
