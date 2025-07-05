'use strict';
/**
 * @module Base
 */
/**
 * Module dependencies.
 */

import diff from 'diff';
import milliseconds from 'ms';
import * as utils from '../utils.js';
import supportsColor from 'supports-color';
import symbols from 'log-symbols';
import {constants} from '../runner/index.js';
const {EVENT_TEST_PASS, EVENT_TEST_FAIL} = constants;

const isBrowser = utils.isBrowser();

function getBrowserWindowSize() {
  if ('innerHeight' in globalThis) {
    return [globalThis.innerHeight, globalThis.innerWidth];
  }
  // In a Web Worker, the DOM Window is not available.
  return [640, 480];
}

/**
 * Check if both stdio streams are associated with a tty.
 */
const isatty = isBrowser || (process.stdout.isTTY && process.stderr.isTTY);

/**
 * Save log references to avoid tests interfering (see GH-3604).
 */
const consoleLog = console.log;

/**
 * Enable coloring by default, except in the browser interface.
 */
export const useColors =
  !isBrowser &&
  (supportsColor.stdout || process.env.MOCHA_COLORS !== undefined);

/**
 * Inline diffs instead of +/-
 */
export let inlineDiffs = false;

/**
 * Truncate diffs longer than this value to avoid slow performance
 */
export let maxDiffSize = 8192;

/**
 * Default color map.
 */
export const colors = {
  pass: 90,
  fail: 31,
  'bright pass': 92,
  'bright fail': 91,
  'bright yellow': 93,
  pending: 36,
  suite: 0,
  'error title': 0,
  'error message': 31,
  'error stack': 90,
  checkmark: 32,
  fast: 90,
  medium: 33,
  slow: 31,
  green: 32,
  light: 90,
  'diff gutter': 90,
  'diff added': 32,
  'diff removed': 31,
  'diff added inline': '30;42',
  'diff removed inline': '30;41'
};

/**
 * Default symbol map.
 */
export const symbols = {
  ok: symbols.success,
  err: symbols.error,
  dot: '.',
  comma: ',',
  bang: '!'
};

/**
 * Color `str` with the given `type`,
 * allowing colors to be disabled,
 * as well as user-defined color
 * schemes.
 *
 * @private
 * @param {string} type
 * @param {string} str
 * @return {string}
 */
export function color(type, str) {
  if (!useColors) {
    return String(str);
  }
  return '\u001b[' + colors[type] + 'm' + str + '\u001b[0m';
}

/**
 * Expose term window size, with some defaults for when stderr is not a tty.
 */
export const window = {
  width: 75
};

if (isatty) {
  if (isBrowser) {
    window.width = getBrowserWindowSize()[1];
  } else {
    window.width = process.stdout.getWindowSize(1)[0];
  }
}

/**
 * Expose some basic cursor interactions that are common among reporters.
 */
