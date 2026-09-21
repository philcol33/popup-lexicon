import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const temporary = await mkdtemp(join(tmpdir(), 'popup-lexicon-tests-'));
try {
 const output = join(temporary, 'tests.cjs');
 await build({ entryPoints: ['tests/core.test.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs', alias: { obsidian: resolve('tests/obsidian-mock.ts') } });
 process.exitCode = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit' }).status || 0;
} finally { await rm(temporary, { recursive: true, force: true }); }
