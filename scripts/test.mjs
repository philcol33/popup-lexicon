import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const temporary = await mkdtemp(join(tmpdir(), 'popup-lexicon-tests-'));
try {
 const output = join(temporary, 'tests.cjs');
 await build({ entryPoints: ['tests/all.test.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['jsdom'], alias: { obsidian: resolve('tests/obsidian-mock.ts') } });
 process.exitCode = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit', env: { ...process.env, NODE_PATH: resolve('node_modules') } }).status || 0;
} finally { await rm(temporary, { recursive: true, force: true }); }
