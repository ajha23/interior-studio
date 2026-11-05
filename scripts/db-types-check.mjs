// Fails when the committed Supabase types are stale (spec 041, FR-005).
// Regenerates types from the local stack and compares them with the committed file.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const TYPES_FILE = 'src/infrastructure/supabase/database.types.ts';

let generated;
try {
  generated = execFileSync(
    'npx',
    ['supabase', 'gen', 'types', 'typescript', '--local', '--schema', 'public'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch {
  console.error('Could not generate types. Is the local stack running? Try: npm run db:start');
  process.exit(2);
}

const committed = existsSync(TYPES_FILE) ? readFileSync(TYPES_FILE, 'utf8') : null;

if (committed !== generated) {
  console.error(`Stale generated types: ${TYPES_FILE} — run npm run db:types`);
  process.exit(1);
}

console.log(`Generated types are current: ${TYPES_FILE}`);
