'use strict';
/**
 * @module JSON
 */
/**
 * Module dependencies.
 */

import Base from './base.js';
import fs from 'node:fs';
import path from 'node:path';
import {createUnsupportedError} from '../errors.js';
import * as utils from '../utils.js';
import {constants} from '../runner.js';
const {
  EVENT_TEST_PASS,
  EVENT_TEST_PENDING,
  EVENT_TEST_FAIL,
  EVENT_TEST_END,
  EVENT_RUN_END
} = constants;

/**
 * Expose `JSON`.
 */

export default JSONReporter;

/**
 * Constructs a new `JSON` reporter instance.
 *
 * @public
 * @class JSON
 * @memberof Mocha.reporters
 * @extends Mocha.reporters.Base
 * @param {Runner} runner - Instance triggers reporter actions.
 * @param {Object} [options] - runner options
 */
function JSONReporter(runner, options = {}) {
  Base.call(this, runner, options);

  const self = this;
  const tests = [];
  const pending = [];
  const failures = [];
  const passes = [];
  let output;

  if (options.reporterOption && options.reporterOption.output) {
    if (utils.isBrowser()) {
      throw createUnsupportedError('file output not supported in browser');
    }
    output = options.reporterOption.output;
  }

  runner.on(EVENT_TEST_END, function (test) {
    tests.push(test);
  });

  runner.on(EVENT_TEST_PASS, function (test) {
    passes.push(test);
  });

  runner.on(EVENT_TEST_FAIL, function (test) {
    failures.push(test);
  });

  runner.on(EVENT_TEST_PENDING, function (test) {
    pending.push(test);
  });

  runner.once(EVENT_RUN_END, function () {
    const obj = {
      stats: self.stats,
      tests: tests.map(clean),
      pending: pending.map(clean),
      failures: failures.map(clean),
      passes: passes.map(clean)
    };

    runner.testResults = obj;

    const json = JSON.stringify(obj, null, 2);
    if (output) {
      try {
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, json);
      } catch (err) {
        console.error(
          `${Base.symbols.err} [mocha] writing output to "${output}" failed: ${err.message}\n`
        );
        process.stdout.write(json);
      }
    } else {
      process.stdout.write(json);
    }
  });
}

/**
 * Return a plain-object representation of `test`
 * free of cyclic properties etc.
 *
 * @private
 * @param {Object} test
 * @return {Object}
 */
function clean(test) {
  let err = test.err || {};
  if (err instanceof Error) {
    err = errorJSON(err);
  }

  return {
    title: test.title,
    fullTitle: test.fullTitle(),
    file: test.file,
    duration: test.duration,
    currentRetry: test.currentRetry(),
    speed: test.speed,
    err: cleanCycles(err)
  };
}

/**
 * Replaces any circular references inside `obj` with '[object Object]'
 *
 * @private
 * @param {Object} obj
 * @return {Object}
 */
function cleanCycles(obj) {
  const cache = [];
  return JSON.parse(
    JSON.stringify(obj, function (key, value) {
      if (typeof value === 'object' && value !== null) {
        if (cache.indexOf(value) !== -1) {
          // Instead of going in a circle, we'll print [object Object]
          return '' + value;
        }
        cache.push(value);
      }
      return value;
    })
  );
}

/**
 * Transform an Error object into a JSON object.
 *
 * @private
 * @param {Error} err
 * @return {Object}
 */
function errorJSON(err) {
  const res = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    res[key] = err[key];
  }, err);
  return res;
}

JSONReporter.description = 'single JSON object';
