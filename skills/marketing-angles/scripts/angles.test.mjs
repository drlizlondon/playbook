// node --test scripts/angles.test.mjs
//
// Each test names the acceptance criterion it pins.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {compile, evidenceStrength, renderReport, validate} from './angles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const NOW = '2026-08-12';

const loadExample = () =>
  JSON.parse(readFileSync(join(PACKAGE_ROOT, 'examples', 'worked-example.run.json'), 'utf8'));

const errorsFor = (mutate) => {
  const run = loadExample();
  mutate(run);
  return validate(run, NOW).errors;
};

test('AC1: the worked example compiles to 3-5 ranked angles, each with at least three hooks', () => {
  const compiled = compile(loadExample(), {now: NOW});
  assert.equal(compiled.ok, true, compiled.errors?.join('\n'));
  assert.ok(compiled.testFirst.length >= 3 && compiled.testFirst.length <= 5);
  for (const angle of compiled.testFirst) {
    assert.ok(angle.hooks.length >= 3, `${angle.id} has fewer than three hooks`);
    assert.ok(angle.score >= 65);
    assert.ok(angle.rankingRationale.length >= 20);
  }
  const scores = compiled.testFirst.map((angle) => angle.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'angles are not ranked');
});

test('AC2: a theme carrying a ranked angle must have a counter-signal', () => {
  const errors = errorsFor((run) => {
    run.themes.find((theme) => theme.id === 'th-swap').counterSignal = '';
  });
  assert.ok(errors.some((error) => error.includes('counterSignal')), errors.join('\n'));
});

test('AC3: a signal without url, accessedAt or evidenceClass does not compile', () => {
  for (const field of ['url', 'accessedAt', 'evidenceClass']) {
    const errors = errorsFor((run) => {
      delete run.signals[0][field];
    });
    assert.ok(errors.some((error) => error.includes(field)), `${field}: ${errors.join('\n')}`);
  }
});

test('AC4: a demand-evidence angle needs quantitative or internal evidence under it', () => {
  const errors = errorsFor((run) => {
    // Point the demand angle at a theme built only from forum language.
    run.angles.find((angle) => angle.id === 'a2').themeIds = ['th-adoption'];
  });
  assert.ok(
    errors.some((error) => error.includes('repetition is not prevalence')),
    errors.join('\n'),
  );
});

test('AC4b: the same angle compiles once a quantitative signal is under it', () => {
  const run = loadExample();
  run.angles.find((angle) => angle.id === 'a2').themeIds = ['th-demand'];
  assert.deepEqual(validate(run, NOW).errors, []);
});

test('AC5: an angle referencing an unknown theme does not compile', () => {
  const errors = errorsFor((run) => {
    run.angles[0].themeIds = ['th-does-not-exist'];
  });
  assert.ok(errors.some((error) => error.includes('unknown theme id')), errors.join('\n'));
});

test('AC6: volume never raises evidence strength — only breadth does', () => {
  const thin = {distinctSources: 3, distinctCommunities: 2, distinctSourceTypes: 1};
  const loud = {distinctSources: 3, distinctCommunities: 2, distinctSourceTypes: 1};
  assert.equal(evidenceStrength(thin), evidenceStrength(loud));

  // Same distinct sources, ten times the signals: identical strength.
  const run = loadExample();
  const theme = run.themes.find((item) => item.id === 'th-adoption');
  const before = compile(run, {now: NOW});
  const beforeStrength = before.testFirst
    .concat(before.emerging, before.archived)
    .find((angle) => angle.id === 'a3').evidenceStrength;

  const extra = [];
  for (let index = 0; index < 10; index += 1) {
    extra.push({
      ...run.signals.find((signal) => signal.id === 's8'),
      id: `s8-copy-${index}`,
      authorRef: `b${index}`,
      threadRef: `u${index}`,
    });
  }
  run.signals.push(...extra);
  theme.signalIds.push(...extra.map((signal) => signal.id));

  const after = compile(run, {now: NOW});
  const afterAngle = after.testFirst.concat(after.emerging, after.archived).find((angle) => angle.id === 'a3');
  assert.equal(afterAngle.evidenceStrength, beforeStrength, 'adding volume changed evidence strength');
  assert.equal(afterAngle.metrics[0].metrics.signalCount, 12);
  assert.equal(afterAngle.metrics[0].metrics.distinctSources, 2);
});

