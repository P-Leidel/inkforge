# Enemies climb low walls too, and Stacks press harder

Status: Accepted. Amends the last sentence of [ADR 0011](0011-enemies-climb-by-capped-force.md).

ADR 0011 kept the Terrain and Lines out of Climbing, so a drawn wall was never a ladder by itself. But a wall an Enemy could step over, had it been another Enemy, stopped it dead, and a Stack piled against a wall did nothing a lone Enemy didn't. We want both to matter. So a Crawler or Runner now climbs a wall of the Terrain, an Object or a Line by the same capped force and the same step as another Enemy: when it presses one (steeper than 45°, not an overhang), and the wall's top just ahead is at most 1.2 of its heights above its feet, however steep the wall, even upright. Standing on other Enemies raises its feet, so a Stack gets over a wall none of them could alone.

We judge the wall's top by room, not by finding its top: there must be nothing of the Terrain, an Object or a Line in a box the Enemy's size just ahead of it, standing the climbing step above its feet. That needs no new geometry, follows a wall made of many Pieces or Terrain polygons, and refuses a climb under a low ceiling where the Enemy could not fit anyway. A drawn wall is still no ladder: one taller than the step stops a lone Enemy as before.

Each Enemy in a Stack (those standing on it, those it stands on, and so on) wears what it presses at its rate times 1 plus `stackWear` (0.5) for every other Enemy in the Stack, so a pile at a wall breaks it faster than the same Enemies one by one. Floor wear is unchanged.
