# Lines stay fixed where they are drawn

An open Stroke becomes a Line that never moves, even when drawn in mid-air, until pieces of it break off. Only closed Strokes (Objects) are movable. We chose this over Lines that fall unless supported because it gives one readable rule ("lines stay, shapes fall"), makes ramps do exactly what the player drew, and avoids the wobbly, unstable stacked structures physics engines produce. Collapse still happens, piece by piece, as Lines are worn down.
