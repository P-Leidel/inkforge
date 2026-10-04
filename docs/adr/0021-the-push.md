# Enemies queued behind one at a wall push it on

Status: Accepted. Builds on the Stack's wear in [ADR 0013](0013-enemies-climb-low-walls.md).

Until now an Enemy wore what it pressed at its own rate, raised only by its Stack. A line of Enemies pressed against a wall was no worse than the one at the front, so a crowd at a wall was never a danger and thinning it never mattered; and the Siege Walker, too heavy to wall off, did nothing to a wall through the Crawlers in front of it. Box2D already passes the line's weight on as contact force, but wear goes by time in contact, not force, so none of it showed.

So a **Push**: the Enemies behind one that presses a Piece or an Object, each pressing into the next. An Enemy presses into another when it walked this step (standing or climbing, upright) and touches it ahead of itself (`isAhead`), toward the Ink Core. The front one need not be stalled: one that presses a Piece while getting past is pushed on as surely.

- The front Enemy wears what it presses at `pressing × (1 + stackWear × Stack + Σ push)`, where each Enemy in its Push adds its type's `push`, a column of the enemy table: Crawler 0.2, Runner 0.1, Heavy 0.6, Siege Walker 4. Four Crawlers behind a Siege Walker roughly double its wear; a Siege Walker behind a Crawler makes it wear five times as fast.
- The wear lands only on what the front Enemy presses. Floor wear is unchanged, and Enemies never wear.
- An Enemy counts once however many chains reach it, and chains branch: a Push is everything reachable backwards from the front.
- A chain stops at a gap, and at an Enemy that doesn't walk: a Tipped Siege Walker, or one in the air. It adds nothing, and neither do those pressing only into it, as it presses into nothing itself.
- An Enemy that presses a wall of its own while it presses into another counts in both: it wears its own wall and pushes the one ahead.

The pure part, the chains and the formula, is `src/sandbox/push.ts`; the Enemy rules say who presses into whom.

We rejected wearing by contact force, which would have made all wear depend on mass and the solver's iterations and retuned every type at once, and a flat bonus per Enemy behind, which could not make a Siege Walker behind a Crawler any worse than a Crawler behind one. The `push` values are small for today's types, so Levels 1 to 3 change little; the milestone 6 exit playtest checks that.
