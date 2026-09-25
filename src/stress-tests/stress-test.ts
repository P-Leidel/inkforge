/**
 * A scripted engine stress test (milestone 1 spec, "Engine verdict"). It sets
 * itself up through the Sandbox world's public commands, so it measures what
 * players actually get.
 */
export interface StressTest {
  readonly name: string;
  /** Called once per frame, after the world has advanced. */
  update(): void;
  /** A one-line summary of the measurements so far. */
  status(): string;
}
