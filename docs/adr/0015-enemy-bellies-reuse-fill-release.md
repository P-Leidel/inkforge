# Enemy Bellies reuse the Fill release, apart from the Drop

Status: Accepted.

Every Enemy carries one Colour of ink, its Belly, rolled when it is sent in (weighted by its type, among the Colours the Level has) and shown on it. When it dies in the Arena, the Belly comes out exactly as a broken Object's Fill does: the Material rules hand it to the same release, as a Fill of its type's fixed Ink filling the Enemy's body and moving as it moved. So grey and black make Rubble, blue and green a Spill, and red a Blast of its Ink at the Enemy's centre. No effect is new, and every tuning of Rubble, Spills and Blasts applies to Bellies too.

The Belly is separate from the Drop. The Drop still goes into the Ink Tanks, drawn from the generator first and unchanged; the Belly is let out after the step's Drops. Only a death at 0 HP, not below the screen, lets out a Belly: an Enemy that falls below the screen still drops its Ink but spills nothing, and one that reaches the Ink Core neither drops nor spills, since it did not die.

Chain reactions need no special case. A red Belly's Blast starts at the end of the step and spreads from the next one, so an Enemy it kills dies in a later step and goes off in turn, spaced out by the ring's travel time.

The roll draws from the simulation's generator, so a run replays exactly after R. A Clear now also starts the generator over from its seed, so a Level plays the same whatever was played before it in the same world.

## Considered Options

- **A new effect per Enemy death** (its own splash or burst): rejected. It would need its own numbers and art, and the player would have to learn a second set of rules for the same Colours.
- **Pay the Belly into the Ink Tanks as part of the Drop**: rejected. The point is a physical effect on the Arena, so killing the right Enemy in the right place becomes part of the defence.
- **Bellies on a Level flag**: rejected. They are on from Level 1, introduced by an Analysis line and a Tutorial card.
