/**
 * @file Strict YAML subset parser for the P2 phases schema.
 *
 * This parser exists to keep the plugin dependency-free in the linked-profile
 * installation mode. It supports the schema shape used by phases.default.yml
 * and project overrides:
 *
 * - block mappings and block sequences
 * - `key: value`
 * - `- scalar`
 * - `- key: value` with continuation keys
 * - quoted strings, plain strings, integers, booleans, null
 * - inline arrays such as ["010", "020"]
 * - JSON-compatible documents
 *
 * Unsupported YAML features fail closed with a line-numbered error. This is
 * intentional: a phase definition must not be silently misread.
 */

export class YamlSubsetError extends Error {
  /**
   * @param {string} message
   * @param {number} line
   */
  constructor(message, line) {
    super(`${message} at line ${line}`);
    this.name = 'YamlSubsetError';
    this.line = line;
  }
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (double) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') double = false;
      continue;
    }
    if (single) {
      if (char === "'") {
        if (line[i + 1] === "'") i += 1;
        else single = false;
      }
      continue;
    }
    if (char === '"') double = true;
    else if (char === "'") single = true;
    else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/**
 * @param {string} text
 * @returns {{indent: number, content: string, lineNumber: number}[]}
 */
function preprocess(text) {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    const lineNumber = index + 1;
    const withoutComment = stripComment(raw).replace(/\s+$/u, '');
    if (withoutComment.trim() === '') continue;

    const leading = withoutComment.match(/^\s*/u)?.[0] ?? '';
    if (leading.includes('\t')) {
      throw new YamlSubsetError('tabs are not allowed for indentation', lineNumber);
    }
    const content = withoutComment.slice(leading.length);
    if (content === '---' || content === '...') continue;
    lines.push({ indent: leading.length, content, lineNumber });
  }
  return lines;
}

/**
 * @param {string} text
 * @returns {[string, string]|null}
 */
function splitKeyValue(text) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (double) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') double = false;
      continue;
    }
    if (single) {
      if (char === "'") {
        if (text[i + 1] === "'") i += 1;
        else single = false;
      }
      continue;
    }
    if (char === '"') double = true;
    else if (char === "'") single = true;
    else if (char === ':' && (i === text.length - 1 || text[i + 1] === ' ')) {
      const key = text.slice(0, i).trim();
      if (key === '') throw new YamlSubsetError('mapping key must not be empty', 0);
      return [key, text.slice(i + 1).trim()];
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let single = false;
  let double = false;
  let escaped = false;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (double) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') double = false;
      continue;
    }
    if (single) {
      if (char === "'") {
        if (text[i + 1] === "'") i += 1;
        else single = false;
      }
      continue;
    }
    if (char === '"') double = true;
    else if (char === "'") single = true;
    else if (char === '[') depth += 1;
    else if (char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/**
 * @param {string} text
 * @param {number} lineNumber
 * @returns {unknown}
 */
function parseScalar(text, lineNumber) {
  if (text === '') return null;
  if (/^[&*!]/u.test(text)) {
    throw new YamlSubsetError('anchors, aliases and tags are not supported', lineNumber);
  }
  if (text.startsWith('|') || text.startsWith('>')) {
    throw new YamlSubsetError('block scalars are not supported', lineNumber);
  }
  if (text.startsWith('{')) {
    throw new YamlSubsetError('inline maps are not supported', lineNumber);
  }
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) {
      throw new YamlSubsetError('inline array must end with ]', lineNumber);
    }
    const inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map((part) => parseScalar(part, lineNumber));
  }
  if (text.startsWith('"')) {
    if (!text.endsWith('"')) throw new YamlSubsetError('unterminated double-quoted string', lineNumber);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new YamlSubsetError(`invalid double-quoted string: ${error.message}`, lineNumber);
    }
  }
  if (text.startsWith("'")) {
    if (!text.endsWith("'")) throw new YamlSubsetError('unterminated single-quoted string', lineNumber);
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text === 'null' || text === '~') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+$/u.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/u.test(text)) return Number(text);
  return text;
}