export const cursor = {
  hide() {
    isatty && process.stdout.write('\u001b[?25l');
  },

  show() {
    isatty && process.stdout.write('\u001b[?25h');
  },

  deleteLine() {
    isatty && process.stdout.write('\u001b[2K');
  },

  beginningOfLine() {
    isatty && process.stdout.write('\u001b[0G');
  },

  CR() {
    if (isatty) {
      cursor.deleteLine();
      cursor.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};

export function showDiff(err) {
  return (
    err &&
    err.showDiff !== false &&
    sameType(err.actual, err.expected) &&
    err.expected !== undefined
  );
}

function stringifyDiffObjs(err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
}

/**
 * Returns a diff between 2 strings with coloured ANSI output.
 *
 * @description
 * The diff will be either inline or unified dependent on the value
 * of `Base.inlineDiff`.
 *
 * @param {string} actual
 * @param {string} expected
 * @return {string} Diff
 */
export function generateDiff(actual, expected) {
  try {
    let maxLen = maxDiffSize;
    let skipped = 0;
    if (maxLen > 0) {
      skipped = Math.max(actual.length - maxLen, expected.length - maxLen);
      actual = actual.slice(0, maxLen);
      expected = expected.slice(0, maxLen);
    }
    let result = inlineDiffs
      ? inlineDiff(actual, expected)
      : unifiedDiff(actual, expected);
    if (skipped > 0) {
      result = `${result}\n      [mocha] output truncated to ${maxLen} characters, see "maxDiffSize" reporter-option\n`;
    }
    return result;
  } catch (err) {
    const msg =
      '\n      ' +
      color('diff added', '+ expected') +
      ' ' +
      color('diff removed', '- actual:  failed to generate Mocha diff') +
      '\n';
    return msg;
  }
}

/**
 * Traverses err.cause and returns all stack traces
 *
 * @private
 * @param {Error} err
 * @param {Set<Error>} [seen]
 * @return {FullErrorStack}
 */
export function getFullErrorStack(err, seen) {
  if (seen && seen.has(err)) {
    return {message: '', msg: '<circular>', stack: ''};
  }
  let message;
  if (typeof err.inspect === 'function') {
    message = err.inspect() + '';
  } else if (err.message && typeof err.message.toString === 'function') {
    message = err.message + '';
  } else {
    message = '';
  }
  let msg;
  let stack = err.stack || message;
  let index = message ? stack.indexOf(message) : -1;
  if (index === -1) {
    msg = message;
  } else {
    index += message.length;
    msg = stack.slice(0, index);
    // remove msg from stack
    stack = stack.slice(index + 1);
    if (err.cause) {
      seen = seen || new Set();
      seen.add(err);
      const causeStack = getFullErrorStack(err.cause, seen);
      stack +=
        '\n   Caused by: ' +
        causeStack.msg +
        (causeStack.stack ? '\n' + causeStack.stack : '');
    }
  }
  return {message, msg, stack};
}

/**
 * Outputs the given `failures` as a list.
 *
 * @public
 * @memberof Mocha.reporters.Base
 * @variation 1
 * @param {Object[]} failures - Each is Test instance with corresponding
 *     Error property
 */
export function list(failures) {
  let multipleErr;
  let multipleTest;
  consoleLog();
  failures.forEach(function (test, i) {
    // format
    let fmt =
      color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');
    // msg
    let err;
    if (test.err && test.err.multiple) {
      if (multipleTest !== test) {
        multipleTest = test;
        multipleErr = [test.err].concat(test.err.multiple);
      }
      err = multipleErr.shift();
    } else {
      err = test.err;
    }
    let {message, msg, stack} = getFullErrorStack(err);
    // uncaught
    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }
    // explicitly show diff
    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      fmt =
        color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
      const match = message.match(/^([^:]+): expected/);
      msg = '\n      ' + color('error message', match ? match[1] : msg);
      msg += generateDiff(err.actual, err.expected);
    }
    stack = stack.replace(/^/gm, '  ');
    let testTitle = '';
    test.titlePath().forEach(function (str, index) {
      if (index !== 0) testTitle += '\n     ';
      testTitle += '  '.repeat(index) + str;
    });
    consoleLog(fmt, i + 1, testTitle, msg, stack);
  });
}

/**
 * Constructs a new `Base` reporter instance.
 *
 * @description
 * All other reporters generally inherit from this reporter.
 *
 * @public
 * @class
 * @memberof Mocha.reporters
 * @param {Runner} runner - Instance triggers reporter actions.
 * @param {Object} [options] - runner options
 */
export default function Base(runner, options) {
  const failures = (this.failures = []);
  if (!runner) {
    throw new TypeError('Missing runner argument');
  }
  this.options = options || {};
  this.runner = runner;
  this.stats = runner.stats; // assigned so Reporters keep a closer reference
  const maxDiffSizeOpt =
    this.options.reporterOption && this.options.reporterOption.maxDiffSize;
  if (maxDiffSizeOpt !== undefined && !isNaN(Number(maxDiffSizeOpt))) {
    maxDiffSize = Number(maxDiffSizeOpt);
  }
  runner.on(EVENT_TEST_PASS, function (test) {
    if (test.duration > test.slow()) {
      test.speed = 'slow';
    } else if (test.duration > test.slow() / 2) {
      test.speed = 'medium';
    } else {
      test.speed = 'fast';
    }
  });
  runner.on(EVENT_TEST_FAIL, function (test, err) {
    if (showDiff(err)) stringifyDiffObjs(err);
    // more than one error per test
    if (test.err && err instanceof Error) {
      test.err.multiple = (test.err.multiple || []).concat(err);
    } else {
      test.err = err;
    }
    failures.push(test);
  });
}

