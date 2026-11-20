(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Scroll reveal */

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* Hero matrix: a grid of "tests" that go green in a sweep */

  const matrix = document.querySelector('.matrix');
  if (matrix) {
    const cellCount = 48;
    const flakyCells = new Set([11, 29, 38]);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < cellCount; i += 1) {
      const cell = document.createElement('i');
      cell.style.setProperty('--d', `${(i * 0.09).toFixed(2)}s`);
      if (flakyCells.has(i)) {
        cell.className = 'is-flaky';
      }
      fragment.appendChild(cell);
    }
    matrix.appendChild(fragment);
  }

  /* Test runner demo. Everything here is illustrative. */

  const list = document.getElementById('runner-list');
  if (!list) {
    return;
  }

  const TESTS = [
    { name: 'VerifyLoginWithValidCredentialsSucceeds', ms: 420 },
    { name: 'VerifyLoginWithWrongPasswordShowsError', ms: 380 },
    { name: 'VerifySamlProviderRedirectsToIdentityProvider', ms: 640 },
    { name: 'VerifyOAuth2ClientSecretCanBeRotated', ms: 560 },
    { name: 'VerifyTwoFactorCodeIsRequiredAtSignIn', ms: 610 },
    { name: 'VerifyRestrictedTabIsHiddenWithoutPermission', ms: 450 },
    { name: 'VerifyCsrfTokenHeaderIsPresent', ms: 300 },
    { name: 'VerifySessionEndsAfterLogout', ms: 340 }
  ];
  const FLAKY_INDEX = 2;
  const DEFECT_INDEX = 5;
  const DEFECT_ATTEMPTS = 3;
  const DEFECT_MESSAGE = 'Expected the restricted tab to be hidden, but it was visible.';
  const STATUS_TEXT = {
    queued: 'queued',
    running: 'running',
    retry: 'failed, retrying',
    passed: 'passed',
    failed: 'failed'
  };

  const runner = document.getElementById('runner');
  const stateEl = document.getElementById('runner-state');
  const summaryEl = document.getElementById('runner-summary');
  const runNumberEl = document.getElementById('run-number');
  const btnRun = document.getElementById('btn-run');
  const btnFlaky = document.getElementById('btn-flaky');
  const btnDefect = document.getElementById('btn-defect');
  const btnReset = document.getElementById('btn-reset');
  const out = {
    passed: document.getElementById('out-passed'),
    failed: document.getElementById('out-failed'),
    retries: document.getElementById('out-retries'),
    duration: document.getElementById('out-duration')
  };

  let rows = [];
  let runToken = 0;
  let runNumber = 0;

  const wait = (ms) => new Promise((resolve) => {
    window.setTimeout(resolve, reduceMotion ? 20 : ms);
  });
  const formatSeconds = (ms) => `${(ms / 100).toFixed(1)} s`;
  const isPressed = (button) => button.getAttribute('aria-pressed') === 'true';

  function buildRows() {
    list.textContent = '';
    rows = TESTS.map((test) => {
      const row = document.createElement('li');
      row.className = 'row is-queued';

      const icon = document.createElement('span');
      icon.className = 'row-icon';
      icon.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'row-name';
      name.textContent = test.name;

      const note = document.createElement('span');
      note.className = 'row-note';

      const time = document.createElement('span');
      time.className = 'row-time';
      time.textContent = '–';

      const status = document.createElement('span');
      status.className = 'row-status visually-hidden';
      status.textContent = STATUS_TEXT.queued;

      row.append(icon, name, note, time, status);
      list.appendChild(row);
      return row;
    });
  }

  function setRow(row, state, options = {}) {
    row.className = `row is-${state}${options.retried ? ' was-retried' : ''}`;
    row.querySelector('.row-status').textContent = STATUS_TEXT[state];
    row.querySelector('.row-note').textContent = options.note || '';
    if (options.time) {
      row.querySelector('.row-time').textContent = options.time;
    }
    let message = row.querySelector('.row-msg');
    if (options.message) {
      if (!message) {
        message = document.createElement('span');
        message.className = 'row-msg';
        row.appendChild(message);
      }
      message.textContent = options.message;
    } else if (message) {
      message.remove();
    }
  }

  function setState(state) {
    stateEl.dataset.state = state;
    stateEl.textContent = state;
  }

  function setCounters(counters) {
    out.passed.textContent = counters.passed;
    out.failed.textContent = counters.failed;
    out.retries.textContent = counters.retries;
    out.duration.textContent = formatSeconds(counters.ms);
  }

  function describe(counters, flaky) {
    const total = TESTS.length;
    if (counters.failed === 0 && counters.retries === 0) {
      return `${counters.passed} of ${total} passed on the first attempt. Green means green.`;
    }
    if (counters.failed === 0) {
      return `${counters.passed} of ${total} passed, one of them only on retry. The run is green, but that retry is a bug in the test: fix the wait instead of leaning on the rerun.`;
    }
    if (flaky) {
      return `${counters.passed} of ${total} passed, one of them only on retry, and 1 failed on every attempt. Two different problems: fix the flaky test, and raise the defect with the evidence.`;
    }
    return `${counters.passed} of ${total} passed and 1 failed on every attempt. That is a product defect: raise it with the evidence instead of rerunning until it goes away.`;
  }

  async function run() {
    runToken += 1;
    const token = runToken;
    const flaky = isPressed(btnFlaky);
    const defect = isPressed(btnDefect);
    const counters = { passed: 0, failed: 0, retries: 0, ms: 0 };

    runNumber += 1;
    runNumberEl.textContent = runNumber;
    buildRows();
    setCounters(counters);
    setState('running');
    summaryEl.textContent = `Running ${TESTS.length} tests…`;
    btnRun.disabled = true;
    btnRun.textContent = 'Running…';

    for (let i = 0; i < TESTS.length; i += 1) {
      const test = TESTS[i];
      const row = rows[i];
      const isFlaky = flaky && i === FLAKY_INDEX;
      const isDefect = defect && i === DEFECT_INDEX;
      const attempts = isDefect ? DEFECT_ATTEMPTS : isFlaky ? 2 : 1;
      let passed = false;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        setRow(row, 'running', { note: attempt > 1 ? `attempt ${attempt}` : '', time: '…' });
        await wait(test.ms);
        if (token !== runToken) {
          return;
        }
        counters.ms += test.ms;
        setCounters(counters);

        const failsNow = isDefect || (isFlaky && attempt === 1);
        if (!failsNow) {
          passed = true;
          break;
        }
        if (attempt < attempts) {
          counters.retries += 1;
          setCounters(counters);
          setRow(row, 'retry', {
            note: isFlaky ? `attempt ${attempt} timed out, retrying` : `attempt ${attempt} failed, retrying`,
            time: formatSeconds(test.ms)
          });
          await wait(520);
          if (token !== runToken) {
            return;
          }
        }
      }

      if (passed) {
        counters.passed += 1;
        setRow(row, 'passed', {
          note: isFlaky ? 'passed on retry' : '',
          time: formatSeconds(test.ms),
          retried: isFlaky
        });
      } else {
        counters.failed += 1;
        setRow(row, 'failed', {
          note: `failed ${DEFECT_ATTEMPTS} of ${DEFECT_ATTEMPTS}`,
          time: formatSeconds(test.ms),
          message: DEFECT_MESSAGE
        });
      }
      setCounters(counters);
    }

    setState(counters.failed > 0 ? 'failed' : 'passed');
    summaryEl.textContent = describe(counters, flaky);
    btnRun.disabled = false;
    btnRun.textContent = 'Run again';
  }

  function reset() {
    runToken += 1;
    btnFlaky.setAttribute('aria-pressed', 'false');
    btnDefect.setAttribute('aria-pressed', 'false');
    buildRows();
    setCounters({ passed: 0, failed: 0, retries: 0, ms: 0 });
    setState('idle');
    summaryEl.textContent = 'Press “Run suite” to start.';
    btnRun.disabled = false;
    btnRun.textContent = 'Run suite';
  }

  function toggle(button) {
    button.setAttribute('aria-pressed', String(!isPressed(button)));
    run();
  }

  btnRun.addEventListener('click', run);
  btnReset.addEventListener('click', reset);
  btnFlaky.addEventListener('click', () => toggle(btnFlaky));
  btnDefect.addEventListener('click', () => toggle(btnDefect));

  buildRows();

  if ('IntersectionObserver' in window && !reduceMotion) {
    const demoObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        demoObserver.disconnect();
        if (runToken === 0) {
          run();
        }
      }
    }, { threshold: 0.4 });
    demoObserver.observe(runner);
  }
})();
