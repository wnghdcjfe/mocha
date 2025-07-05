'use strict';
/**
 * @module List
 */
/**
 * Module dependencies.
 */

import Base from './base.js';
import {inherits} from '../utils.js';
import {constants} from '../runner.js';
const {
  EVENT_RUN_BEGIN,
  EVENT_RUN_END,
  EVENT_TEST_BEGIN,
  EVENT_TEST_FAIL,
  EVENT_TEST_PASS,
  EVENT_TEST_PENDING
} = constants;
const color = Base.color;
const cursor = Base.cursor;
/**
 * Expose `List`.
 */

export default List;

/**
 * Constructs a new `List` reporter instance.
 *
 * @public
 * @class
 * @memberof Mocha.reporters
 * @extends Mocha.reporters.Base
 * @param {Runner} runner - Instance triggers reporter actions.
 * @param {Object} [options] - runner options
 */
function List(runner, options) {
  Base.call(this, runner, options);

  const self = this;
  let n = 0;

  runner.on(EVENT_RUN_BEGIN, function () {
    Base.consoleLog();
  });

  runner.on(EVENT_TEST_BEGIN, function (test) {
    process.stdout.write(color('pass', '    ' + test.fullTitle() + ': '));
  });

  runner.on(EVENT_TEST_PENDING, function (test) {
    const fmt = color('checkmark', '  -') + color('pending', ' %s');
    Base.consoleLog(fmt, test.fullTitle());
  });

  runner.on(EVENT_TEST_PASS, function (test) {
    const fmt =
      color('checkmark', '  ' + Base.symbols.ok) +
      color('pass', ' %s: ') +
      color(test.speed, '%dms');
    cursor.CR();
    Base.consoleLog(fmt, test.fullTitle(), test.duration);
  });

  runner.on(EVENT_TEST_FAIL, function (test) {
    cursor.CR();
    Base.consoleLog(color('fail', '  %d) %s'), ++n, test.fullTitle());
  });

  runner.once(EVENT_RUN_END, self.epilogue.bind(self));
}

/**
 * Inherit from `Base.prototype`.
 */
inherits(List, Base);

List.description = 'like "spec" reporter but flat';
