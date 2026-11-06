import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts/check-plugin-version.mjs');
function setup(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-freshness-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const source = path.join(home, 'source'), installed = path.join(home, 'installed');
  for (const dir of [source, installed]) {
    for (const sub of ['.claude-plugin', '.codex-plugin', 'scripts', 'skills/example']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    for (const manifest of ['.claude-plugin', '.codex-plugin']) fs.writeFileSync(path.join(dir, manifest, 'plugin.json'), JSON.stringify({ name: 'game-dev-team', version: '0.50.0' }));
    fs.writeFileSync(path.join(dir, 'scripts/tool.mjs'), 'export const value=1;');
    fs.writeFileSync(path.join(dir, 'skills/example/SKILL.md'), '# Example');
  }
  fs.mkdirSync(path.join(home, '.claude/plugins'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'game-dev-team@game-dev-team': [{ scope: 'user', version: '0.50.0', installPath: installed }] } }));
  fs.writeFileSync(path.join(home, '.claude/plugins/known_marketplaces.json'), JSON.stringify({ 'game-dev-team': { source: { source: 'directory', path: source } } }));
  const run = () => spawnSync(process.execPath, [script, '--harness', 'claude', '--json'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex') } });
  return { home, source, installed, run };
}
test('same version checks missing, modified and extra deployed files', t => {
  const x = setup(t);
  assert.equal(x.run().status, 0);
  fs.writeFileSync(path.join(x.source, 'scripts/new.mjs'), 'new');
  let r = x.run(); assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(JSON.parse(r.stdout).installations[0].missing.includes('scripts/new.mjs'));
  fs.copyFileSync(path.join(x.source, 'scripts/new.mjs'), path.join(x.installed, 'scripts/new.mjs'));
  fs.writeFileSync(path.join(x.installed, 'scripts/tool.mjs'), 'old');
  r = x.run(); assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).installations[0].changed.includes('scripts/tool.mjs'));
  fs.copyFileSync(path.join(x.source, 'scripts/tool.mjs'), path.join(x.installed, 'scripts/tool.mjs'));
  fs.writeFileSync(path.join(x.installed, 'scripts/obsolete.mjs'), 'old');
  assert.equal(x.run().status, 1);
  fs.unlinkSync(path.join(x.installed, 'scripts/obsolete.mjs'));
  fs.mkdirSync(path.join(x.installed, 'out')); fs.writeFileSync(path.join(x.installed, 'out/local.txt'), 'ignored');
  assert.equal(x.run().status, 0);
});
test('missing installation cannot report latest; remote source remains unknown', t => {
  const x = setup(t);
  fs.renameSync(x.installed, x.installed + '-moved');
  assert.equal(x.run().status, 3);
  fs.renameSync(x.installed + '-moved', x.installed);
  fs.writeFileSync(path.join(x.home, '.claude/plugins/known_marketplaces.json'), JSON.stringify({ 'game-dev-team': { source: { source: 'github', repo: 'fixture/repository' }, installLocation: x.source } }));
  const r = x.run(); assert.equal(r.status, 3);
  assert.match(r.stdout, /fixture\/repository/);
});
test('Codex installed registry selects active version, not archived cache', async t => {
  const x = setup(t);
  const { inspectInstallations } = await import('../scripts/check-plugin-version.mjs');
  const cache = path.join(x.home, '.codex/plugins/cache/game-dev-team-local/game-dev-team/0.50.0');
  fs.cpSync(x.installed, cache, { recursive: true });
  fs.mkdirSync(path.join(x.home, '.codex/plugins/cache/game-dev-team-local/game-dev-team/0.1.0'), { recursive: true });
  const opts = { home: x.home, codexHome: path.join(x.home, '.codex'), harness: 'codex', codexList: { installed: [{ pluginId: 'game-dev-team@game-dev-team-local', name: 'game-dev-team', marketplaceName: 'game-dev-team-local', version: '0.50.0', enabled: true, installed: true, source: { source: 'local', path: x.source }, marketplaceSource: { sourceType: 'local', source: x.source } }] } };
  let r = inspectInstallations(root, opts);
  assert.equal(r.code, 0); assert.equal(r.installations.length, 1);
  fs.writeFileSync(path.join(x.source, 'scripts/new.mjs'), 'new');
  r = inspectInstallations(root, opts);
  assert.equal(r.code, 1); assert.deepEqual(r.installations[0].missing, ['scripts/new.mjs']);
  assert.equal(r.installations[0].harness, 'codex');
});
