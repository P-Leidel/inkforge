# Drawing during a Wave uses only Wave Ink, inside the Core Zone

Status: Superseded by [ADR 0012](0012-continuous-building-between-intermissions.md). The Core Zone, Locked Ink and Build Phase code is kept at the git tag `build-phase-core-zone` (e.g. `git show build-phase-core-zone:src/game/defence-loop.ts`).

The GDD allowed drawing anywhere during a Wave at a surcharge. That made dropping a black rock on each enemy the dominant answer. Instead, Build Phase leftovers become Locked Ink, and during a Wave the player can only spend Ink dropped by kills in that Wave, and only inside the Core Zone. Locked Ink still occupies the Ink Tank, so saving Ink leaves less room for drops.