class Parser {
  /** @param {{indent: number, content: string, lineNumber: number}[]} lines */
  constructor(lines) {
    this.lines = lines;
    this.index = 0;
  }

  peek() {
    return this.lines[this.index];
  }

  parseNode(indent) {
    const line = this.peek();
    if (!line) throw new YamlSubsetError('unexpected end of document', 0);
    if (line.indent !== indent) {
      throw new YamlSubsetError(`expected indentation ${indent}, got ${line.indent}`, line.lineNumber);
    }
    if (line.content === '-' || line.content.startsWith('- ')) return this.parseSequence(indent);
    return this.parseMapping(indent);
  }

  parseMapping(indent) {
    const result = {};
    while (this.index < this.lines.length) {
      const line = this.peek();
      if (line.indent < indent) break;
      if (line.indent > indent) {
        throw new YamlSubsetError(`unexpected indentation ${line.indent}`, line.lineNumber);
      }
      if (line.content === '-' || line.content.startsWith('- ')) break;

      const pair = splitKeyValue(line.content);
      if (!pair) throw new YamlSubsetError('expected a mapping entry', line.lineNumber);
      const [key, valueText] = pair;
      if (Object.hasOwn(result, key)) {
        throw new YamlSubsetError('duplicate key: ' + key, line.lineNumber);
      }
      this.index += 1;

      if (valueText === '') {
        const next = this.peek();
        result[key] = next && next.indent > indent ? this.parseNode(next.indent) : null;
      } else {
        result[key] = parseScalar(valueText, line.lineNumber);
      }
    }
    return result;
  }

  parseSequence(indent) {
    const result = [];
    while (this.index < this.lines.length) {
      const line = this.peek();
      if (line.indent < indent) break;
      if (line.indent > indent) {
        throw new YamlSubsetError(`unexpected indentation ${line.indent}`, line.lineNumber);
      }
      if (line.content !== '-' && !line.content.startsWith('- ')) break;

      const rest = line.content === '-' ? '' : line.content.slice(2).trim();
      this.index += 1;

      if (rest === '') {
        const next = this.peek();
        result.push(next && next.indent > indent ? this.parseNode(next.indent) : null);
        continue;
      }

      const pair = splitKeyValue(rest);
      if (!pair) {
        result.push(parseScalar(rest, line.lineNumber));
        continue;
      }

      const item = {};
      const [key, valueText] = pair;
      if (Object.hasOwn(result, key)) {
        throw new YamlSubsetError('duplicate key: ' + key, line.lineNumber);
      }
      if (valueText === '') {
        const next = this.peek();
        item[key] = next && next.indent > indent ? this.parseNode(next.indent) : null;
      } else {
        item[key] = parseScalar(valueText, line.lineNumber);
      }

      const next = this.peek();
      if (next && next.indent > indent) {
        const continuation = this.parseMapping(next.indent);
        for (const continuationKey of Object.keys(continuation)) {
          if (Object.hasOwn(item, continuationKey)) {
            throw new YamlSubsetError('duplicate key: ' + continuationKey, line.lineNumber);
          }
        }
        Object.assign(item, continuation);
      }
      result.push(item);
    }
    return result;
  }
}

/**
 * Parse a YAML subset document. JSON documents are accepted because JSON is a
 * valid YAML subset and gives callers an unambiguous escape hatch.
 *
 * @param {string} text
 * @returns {unknown}
 */
export function parseYamlSubset(text) {
  if (typeof text !== 'string') throw new TypeError('YAML input must be a string');
  const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const trimmed = source.trim();
  if (trimmed === '') throw new YamlSubsetError('document is empty', 1);
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new YamlSubsetError(`invalid JSON-compatible YAML: ${error.message}`, 1);
    }
  }

  const lines = preprocess(source);
  if (lines.length === 0) throw new YamlSubsetError('document has no content', 1);
  const parser = new Parser(lines);
  const value = parser.parseNode(lines[0].indent);
  if (parser.index !== lines.length) {
    const line = lines[parser.index];
    throw new YamlSubsetError('unexpected trailing content', line.lineNumber);
  }
  return value;
}



