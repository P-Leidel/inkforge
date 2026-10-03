# Runs hold together by touching, in every form

Status: Accepted. Supersedes one sentence of the third paragraph of [ADR 0014](0014-ungrounded-lines-start-frozen.md) ("the rest stays one body"), and widens the connectivity rule of [ADR 0016](0016-cut-off-lines-collapse.md) from the Grounded Run to every Run.

ADR 0014 let a Piece break off a Line that isn't Grounded and kept the rest as one body. Once Collapse ([ADR 0016](0016-cut-off-lines-collapse.md)) and Runs ([ADR 0017](0017-lines-keep-their-stroke-when-they-change-form.md)) came in, that left two rules for one question. A Grounded Line with a middle Piece gone falls apart into the stretches that still touch. A Frozen or falling bar with a middle Piece gone stays one rigid body, its two halves held together across the gap by nothing. That looks like a bug, and it takes away something players reach for: cutting a hanging bar in two with a Blast, or watching a falling one snap.

So a **Run is a connected stretch** of a Line's Pieces, in every form. Two Pieces are connected when they touch within the ground tolerance, the same rule Collapse and grounding use. A Line that crosses itself, or comes back to rest against itself, stays together where it touches. When a Piece goes from a Run that isn't Grounded, the Run comes apart into the stretches of it that still touch, each a Run of its own, one rigid body.

- **Where.** The check runs where Collapse runs: once whatever took Pieces away is done (an Eraser stroke, undo), or at the end of the step for Pieces that broke. Grounded and other Runs share one connectivity check in Lines.
- **Frozen.** The stretches of a Frozen Run stay Frozen where they hang. Each is Released on its own, and a Grounded Line drawn to touch one still grounds it, as long as it has not fallen.
- **Moving.** The stretches of a moving Run keep its motion. Each takes the velocity the old body had at the stretch's centre of mass (v + ω × r), and the same spin. They have fallen, and never become Grounded again.
- **What it keeps.** Each stretch weighs its own Ink and turns about its own middle. Bonds and Patches follow the Piece they are stuck to, and the change is said once, as `reformed`, as for any change of form.

A Run notes that it has fallen once a step, when its body has moved, rather than whenever someone happens to ask, so reading whether it has fallen changes nothing.

We rejected splitting by place along the Line (Pieces next to each other by index) because a hook or a loop would fall apart where it plainly still holds, and it would be a second rule beside the one Collapse already uses. We rejected leaving Frozen Runs whole and splitting only moving ones, because then a Blast that cuts a hanging bar would leave it floating as one until something knocks it, a rule the player cannot see.
