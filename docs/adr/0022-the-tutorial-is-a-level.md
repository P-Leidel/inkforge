# The Tutorial is a Level

Status: Accepted.

The Tutorial used to be seven cards with no Arena: they opened by themselves the first time Campaign Level 1 started, a `localStorage` key remembered that they had been seen, and H opened them again. Whether they were due was decided in the scene, which has no tests, from the Campaign Level's index; the first card said Enemies came "from the left" and the Ink Core was "on the right", whatever the Arena's `spawnSide`.

So the **Tutorial is a Level** (`src/levels/tutorial.ts`), opened from the title screen's first entry: one flat field, grey and black, and three small Waves of Crawlers. A Level lists **Cards**, one list per Wave (`Level.cards`), and a Wave's Cards open the first time its Intermission is reached since the Level started: the goal and the controls before Wave 1, killing and Bellies before Wave 2, pebble vs stone before Wave 3. Nothing in the code asks whether a Level is the Tutorial to show them.

- It is always open and locks nothing: Campaign Level 1 is unlocked whether or not it was played. Nothing opens by itself on a first visit, and the seen key is gone; its place first on the title screen is the nudge. Level 1's hints still say what is new to someone who skips it.
- It is played like a Campaign Level, without the sandbox tool. Cleared, it offers **Start Campaign** (Campaign Level 1) and **Title**; lost, **Retry Wave**, **Restart Level** and **Title**. It has no hints, which are worked out across the Campaign's Levels; the Analysis line still shows.
- R and Retry Wave go back to an Intermission whose Cards have opened, and don't open them again; Clear and Restart Level start the Level over, and do.
- H still opens Cards anywhere, as a reference: all of the Tutorial's, in order, pausing a Wave under way.
- The first Card names no side: Enemies walk in "from the Spawn arrows", plural, as a later Arena may have more than one.

We rejected opening every Card at the start of a practice Level (a wall of text before any play) and guided steps that wait for the player to do each thing (a new system watching the player's actions, which can come later on top of Cards if playtests want it).

**The Session owns the start of a Level, as it owns the end** ([#175](https://github.com/P-Leidel/inkforge/pull/175)). It holds the Card viewer and opens a Wave's Cards; every command (`play`, `playCampaign`, `playTutorial`, `clear`, `retry`, `act`) says what it did (`Acted`), and its reading says what kind of play it is (`play`: Free play, Campaign or Tutorial), which is all the scene needs to show Free play's toolbar buttons. The scene only follows. While at it, a Campaign Level's hints read the Level's Waves as they are being played, as the Analysis counts do, so an Enemy type F2 takes out of the next Wave gets no hint.
