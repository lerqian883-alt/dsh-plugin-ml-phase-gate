/**
 * @file Artifact existence and non-empty checks for P3.
 */

import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ERROR_CODES } from '../contracts.js';
import { requireSafeRelativePath } from '../config.js';
import { PhaseGateError } from '../errors.js';
import { isPathInside } from '../project-root.js';

/**
 * @param {string} projectRoot
 * @param {string} stageId
 * @param {string} artifactPath
 * @returns {Promise<Readonly<object>>}
 */
export async function checkArtifact(projectRoot, stageId, artifactPath) {
  let safePath;
  try {
    safePath = requireSafeRelativePath(artifactPath, 'artifactPath');
  } catch (error) {
    return Object.freeze({
      stage: stageId,
      artifact: artifactPath,
      exists: false,
      kind: null,
      size: 0,
      checkedAt: new Date().toISOString(),
      error: error.message,
    });
  }

  const fullPath = resolve(projectRoot, safePath);
  if (!(await isPathInside(projectRoot, fullPath))) {
    return Object.freeze({
      stage: stageId,
      artifact: artifactPath,
      exists: false,
      kind: null,
      size: 0,
      checkedAt: new Date().toISOString(),
      error: 'artifact escapes project root',
    });
  }

  try {
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      const entries = await readdir(fullPath);
      return Object.freeze({
        stage: stageId,
        artifact: artifactPath,
        exists: true,
        kind: 'directory',
        size: entries.length,
        checkedAt: new Date().toISOString(),
      });
    }
    return Object.freeze({
      stage: stageId,
      artifact: artifactPath,
      exists: true,
      kind: 'file',
      size: info.size,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Object.freeze({
      stage: stageId,
      artifact: artifactPath,
      exists: false,
      kind: null,
      size: 0,
      checkedAt: new Date().toISOString(),
      error: error.code === 'ENOENT' ? 'artifact not found' : error.message,
    });
  }
}

/**
 * @param {string} projectRoot
 * @param {Readonly<{id: string, exit: {artifacts: string[]}}>} stage
 * @returns {Promise<ReadonlyArray<Readonly<object>>>}
 */
export async function checkArtifacts(projectRoot, stage) {
  if (!stage || typeof stage.id !== 'string' || !Array.isArray(stage.exit?.artifacts)) {
    throw new PhaseGateError(ERROR_CODES.ARTIFACT_MISSING, 'invalid stage for artifact checks');
  }
  const results = [];
  for (const artifact of stage.exit.artifacts) {
    results.push(await checkArtifact(projectRoot, stage.id, artifact));
  }
  return Object.freeze(results);
}

/**
 * @param {Readonly<object>} artifact
 * @returns {boolean}
 */
export function artifactPassed(artifact) {
  return artifact.exists === true && artifact.size > 0;
}
