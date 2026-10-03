# A Line keeps its Stroke and what is stuck to it when it changes form

Status: Accepted. Supersedes the fourth paragraph of [ADR 0016](0016-cut-off-lines-collapse.md): a Line cut in two no longer splits into Lines of their own.

A Line changes form in two ways. A Frozen Line a Grounded one is drawn to touch becomes Grounded where it hangs ([ADR 0014](0014-ungrounded-lines-start-frozen.md)), and a Collapse lets what a Piece that went held up fall ([ADR 0016](0016-cut-off-lines-collapse.md)). Both used to take the Line's bodies away and add new ones, so whatever was stuck to it came loose: a green Object stuck under a shelf fell off as the shelf was Grounded, or as it came down. And a Line cut in two became several Lines with new ids, so everything that counts by Stroke (the Ink it paid, the Eraser's refunds, undo) needed a map from each split-off Line back to the Stroke it was drawn as, and every Piece was said to go and come back.

So a Line is now made of **Runs**: a stretch of its Pieces that stand, hang or fall as one. A Line drawn whole is one Run. All of its Pieces that still stand are its Grounded Run, each a fixed body of its own, as before; each Run that isn't Grounded is one rigid body, which hangs Frozen until it falls. Grounded, Frozen and fallen are a Run's, not a Line's. A Collapse that cuts a Line leaves it one Line, with its id: what stands is still its Grounded Run, and each stretch cut off falls as a Run of its own, as ADR 0016 has it.

A change of form keeps the Line's id, its Pieces, their places along it, their damage and their Party ids, and puts what was stuck to them back where it was: Bonds stay, and so do Patches. It is said once, as `reformed`, rather than as each Piece going and coming back; the renderer bakes the Line's Runs again, and nothing else needs to hear it. The Game charges, refunds and undoes a Line as the one Stroke it was drawn as, with no map.

Right-click Releases the Frozen Run under the pointer, not the whole Line: after a Collapse and an Aftermath, a Line's Runs can lie Frozen far apart, and the player points at the one they want to drop. Releasing a Line by its id (as the stress tests do) Releases every Frozen Run of it.

A Line's view is its id, Colour and thickness, and its Runs, each with its own pose, velocity, form and Pieces; the renderer bakes tiles per Run. What reasons by Line (Ink, undo, the debug overlay) still sees one Line.
