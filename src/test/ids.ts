/** Deterministic id generator for tests: cab_1, cab_2, app_3, … */
export function sequentialIds(): (prefix: string) => string {
  let n = 0;
  return (prefix) => `${prefix}_${++n}`;
}

/** Fixed studio and user ids for store tests. Test fixtures only: the app has no default ids (constitution XII). */
export const TEST_ORG_ID = 'f1000000-0000-4000-8000-000000000001';
export const TEST_ACTOR_ID = 'f2000000-0000-4000-8000-000000000002';
export const OTHER_TEST_ORG_ID = 'f1000000-0000-4000-8000-000000000099';
