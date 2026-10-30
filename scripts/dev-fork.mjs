// Starts Anvil forking Base Sepolia: anvil --fork-url "$RPC_URL" --chain-id 84532
// RPC_URL comes from the environment or .env. It is never printed.
// Usage: pnpm dev:fork [extra anvil args]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function fromDotEnv(name) {
  if (!existsSync('.env')) return undefined;
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${name}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2') || undefined;
}

const rpc = process.env.RPC_URL || fromDotEnv('RPC_URL');
if (!rpc) {
  console.error('RPC_URL is not set (environment or .env). Use a Base Sepolia RPC, e.g. Alchemy.');
  process.exit(1);
}

console.log('Starting Anvil: fork of Base Sepolia (chain id 84532) at http://127.0.0.1:8545');
const anvil = spawn('anvil', ['--fork-url', rpc, '--chain-id', '84532', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
});
anvil.on('error', (e) => {
  console.error(e.code === 'ENOENT' ? 'anvil not found. Install Foundry: https://getfoundry.sh' : e.message);
  process.exit(1);
});
anvil.on('exit', (code) => process.exit(code ?? 0));