test('AC7: the report header prints sample size and date range', () => {
  const report = renderReport(compile(loadExample(), {now: NOW}));
  assert.match(report, /\*\*Evidence base:\*\* 10 signals · 10 distinct sources · 8 communities/);
  assert.match(report, /\*\*Published:\*\* 2026-03-05 → 2026-08-01 \(median age \d+ days\)/);
  assert.match(report, /Evidence classes:.*quantitative-demand/);
});

test('AC8: the package carries no product-, person- or repo-specific strings', () => {
  const banned = [/dr\s*liz/i, /\blondon\b/i, /remotion/i, /\bpnpm\b/i, /mission control/i, /founder-visibility/i];
  const walk = (directory) =>
    readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  const selfPath = fileURLToPath(import.meta.url);
  for (const path of walk(PACKAGE_ROOT)) {
    if (path === selfPath) continue; // this file necessarily contains the banned list
    const contents = readFileSync(path, 'utf8');
    for (const pattern of banned) {
      assert.ok(!pattern.test(contents), `${path} contains ${pattern}`);
    }
  }
});

test('AC9: the compiler imports nothing outside the Node standard library', () => {
  const source = readFileSync(join(HERE, 'angles.mjs'), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('node:'), `non-builtin import: ${specifier}`);
  }
});

test('identities and verbatim text are rejected at any depth', () => {
  assert.ok(
    errorsFor((run) => {
      run.signals[0].author = 'someone';
    }).some((error) => error.includes('forbidden key')),
  );
  assert.ok(
    errorsFor((run) => {
      run.themes[0].notes = {quotes: ['anything']};
    }).some((error) => error.includes('forbidden key')),
  );
  assert.ok(
    errorsFor((run) => {
      run.signals[0].paraphrase = '"This is a straight copy of what somebody actually posted online."';
    }).some((error) => error.includes('verbatim quote')),
  );
});

test('an alias that looks like a real handle is rejected', () => {
  const errors = errorsFor((run) => {
    run.signals[0].authorRef = 'u/real_person';
  });
  assert.ok(errors.some((error) => error.includes('opaque alias')), errors.join('\n'));
});

test('hook counts are bounded at both ends', () => {
  assert.ok(
    errorsFor((run) => {
      run.angles[0].hooks = run.angles[0].hooks.slice(0, 2);
    }).some((error) => error.includes('between 3 and 6 hooks')),
  );
});

test('a ranking rationale is mandatory', () => {
  assert.ok(
    errorsFor((run) => {
      run.angles[0].rankingRationale = 'because';
    }).some((error) => error.includes('rankingRationale')),
  );
});

test('a thin single-source angle is penalised and carries an uncertainty note', () => {
  const compiled = compile(loadExample(), {now: NOW});
  const thin = compiled.archived.find((angle) => angle.id === 'a6');
  assert.ok(thin, 'expected the single-source angle to be archived');
  assert.equal(thin.confidence, 'hypothesis');
  assert.match(thin.uncertainty, /synthesis/);
});

test('freshness decays the evidence component but never zeroes it', () => {
  const run = loadExample();
  for (const signal of run.signals) signal.publishedDate = '2023-01-01';
  const compiled = compile(run, {now: NOW});
  const top = compiled.testFirst[0] ?? compiled.emerging[0] ?? compiled.archived[0];
  assert.ok(top.score > 0);
  assert.equal(top.freshness, 0.5);
});

test('the report never claims more test-first angles than cleared the bar', () => {
  const run = loadExample();
  for (const angle of run.angles) angle.judgement.strategicFit = 0;
  const compiled = compile(run, {now: NOW});
  const report = renderReport(compiled);
  if (compiled.testFirst.length < 3) {
    assert.match(report, /deliberately not\s+promoted|None cleared the threshold/);
  }
});

test('dates in the future are rejected', () => {
  assert.ok(
    errorsFor((run) => {
      run.signals[0].accessedAt = '2099-01-01';
    }).some((error) => error.includes('future')),
  );
});
