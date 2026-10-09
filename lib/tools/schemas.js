/**
 * @file JSON Schema fragments for P4 tool inputs and outputs.
 */

import { CHECK_STATUS, TOOL_NAMES } from '../contracts.js';

export const projectRootProperty = Object.freeze({ type: 'string' });

export const blockerJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    stage: { type: 'string' },
    kind: { type: 'string', enum: ['check', 'artifact'] },
    check: { type: 'string' },
    code: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['stage', 'kind', 'check', 'code', 'message'],
});

export const checkResultJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    stage: { type: 'string' },
    check: { type: 'string' },
    exitCode: { type: 'integer' },
    status: { type: 'string', enum: Object.values(CHECK_STATUS) },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    durationMs: { type: 'number' },
    ranAt: { type: 'string' },
    command: { type: 'string' },
  },
  required: ['stage', 'check', 'exitCode', 'status', 'stdout', 'stderr', 'durationMs', 'ranAt'],
});

export const phaseEvaluationJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'integer' },
    declared: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    evidenced: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    gap: { type: 'integer' },
    next: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    blockers: { type: 'array', items: blockerJsonSchema },
    deferred: { type: 'boolean' },
    deferReason: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    checkedAt: { type: 'string' },
  },
  required: ['version', 'declared', 'evidenced', 'gap', 'next', 'blockers', 'deferred', 'deferReason', 'checkedAt'],
});

export const projectStateJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: true,
});

export const phaseDefinitionJsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: true,
});

export const toolNamesJson = Object.freeze(TOOL_NAMES);

export const statusOutputSchema = phaseEvaluationJsonSchema;

export const phasesOutputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    phases: { type: 'array', items: phaseDefinitionJsonSchema },
    next: { oneOf: [phaseDefinitionJsonSchema, { type: 'null' }] },
    evaluation: phaseEvaluationJsonSchema,
  },
  required: ['phases', 'next', 'evaluation'],
});

export const advanceOutputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    from: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    to: { type: 'string' },
    state: projectStateJsonSchema,
    evaluation: phaseEvaluationJsonSchema,
    blockers: { type: 'array', items: blockerJsonSchema },
    raw: { type: 'array', items: checkResultJsonSchema },
    error: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['code', 'message'],
    },
  },
  required: ['ok'],
});

export const deferOutputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    state: projectStateJsonSchema,
    evaluation: phaseEvaluationJsonSchema,
    error: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['code', 'message'],
    },
  },
  required: ['ok'],
});