/**
 * Outputs common epilogue used by many of the bundled reporters.
 *
 * @public
 * @memberof Mocha.reporters
 */
Base.prototype.epilogue = function () {
  const stats = this.stats;
  let fmt;

  consoleLog();

  fmt =
    color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');

  consoleLog(fmt, stats.passes || 0, milliseconds(stats.duration));

  // pending
  if (stats.pending) {
    fmt = color('pending', ' ') + color('pending', ' %d pending');
    consoleLog(fmt, stats.pending);
  }
  // failures
  if (stats.failures) {
    fmt = color('fail', '  %d failing');
    consoleLog(fmt, stats.failures);
    list(this.failures);
    consoleLog();
  }

  consoleLog();
};

/**
 * Pads the given `str` to `len`.
 *
 * @private
 * @param {string} str
 * @param {string} len
 * @return {string}
 */
function pad(str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

/**
 * Returns inline diff between 2 strings with coloured ANSI output.
 *
 * @private
 * @param {String} actual
 * @param {String} expected
 * @return {string} Diff
 */
function inlineDiff(actual, expected) {
  let msg = errorDiff(actual, expected);
  const lines = msg.split('\n');
  // linenos

  if (lines.length > 4) {
    const width = String(lines.length).length;
    msg = lines
      .map((line, index) => pad(index + 1, width) + ' | ' + line)
      .join('\n');
  }
  // legend
  msg =
    '\n' +
    color('diff removed inline', 'actual') +
    ' ' +
    color('diff added inline', 'expected') +
    '\n\n' +
    msg +
    '\n';
  // indent
  return msg.replace(/^/gm, '      ');
}

/**
 * Returns unified diff between two strings with coloured ANSI output.
 *
 * @private
 * @param {String} actual
 * @param {String} expected
 * @return {string} The diff.
 */
function unifiedDiff(actual, expected) {
  let indent = '      ';
  function cleanUp(line) {
    if (line[0] === '+') {
      return indent + colorLines('diff added', line);
    }
    if (line[0] === '-') {
      return indent + colorLines('diff removed', line);
    }
    if (line.match(/@@/)) {
      return '--';
    }
    if (line.match(/\\ No newline/)) {
      return null;
    }
    return indent + line;
  }
  function notBlank(line) {
    return typeof line !== 'undefined' && line !== null;
  }
  var msg = diff.createPatch('string', actual, expected);
  var lines = msg.split('\n').splice(5);
  return (
    '\n      ' +
    colorLines('diff added', '+ expected') +
    ' ' +
    colorLines('diff removed', '- actual') +
    '\n\n' +
    lines.map(cleanUp).filter(notBlank).join('\n')
  );
}

/**
 * Returns character diff for `err`.
 *
 * @private
 * @param {String} actual
 * @param {String} expected
 * @return {string} the diff
 */
function errorDiff(actual, expected) {
  return diff
    .diffWordsWithSpace(actual, expected)
    .map(str => {
      if (str.added) {
        return colorLines('diff added inline', str.value);
      }
      if (str.removed) {
        return colorLines('diff removed inline', str.value);
      }
      return str.value;
    })
    .join('');
}

/**
 * Colors lines for `str`, using the color `name`.
 *
 * @private
 * @param {string} name
 * @param {string} str
 * @return {string}
 */
function colorLines(name, str) {
  return str
    .split('\n')
    .map(function (str) {
      return color(name, str);
    })
    .join('\n');
}

/**
 * Object#toString reference.
 */
const objToString = Object.prototype.toString;

/**
 * Checks that a / b have the same type.
 *
 * @private
 * @param {Object} a
 * @param {Object} b
 * @return {boolean}
 */
function sameType(a, b) {
  return objToString.call(a) === objToString.call(b);
}

Base.consoleLog = consoleLog;

Base.abstract = true;

/**
 * An object with all stack traces recursively mounted from each err.cause
 * @memberof module:lib/reporters/base
 * @typedef {Object} FullErrorStack
 * @property {string} message
 * @property {string} msg
 * @property {string} stack
 */
