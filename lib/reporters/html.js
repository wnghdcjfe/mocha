'use strict';

/* eslint-env browser */
/**
 * @module HTML
 */
/**
 * Module dependencies.
 */

import Base from './base.js';
import * as utils from '../utils.js';
import escapeRe from 'escape-string-regexp';
import {constants} from '../runner.js';
const {
  EVENT_TEST_PASS,
  EVENT_TEST_FAIL,
  EVENT_SUITE_BEGIN,
  EVENT_SUITE_END,
  EVENT_TEST_PENDING
} = constants;
const escape = utils.escape;

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */

const Date = globalThis.Date;

/**
 * Expose `HTML`.
 */

export default HTML;

/**
 * Stats template: Result, progress, passes, failures, and duration.
 */

const statsTemplate =
  '<ul id="mocha-stats">' +
  '<li class="result"></li>' +
  '<li class="progress-contain"><progress class="progress-element" max="100" value="0"></progress><svg class="progress-ring"><circle class="ring-flatlight" stroke-dasharray="100%,0%"/><circle class="ring-highlight" stroke-dasharray="0%,100%"/></svg><div class="progress-text">0%</div></li>' +
  '<li class="passes"><a href="javascript:void(0);">passes:</a> <em>0</em></li>' +
  '<li class="failures"><a href="javascript:void(0);">failures:</a> <em>0</em></li>' +
  '<li class="duration">duration: <em>0</em>s</li>' +
  '</ul>';

const playIcon = '&#x2023;';

/**
 * Constructs a new `HTML` reporter instance.
 *
 * @public
 * @class
 * @memberof Mocha.reporters
 * @extends Mocha.reporters.Base
 * @param {Runner} runner - Instance triggers reporter actions.
 * @param {Object} [options] - runner options
 */
