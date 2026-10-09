/**
 * @file Error type shared by P2 phase and state modules.
 */

/**
 * Typed error carrying one of the frozen P0 error codes.
 */
export class PhaseGateError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {{cause?: unknown}} [options]
   */
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = 'PhaseGateError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

/**
 * @param {unknown} value
 * @returns {value is PhaseGateError}
 */
export function isPhaseGateError(value) {
  return value instanceof PhaseGateError;
}
