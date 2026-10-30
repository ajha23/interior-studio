/** Deterministic id generator for tests: cab_1, cab_2, app_3, … */
export function sequentialIds(): (prefix: string) => string {
  let n = 0;
  return (prefix) => `${prefix}_${++n}`;
}