function HTML(runner, options) {
  Base.call(this, runner, options);

  const self = this;
  const stats = this.stats;
  const stat = fragment(statsTemplate);
  const items = stat.getElementsByTagName('li');
  const resultIndex = 0;
  const progressIndex = 1;
  const passesIndex = 2;
  const failuresIndex = 3;
  const durationIndex = 4;
  /** Stat item containing the root suite pass or fail indicator (hasFailures ? '✖' : '✓') */
  const resultIndicator = items[resultIndex];
  /** Passes text and count */
  const passesStat = items[passesIndex];
  /** Stat item containing the pass count (not the word, just the number) */
  const passesCount = passesStat.getElementsByTagName('em')[0];
  /** Stat item linking to filter to show only passing tests */
  const passesLink = passesStat.getElementsByTagName('a')[0];
  /** Failures text and count */
  const failuresStat = items[failuresIndex];
  /** Stat item containing the failure count (not the word, just the number) */
  const failuresCount = failuresStat.getElementsByTagName('em')[0];
  /** Stat item linking to filter to show only failing tests */
  const failuresLink = failuresStat.getElementsByTagName('a')[0];
  /** Stat item linking to the duration time (not the word or unit, just the number) */
  const duration = items[durationIndex].getElementsByTagName('em')[0];
  const report = fragment('<ul id="mocha-report"></ul>');
  const stack = [report];
  const progressText = items[progressIndex].getElementsByTagName('div')[0];
  const progressBar = items[progressIndex].getElementsByTagName('progress')[0];
  const progressRing = [
    items[progressIndex].getElementsByClassName('ring-flatlight')[0],
    items[progressIndex].getElementsByClassName('ring-highlight')[0]
  ];
  let progressRingRadius = null; // computed CSS unavailable now, so set later
  const root = document.getElementById('mocha');

  if (!root) {
    return error('#mocha div missing, add it to your document');
  }

  // pass toggle
  on(passesLink, 'click', function (evt) {
    evt.preventDefault();
    unhide();
    const name = /pass/.test(report.className) ? '' : ' pass';
    report.className = report.className.replace(/fail|pass/g, '') + name;
    if (report.className.trim()) {
      hideSuitesWithout('test pass');
    }
  });

  // failure toggle
  on(failuresLink, 'click', function (evt) {
    evt.preventDefault();
    unhide();
    const name = /fail/.test(report.className) ? '' : ' fail';
    report.className = report.className.replace(/fail|pass/g, '') + name;
    if (report.className.trim()) {
      hideSuitesWithout('test fail');
    }
  });

  root.appendChild(stat);
  root.appendChild(report);

  runner.on(EVENT_SUITE_BEGIN, function (suite) {
    if (suite.root) {
      return;
    }

    // suite
    const url = self.suiteURL(suite);
    const el = fragment(
      '<li class="suite"><h1><a href="%s">%s</a></h1></li>',
      url,
      escape(suite.title)
    );

    // container
    stack[0].appendChild(el);
    stack.unshift(document.createElement('ul'));
    el.appendChild(stack[0]);
  });

  runner.on(EVENT_SUITE_END, function (suite) {
    if (suite.root) {
      if (stats.failures === 0) {
        text(resultIndicator, '✓');
        stat.className += ' pass';
      }
      updateStats();
      return;
    }
    stack.shift();
  });

  runner.on(EVENT_TEST_PASS, function (test) {
    const url = self.testURL(test);
    const markup =
      '<li class="test pass %e"><h2>%e<span class="duration">%ems</span> ' +
      '<a href="%s" class="replay">' +
      playIcon +
      '</a></h2></li>';
    const el = fragment(markup, test.speed, test.title, test.duration, url);
    self.addCodeToggle(el, test.body);
    appendToStack(el);
    updateStats();
  });

  runner.on(EVENT_TEST_FAIL, function (test) {
    text(resultIndicator, '✖');
    stat.className += ' fail';

    const el = fragment(
      '<li class="test fail"><h2>%e <a href="%e" class="replay">' +
        playIcon +
        '</a></h2></li>',
      test.title,
      self.testURL(test)
    );
    let stackString; // Note: Includes leading newline
    let message = test.err.toString();
    // <=IE7 stringifies to [Object Error]. Since it can be overloaded, we
    // check for the result of the stringifying.
    if (message === '[object Error]') {
      message = test.err.message;
    }

    if (test.err.stack) {
      const indexOfMessage = test.err.stack.indexOf(test.err.message);
      if (indexOfMessage === -1) {
        stackString = test.err.stack;
      } else {
        stackString = test.err.stack.slice(
          test.err.message.length + indexOfMessage
        );
      }
    } else if (test.err.sourceURL && test.err.line !== undefined) {
      stackString = '\n(' + test.err.sourceURL + ':' + test.err.line + ')';
    }

    stackString = stackString || '';

    if (test.err.htmlMessage && stackString) {
      el.appendChild(
        fragment(
          '<div class="html-error">%s\n<pre class="error">%e</pre></div>',
          test.err.htmlMessage,
          stackString
        )
      );
    } else if (test.err.htmlMessage) {
      el.appendChild(
        fragment('<div class="html-error">%s</div>', test.err.htmlMessage)
      );
    } else {
      el.appendChild(
        fragment('<pre class="error">%e%e</pre>', message, stackString)
      );
    }

    self.addCodeToggle(el, test.body);
    appendToStack(el);
    updateStats();
  });

  runner.on(EVENT_TEST_PENDING, function (test) {
    const el = fragment(
      '<li class="test pass pending"><h2>%e</h2></li>',
      test.title
    );
    appendToStack(el);
    updateStats();
  });

  function appendToStack(el) {
    // Don't call .appendChild if #mocha-report was already .shift()'ed off the stack.
    if (stack[0]) {
      stack[0].appendChild(el);
    }
  }

  function updateStats() {
    const percent = ((stats.tests / runner.total) * 100) | 0;
    progressBar.value = percent;
    if (progressText) {
      // setting a toFixed that is too low, makes small changes to progress not shown
      // setting it too high, makes the progress text longer then it needs to
      // to address this, calculate the toFixed based on the magnitude of total
      const decimalPlaces = Math.ceil(Math.log10(runner.total / 100));
      text(
        progressText,
        percent.toFixed(Math.min(Math.max(decimalPlaces, 0), 100)) + '%'
      );
    }
    if (progressRing) {
      const radius = parseFloat(
        getComputedStyle(progressRing[0]).getPropertyValue('r')
      );
      const wholeArc = Math.PI * 2 * radius;
      const highlightArc = percent * (wholeArc / 100);
      // The progress ring is in 2 parts, the flatlight color and highlight color.
      // Rendering both on top of the other, seems to make a 3rd color on the edges.
      // To create 1 whole ring with 2 colors, both parts are inverse of the other.
      progressRing[0].style[
        'stroke-dasharray'
      ] = `0,${highlightArc}px,${wholeArc}px`;
      progressRing[1].style[
        'stroke-dasharray'
      ] = `${highlightArc}px,${wholeArc}px`;
    }
    // update stats
    const ms = new Date() - stats.start;
    text(passesCount, stats.passes);
    text(failuresCount, stats.failures);
    text(duration, (ms / 1000).toFixed(2));
  }
}

