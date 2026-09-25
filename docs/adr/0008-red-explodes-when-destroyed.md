# Red explodes when destroyed, and Blasts act through the normal thresholds

Red has no trigger rule of its own. It has very low durability, takes damage through the same impact rule as every other Colour, and explodes when it is destroyed. A Blast is a ring that spreads out from the source at a fixed speed and weakens steeply with distance. When it reaches something, it acts at the strength it still has there, through thresholds that already exist: it pushes moving bodies, damages what it beats the damage threshold of, wakes Frozen Objects it beats the wake threshold of, and destroys red it beats the durability of, which chains. So only nearby red goes off, the delay between chained Blasts comes from the ring's travel time, and a red Line burns Piece by Piece like a fuse.

## Considered Options

- **Everything inside the radius is affected, and every red in it goes off**: rejected. Chains jumped across the whole radius at once, and it needed a separate trigger threshold for red.
- **Walls block Blasts**: rejected for now. It would make black a blast shield, but costs raycasts per Blast, and blowing up your own defences is part of the game. Revisit if Blasts feel unfair.
