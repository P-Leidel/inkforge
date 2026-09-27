# Ink rules live in a Game layer above the Sandbox world

The Ink Tanks, what Strokes and Fills cost, the undo history and its refunds live in a headless Game layer (`src/game/`) that issues the Sandbox world's commands. They do not live in the Sandbox world, and later the Build Phase, the Wave and the Core Zone will join them in the Game. The Sandbox world stays a physics sandbox: its commands report how much Ink they made or took back, and it never charges, refuses or refunds anything. So the gallery, the stress tests and `npm run verdict`, which build through the Sandbox world, stay free and unchanged. The Game prices the Ink the commands report and never measures it itself, so a refund always equals what was paid.

## Considered Options

- **Give the Sandbox world a phase, the Tanks and the undo history** (#38): rejected. Every demo, stress test and engine check would have to switch Ink off or carry Tanks it doesn't use, and the world would mix physics with game rules that milestones 4 and 5 keep adding to.
- **Keep the undo history in the Sandbox world and have the Game only charge**: rejected. What to take back and what to refund are the same decision, and splitting it would make the Game re-derive what undo removed.
