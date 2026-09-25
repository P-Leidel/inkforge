# Glue drags every moving body, not only enemies

The GDD said a green Line slows enemies. We made glue a property of the material instead: anything moving that touches green ink (a green Line or a green Patch) gets a drag force against its motion, proportional to its speed. Friction can't do this job, because a ball rolls across a high-friction surface without slowing down. The drag is not scaled by mass, so heavier bodies are slowed less, which gives "green slows Heavies less" from the physics rather than from a per-enemy table, and it lets glue be built and tuned in milestone 2 before enemies exist.

## Consequences

Because glue now works against everything, green Lines and Patches wear down as their drag removes momentum. Otherwise a glue floor would be a permanent, free slow field, which would undercut ink scarcity.
