import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findProjectRoot, isPathInside, isSamePath } from '../lib/project-root.js';

test('finds the nearest ancestor containing a project marker', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ml-phase-root-'));
  try {
    const root = join(base, 'project');
    const nested = join(root, 'a', 'b');
    await mkdir(join(root, '.dsh-ml-phase'), { recursive: true });
    await mkdir(nested, { recursive: true });

    const found = await findProjectRoot(nested, ['.dsh-ml-phase', 'work/verify.cmd']);
    assert.equal(await isSamePath(found.root, root), true);
    assert.equal(found.marker, '.dsh-ml-phase');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('supports work/verify.cmd as a marker and returns null when absent', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ml-phase-root-'));
  try {
    const root = join(base, 'project');
    const nested = join(root, 'src');
    await mkdir(join(root, 'work'), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, 'work', 'verify.cmd'), '@echo off\n', 'utf8');

    const found = await findProjectRoot(nested, ['work/verify.cmd']);
    assert.equal(await isSamePath(found.root, root), true);
    assert.equal(await findProjectRoot(nested, ['does-not-exist']), null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('rejects relative cwd and checks path containment', async () => {
  await assert.rejects(() => findProjectRoot('relative/path', ['.dsh-ml-phase']), /cwd must be absolute/);
  const base = await mkdtemp(join(tmpdir(), 'ml-phase-root-'));
  try {
    const parent = join(base, 'parent');
    const child = join(parent, 'child');
    const sibling = join(base, 'sibling');
    await mkdir(child, { recursive: true });
    await mkdir(sibling, { recursive: true });
    assert.equal(await isPathInside(parent, child), true);
    assert.equal(await isPathInside(parent, sibling), false);
    assert.equal(await isPathInside(parent, parent), false);
    assert.equal(await isSamePath(parent, child), false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
