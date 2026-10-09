import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYamlSubset, YamlSubsetError } from '../lib/yaml-subset.js';

test('parses the block mapping and sequence shape used by phases.yml', () => {
  const value = parseYamlSubset(`
version: 1
phases:
  - id: M0
    name: 问题定义
    exit:
      checks: ["010", "011"]
      artifacts: []
    commonPitfalls: ["先写模型", "无指标"]
`);
  assert.equal(value.version, 1);
  assert.equal(value.phases[0].id, 'M0');
  assert.deepEqual(value.phases[0].exit.checks, ['010', '011']);
  assert.deepEqual(value.phases[0].commonPitfalls, ['先写模型', '无指标']);
});

test('parses comments and quoted scalars', () => {
  const value = parseYamlSubset(`
# top comment
name: "含 # 的字符串" # trailing comment
items:
  - one
  - 'two'
`);
  assert.equal(value.name, '含 # 的字符串');
  assert.deepEqual(value.items, ['one', 'two']);
});

test('accepts JSON-compatible YAML', () => {
  const value = parseYamlSubset('{"version":1,"phases":[{"id":"M0"}]}');
  assert.equal(value.phases[0].id, 'M0');
});

test('rejects tabs, block scalars and unterminated strings', () => {
  assert.throws(() => parseYamlSubset('version: 1\n\tphases: []'), YamlSubsetError);
  assert.throws(() => parseYamlSubset('version: 1\nname: |\n  block'), YamlSubsetError);
  assert.throws(() => parseYamlSubset('name: "unterminated'), YamlSubsetError);
});

test('does not treat a hash inside a plain scalar as a comment', () => {
  const value = parseYamlSubset('version: 1#x');
  assert.equal(value.version, '1#x');
});

test('rejects anchors, aliases and tags', () => {
  assert.throws(() => parseYamlSubset('name: &anchor value'), YamlSubsetError);
  assert.throws(() => parseYamlSubset('name: *alias'), YamlSubsetError);
  assert.throws(() => parseYamlSubset('name: !tag value'), YamlSubsetError);
});

test('rejects duplicate sequence-item keys across continuation lines', () => {
  assert.throws(() => parseYamlSubset('items:\n  - id: M0\n    id: M1'), /duplicate key/);
});