/**
 * Makes a URL, preserving querystring ("search") parameters.
 *
 * @param {string} s
 * @return {string} A new URL.
 */
function makeUrl(s) {
  let search = window.location.search;
  // Remove previous {grep, fgrep, invert} query parameters if present
  if (search) {
    search = search
      .replace(/[?&](?:f?grep|invert)=[^&\s]*/g, '')
      .replace(/^&/, '?');
  }
  return (
    window.location.pathname +
    (search ? search + '&' : '?') +
    'grep=' +
    encodeURIComponent(s)
  );
}

/**
 * Provide suite URL.
 *
 * @param {Object} [suite]
 */
HTML.prototype.suiteURL = function (suite) {
  return makeUrl('^' + escapeRe(suite.fullTitle()) + ' ');
};

/**
 * Provide test URL.
 *
 * @param {Object} [test]
 */
HTML.prototype.testURL = function (test) {
  return makeUrl('^' + escapeRe(test.fullTitle()) + '$');
};

/**
 * Adds code toggle functionality for the provided test's list element.
 *
 * @param {HTMLLIElement} el
 * @param {string} contents
 */
HTML.prototype.addCodeToggle = function (el, contents) {
  const h2 = el.getElementsByTagName('h2')[0];

  on(h2, 'click', function () {
    pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
  });

  const pre = fragment('<pre><code>%e</code></pre>', utils.clean(contents));
  el.appendChild(pre);
  pre.style.display = 'none';
};

/**
 * Display error `msg`.
 *
 * @param {string} msg
 */ function error(msg) {
  document.body.appendChild(fragment('<div id="mocha-error">%s</div>', msg));
}

/**
 * Return a DOM fragment from `html`.
 *
 * @param {string} html
 */
function fragment(html) {
  const args = arguments;
  const div = document.createElement('div');
  let i = 1;

  div.innerHTML = html.replace(/%([se])/g, function (_, type) {
    switch (type) {
      case 's':
        return String(args[i++]);
      case 'e':
        return escape(args[i++]);
      // no default
    }
  });

  return div.firstChild;
}
/**
 * Check for suites that do not have elements
 * with `classname`, and hide them.
 *
 * @param {text} classname
 */
function hideSuitesWithout(classname) {
  const suites = document.getElementsByClassName('suite');
  for (let i = 0; i < suites.length; i++) {
    const els = suites[i].getElementsByClassName(classname);
    if (!els.length) {
      suites[i].className += ' hidden';
    }
  }
}

/**
 * Unhide .hidden suites.
 */
function unhide() {
  const els = document.getElementsByClassName('suite hidden');
  while (els.length > 0) {
    els[0].className = els[0].className.replace('suite hidden', 'suite');
  }
}

/**
 * Set an element's text contents.
 *
 * @param {HTMLElement} el
 * @param {string} contents
 */
function text(el, contents) {
  if (el.textContent) {
    el.textContent = contents;
  } else {
    el.innerText = contents;
  }
}

/**
 * Listen on `event` with callback `fn`.
 */
function on(el, event, fn) {
  if (el.addEventListener) {
    el.addEventListener(event, fn, false);
  } else {
    el.attachEvent('on' + event, fn);
  }
}

HTML.browserOnly = true;
