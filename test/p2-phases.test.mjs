import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYamlSubset } from '../lib/yaml-subset.js';
import { bindCheckFiles, mergePhasesDocuments, normalizePhasesDocument } from '../lib/phases/schema.js';
import { loadPhases, parsePhasesText } from '../lib/phases/loader.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const defaultText = await readFile(join(root, 'phases.default.yml'), 'utf8');
const defaultDoc = parseYamlSubset(defaultText);

test('normalizes the shipped default phases document', () => {
  const document = normalizePhasesDocument(defaultDoc);
  assert.equal(document.version, 1);
  assert.equal(document.phases.length, 9);
  assert.equal(document.phases[0].id, 'M0');
  assert.equal(document.phases[8].id, 'M8');
  assert.ok(Object.isFrozen(document));
  assert.ok(Object.isFrozen(document.phases));
});

test('rejects duplicate ids, unknown versions and bad check prefixes', () => {
  assert.throws(() => normalizePhasesDocument({
    version: 1,
    phases: [
      { id: 'M0', name: 'a', exit: { checks: [], artifacts: [] } },
      { id: 'M0', name: 'b', exit: { checks: [], artifacts: [] } },
    ],
  }), /duplicate phase id/);
  assert.throws(() => normalizePhasesDocument({ version: 2, phases: [] }), /version must be 1/);
  assert.throws(() => normalizePhasesDocument({
    version: 1,
    phases: [{ id: 'M0', name: 'a', exit: { checks: ['10'], artifacts: [] } }],
  }), /must match NNN/);
  assert.throws(() => normalizePhasesDocument({
    version: 1,
    phases: [{ id: 'M0', name: 'a', exit: { checks: [], artifacts: ['../x'] } }],
  }), /project-relative|must not contain/);
});

test('merges project overrides by phase id and appends new phases', () => {
  const merged = mergePhasesDocuments(defaultDoc, {
    version: 1,
    supersedes: [{ source: 'old', replacedBy: 'new', reason: 'test', at: 'now' }],
    phases: [
      { id: 'M0', name: 'override', exit: { checks: [], artifacts: [] } },
      { id: 'MX', name: 'extra', exit: { checks: [], artifacts: [] } },
    ],
  });
  assert.equal(merged.phases.find((phase) => phase.id === 'M0').name, 'override');
  assert.equal(merged.phases.at(-1).id, 'MX');
  assert.equal(merged.supersedes.length, 1);
});

test('binds each check prefix to exactly one ps1 file and rejects duplicates', () => {
  const document = normalizePhasesDocument({
    version: 1,
    phases: [
      { id: 'M0', name: 'a', exit: { checks: ['010'], artifacts: [] } },
      { id: 'M1', name: 'b', exit: { checks: ['011'], artifacts: [] } },
    ],
  });
  const bindings = bindCheckFiles(document, ['010-data.ps1', '011-split.ps1', 'README.md']);
  assert.equal(bindings.get('010'), '010-data.ps1');
  assert.equal(bindings.get('011'), '011-split.ps1');
  assert.throws(() => bindCheckFiles(document, ['010-a.ps1', '010-b.ps1']), /multiple check files/);
  assert.throws(() => bindCheckFiles(document, ['010-a.ps1']), /no check file matches/);
});

test('loads default phases and project override from a fixture project', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ml-phase-p2-'));
  try {
    await mkdir(join(dir, '.dsh-ml-phase'), { recursive: true });
    await mkdir(join(dir, 'work', 'checks'), { recursive: true });
    await writeFile(join(dir, '.dsh-ml-phase', 'phases.yml'), `
version: 1
phases:
  - id: M0
    name: project override
    exit:
      checks: ["010"]
      artifacts: []
`, 'utf8');
    await writeFile(join(dir, 'work', 'checks', '010-start.ps1'), 'exit 0\n', 'utf8');

    const loaded = await loadPhases(dir);
    assert.equal(loaded.document.phases[0].name, 'project override');
    assert.equal(loaded.bindings['010'], '010-start.ps1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parsePhasesText wraps parser errors in E_PHASES_INVALID', () => {
  assert.throws(() => parsePhasesText('version: 1\n\tphases: []'), /invalid phases YAML/);
});

test('rejects a check file shared by multiple phases', () => {
  const document = normalizePhasesDocument({
    version: 1,
    phases: [
      { id: 'M0', name: 'a', exit: { checks: ['010'], artifacts: [] } },
      { id: 'M1', name: 'b', exit: { checks: ['010'], artifacts: [] } },
    ],
  });
  assert.throws(() => bindCheckFiles(document, ['010-shared.ps1']), /shared by multiple phases/);
});
