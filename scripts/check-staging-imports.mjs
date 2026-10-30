// Fails if anything outside contracts/testnet/ or test/ imports InheritanceGuardStaging.
// The staging contract has a 15-second minimum timer and must never reach production code.
// Usage: pnpm check:staging (also runs in CI)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOWED_DIRS = ['contracts/testnet/', 'test/'];
// The staging deploy script has to import the contract it deploys; it refuses mainnet chain ids.
const ALLOWED_FILES = new Set(['script/DeployStaging.s.sol', 'scripts/check-staging-imports.mjs']);
const SOURCE = /\.(sol|ts|tsx|js|jsx|mjs|cjs)$/;
const IMPORT = /\b(import|require|from)\b[^\n;]*InheritanceGuardStaging/;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => SOURCE.test(f) && !ALLOWED_FILES.has(f) && !ALLOWED_DIRS.some((d) => f.startsWith(d)));

const offenders = [];
for (const f of files) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => IMPORT.test(line) && offenders.push(`${f}:${i + 1}: ${line.trim()}`));
}

if (offenders.length) {
  console.error('InheritanceGuardStaging is imported outside contracts/testnet/ and test/:');
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log(`check-staging-imports: OK (${files.length} files scanned)`);
