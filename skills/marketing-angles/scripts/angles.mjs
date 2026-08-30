#!/usr/bin/env node
// marketing-angles compiler.
//
// Validates a run file, derives every count from the signals, scores and ranks
// the angles, and renders the report. It never touches the network: gathering
// evidence is the agent's job, and this script is the referee.
//
//   node angles.mjs run.json [--out report.md] [--json] [--now YYYY-MM-DD] [--quiet]
//
// Exit 0 on success, 1 on validation failure.

import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const SOURCE_TYPES = new Set([
  'forum',
  'review-site',
  'support-tickets',
  'sales-calls',
  'search-data',
  'social',
  'survey',
  'interview',
  'competitor-page',
  'other',
]);

export const EVIDENCE_CLASSES = new Set([
  'qualitative-language',
  'direct-request',
  'competitor-positioning',
  'quantitative-demand',
  'internal-data',
  'hypothesis',
]);

export const EVIDENCE_STATUSES = new Set(['not_checked', 'partial', 'verified']);
export const CLAIM_TYPES = new Set(['language-evidence', 'demand-evidence', 'hypothesis']);

// Only these classes can support a claim about how common something is.
const DEMAND_CLASSES = new Set(['quantitative-demand', 'internal-data']);
// Only these classes can support a claim about how people describe something.
const LANGUAGE_CLASSES = new Set(['qualitative-language', 'direct-request', 'internal-data']);

// Rejected at any depth: provenance must never become surveillance.
const FORBIDDEN_KEYS = new Set([
  'author',
  'username',
  'user',
  'handle',
  'body',
  'selftext',
  'rawtext',
  'rawpost',
  'comments',
  'commentbodies',
  'quote',
  'quotes',
]);

const JUDGEMENT_KEYS = ['strategicFit', 'differentiation', 'testability', 'overclaimRisk', 'brandRisk'];
const WEIGHTS = {evidence: 40, strategicFit: 25, differentiation: 20, testability: 15};
const RISK_WEIGHTS = {overclaimRisk: 20, brandRisk: 15, thinness: 15};
const TEST_FIRST_THRESHOLD = 65;
const EMERGING_THRESHOLD = 45;
const MAX_TEST_FIRST = 5;
const ALIAS_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isFilled = (value, min = 1) => typeof value === 'string' && value.trim().length >= min;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const unique = (values) => new Set(values.filter((value) => value !== undefined && value !== null && value !== ''));
const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

export const collectForbiddenKeys = (value, path = 'run', found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, `${path}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) found.push(childPath);
    collectForbiddenKeys(child, childPath, found);
  }
  return found;
};

export const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

// Breadth, never volume. signalCount is deliberately not an input here.
export const evidenceStrength = ({distinctSources, distinctCommunities, distinctSourceTypes}) => {
  const diversity = Math.max(distinctCommunities, distinctSourceTypes);
  if (distinctSources >= 5 && diversity >= 3) return 5;
  if (distinctSources >= 3 && diversity >= 2) return 4;
  if (distinctSources >= 2 && diversity >= 2) return 3;
  if (distinctSources >= 2) return 2;
  if (distinctSources === 1) return 1;
  return 0;
};

export const freshnessFactor = (medianAgeDays) => {
  if (medianAgeDays === null) return 0.7;
  if (medianAgeDays <= 90) return 1;
  if (medianAgeDays <= 180) return 0.85;
  if (medianAgeDays <= 365) return 0.7;
  return 0.5;
};

export const themeMetrics = (theme, signalsById, now) => {
  const signals = theme.signalIds.map((id) => signalsById.get(id)).filter(Boolean);
  const dates = signals.map((signal) => signal.publishedDate).filter(isIsoDate).sort();
  const ages = dates.map((date) => dayNumber(now) - dayNumber(date));
  const medianAgeDays = median(ages);

  const counts = {
    signalCount: signals.length,
    distinctSources: unique(signals.map((signal) => signal.url)).size,
    distinctThreads: unique(signals.map((signal) => signal.threadRef ?? signal.url)).size,
    distinctAuthors: unique(signals.map((signal) => signal.authorRef)).size,
    distinctCommunities: unique(signals.map((signal) => signal.community)).size,
    distinctSourceTypes: unique(signals.map((signal) => signal.sourceType)).size,
  };

  return {
    ...counts,
    publishedFrom: dates[0] ?? null,
    publishedTo: dates.at(-1) ?? null,
    medianAgeDays,
    evidenceClasses: [...unique(signals.map((signal) => signal.evidenceClass))].sort(),
    strength: evidenceStrength(counts),
    freshness: freshnessFactor(medianAgeDays),
  };
};

export const confidenceLabel = (claimType, strength, evidenceStatus) => {
  if (claimType === 'hypothesis' || strength === 0) return 'hypothesis';
  if (strength >= 4 && (evidenceStatus === 'verified' || evidenceStatus === 'partial')) return 'strong';
  if (strength >= 3) return 'moderate';
  if (strength === 2) return 'thin';
  return 'single-source';
};

const uncertaintyNote = (label, metrics) => {
  if (label === 'hypothesis') {
    return 'This is our synthesis rather than something the audience said. It carries no direct evidence and should be treated as a guess worth testing cheaply.';
  }
  if (label === 'single-source') {
    return `Single source (${metrics.distinctSources} distinct source, ${metrics.distinctCommunities} community). This is one observation, not a pattern.`;
  }
  if (label === 'thin') {
    return `Evidence is thin: ${metrics.distinctSources} distinct sources across ${metrics.distinctCommunities} communities. Treat as a hypothesis to test, not a finding.`;
  }
  return null;
};

export const scoreAngle = (angle, themeMetricsById) => {
  const metrics = angle.themeIds.map((id) => themeMetricsById.get(id)).filter(Boolean);
  const primary = [...metrics].sort((a, b) => b.strength - a.strength || b.freshness - a.freshness)[0];
  const maxStrength = primary ? primary.strength : 0;
  const freshness = primary ? primary.freshness : 0.5;

  const positive =
    (maxStrength / 5) * WEIGHTS.evidence * freshness +
    (angle.judgement.strategicFit / 5) * WEIGHTS.strategicFit +
    (angle.judgement.differentiation / 5) * WEIGHTS.differentiation +
    (angle.judgement.testability / 5) * WEIGHTS.testability;

  const risk =
    (angle.judgement.overclaimRisk / 5) * RISK_WEIGHTS.overclaimRisk +
    (angle.judgement.brandRisk / 5) * RISK_WEIGHTS.brandRisk +
    (maxStrength <= 1 ? RISK_WEIGHTS.thinness : 0);

  return {
    score: Math.round(clamp(positive - risk, 0, 100)),
    positive: Math.round(positive),
    risk: Math.round(risk),
    evidenceStrength: maxStrength,
    freshness,
    primaryThemeId: primary ? primary.themeId : null,
  };
};

export const validate = (run, now) => {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);

  if (!run || typeof run !== 'object') return {errors: ['run: file does not contain a JSON object'], warnings};

  for (const path of collectForbiddenKeys(run)) {
    fail(`${path}: forbidden key — run files never store identities, post bodies or verbatim quotes`);
  }

  const signals = Array.isArray(run.signals) ? run.signals : [];
  const themes = Array.isArray(run.themes) ? run.themes : [];
  const angles = Array.isArray(run.angles) ? run.angles : [];

  if (signals.length === 0) fail('signals: a run needs at least one signal');
  if (themes.length === 0) fail('themes: a run needs at least one theme');
  if (angles.length === 0) fail('angles: a run needs at least one angle');

  const signalsById = new Map();
  signals.forEach((signal, index) => {
    const at = `signals[${index}]`;
    if (!isFilled(signal.id)) fail(`${at}.id: required`);
    else if (signalsById.has(signal.id)) fail(`${at}.id: duplicate id "${signal.id}"`);
    else signalsById.set(signal.id, signal);

    if (!SOURCE_TYPES.has(signal.sourceType)) {
      fail(`${at}.sourceType: must be one of ${[...SOURCE_TYPES].join(', ')}`);
    }
    if (!EVIDENCE_CLASSES.has(signal.evidenceClass)) {
      fail(`${at}.evidenceClass: must be one of ${[...EVIDENCE_CLASSES].join(', ')}`);
    }

    let url;
    try {
      url = new URL(signal.url);
    } catch {
      url = null;
    }
    if (!url || !/^https?:$/.test(url.protocol)) {
      fail(`${at}.url: required, and must be an absolute http(s) URL you actually opened`);
    }

    if (!isIsoDate(signal.accessedAt)) fail(`${at}.accessedAt: required, YYYY-MM-DD`);
    else if (dayNumber(signal.accessedAt) > dayNumber(now)) fail(`${at}.accessedAt: is in the future`);

    if (signal.publishedDate !== undefined && !isIsoDate(signal.publishedDate)) {
      fail(`${at}.publishedDate: must be YYYY-MM-DD when present`);
    } else if (isIsoDate(signal.publishedDate) && dayNumber(signal.publishedDate) > dayNumber(now)) {
      fail(`${at}.publishedDate: is in the future`);
    } else if (!isIsoDate(signal.publishedDate)) {
      warnings.push(`${at}.publishedDate: absent — this signal cannot contribute to freshness`);
    }

    if (!isFilled(signal.paraphrase, 20)) {
      fail(`${at}.paraphrase: required, at least 20 characters, in your own words`);
    } else if (/^["'“‘].*["'”’]$/s.test(signal.paraphrase.trim())) {
      fail(`${at}.paraphrase: looks like a verbatim quote — paraphrase it instead`);
    }

    for (const key of ['authorRef', 'threadRef']) {
      if (signal[key] === undefined) continue;
      if (!ALIAS_PATTERN.test(signal[key])) {
        fail(`${at}.${key}: must be a short opaque alias such as "a1" or "t3", never a real handle`);
      }
    }
    if (signal.authorRef === undefined) {
      warnings.push(`${at}.authorRef: absent — distinct-people counts will understate this theme`);
    }
    if (!isFilled(signal.community)) {
      warnings.push(`${at}.community: absent — this signal cannot contribute to source diversity`);
    }
  });

  const themesById = new Map();
  themes.forEach((theme, index) => {
    const at = `themes[${index}]`;
    if (!isFilled(theme.id)) fail(`${at}.id: required`);
    else if (themesById.has(theme.id)) fail(`${at}.id: duplicate id "${theme.id}"`);
    else themesById.set(theme.id, theme);

    if (!isFilled(theme.statement, 15)) fail(`${at}.statement: required, at least 15 characters`);
    if (!isFilled(theme.label)) fail(`${at}.label: required`);
    if (!EVIDENCE_STATUSES.has(theme.evidenceStatus)) {
      fail(`${at}.evidenceStatus: must be one of ${[...EVIDENCE_STATUSES].join(', ')}`);
    }
    if (!Array.isArray(theme.signalIds) || theme.signalIds.length === 0) {
      fail(`${at}.signalIds: required, at least one signal`);
    } else {
      for (const id of theme.signalIds) {
        if (!signalsById.has(id)) fail(`${at}.signalIds: unknown signal id "${id}"`);
      }
    }
  });

  const referencedSignalIds = new Set(themes.flatMap((theme) => theme.signalIds ?? []));
  for (const id of signalsById.keys()) {
    if (!referencedSignalIds.has(id)) warnings.push(`signals: "${id}" is not used by any theme`);
  }

  const angleIds = new Set();
  angles.forEach((angle, index) => {
    const at = `angles[${index}]`;
    if (!isFilled(angle.id)) fail(`${at}.id: required`);
    else if (angleIds.has(angle.id)) fail(`${at}.id: duplicate id "${angle.id}"`);
    else angleIds.add(angle.id);

    for (const [key, min] of [['angle', 15], ['underlyingProblem', 10], ['whyItMayResonate', 15]]) {
      if (!isFilled(angle[key], min)) fail(`${at}.${key}: required, at least ${min} characters`);
    }
    if (!isFilled(angle.rankingRationale, 20)) {
      fail(`${at}.rankingRationale: required, at least 20 characters — a score with no stated basis is decoration`);
    }
    if (!CLAIM_TYPES.has(angle.claimType)) {
      fail(`${at}.claimType: must be one of ${[...CLAIM_TYPES].join(', ')}`);
    }

    const judgement = angle.judgement ?? {};
    for (const key of JUDGEMENT_KEYS) {
      const value = judgement[key];
      if (!Number.isInteger(value) || value < 0 || value > 5) {
        fail(`${at}.judgement.${key}: required integer 0-5`);
      }
    }

    const hooks = Array.isArray(angle.hooks) ? angle.hooks : [];
    if (hooks.length < 3 || hooks.length > 6) {
      fail(`${at}.hooks: needs between 3 and 6 hooks (found ${hooks.length})`);
    }
    hooks.forEach((hook, hookIndex) => {
      if (!isFilled(hook.text, 3)) fail(`${at}.hooks[${hookIndex}].text: required`);
      if (!isFilled(hook.format)) fail(`${at}.hooks[${hookIndex}].format: required`);
    });

    const themeIds = Array.isArray(angle.themeIds) ? angle.themeIds : [];
    if (themeIds.length === 0) {
      fail(`${at}.themeIds: required — an angle must rest on at least one theme`);
    }
    const angleSignals = [];
    for (const id of themeIds) {
      const theme = themesById.get(id);
      if (!theme) {
        fail(`${at}.themeIds: unknown theme id "${id}"`);
        continue;
      }
      if (!isFilled(theme.counterSignal, 10)) {
        fail(
          `themes["${id}"].counterSignal: required because angle "${angle.id}" is ranked on it — ` +
            'state what would make you wrong, or "none found" plus where you looked',
        );
      }
      for (const signalId of theme.signalIds ?? []) {
        const signal = signalsById.get(signalId);
        if (signal) angleSignals.push(signal);
      }
    }

    const classes = new Set(angleSignals.map((signal) => signal.evidenceClass));
    if (angle.claimType === 'demand-evidence' && ![...classes].some((value) => DEMAND_CLASSES.has(value))) {
      fail(
        `${at}.claimType: "demand-evidence" needs at least one quantitative-demand or internal-data signal. ` +
          `This angle rests on ${[...classes].join(', ') || 'nothing'} — repetition is not prevalence.`,
      );
    }
    if (angle.claimType === 'language-evidence' && ![...classes].some((value) => LANGUAGE_CLASSES.has(value))) {
      fail(
        `${at}.claimType: "language-evidence" needs at least one qualitative-language, direct-request or ` +
          'internal-data signal',
      );
    }
  });

  return {errors, warnings};
};

export const compile = (run, {now} = {}) => {
  const compiledAt = now ?? new Date().toISOString().slice(0, 10);
  const {errors, warnings} = validate(run, compiledAt);
  if (errors.length > 0) return {ok: false, errors, warnings};

  const signalsById = new Map(run.signals.map((signal) => [signal.id, signal]));
  const themeMetricsById = new Map(
    run.themes.map((theme) => [theme.id, {themeId: theme.id, ...themeMetrics(theme, signalsById, compiledAt)}]),
  );
  const themesById = new Map(run.themes.map((theme) => [theme.id, theme]));

  const scored = run.angles
    .map((angle) => {
      const result = scoreAngle(angle, themeMetricsById);
      const primary = themeMetricsById.get(result.primaryThemeId);
      const primaryTheme = themesById.get(result.primaryThemeId);
      const label = confidenceLabel(angle.claimType, result.evidenceStrength, primaryTheme?.evidenceStatus);
      return {
        ...angle,
        ...result,
        confidence: label,
        uncertainty: uncertaintyNote(label, primary ?? {distinctSources: 0, distinctCommunities: 0}),
        metrics: angle.themeIds.map((id) => ({theme: themesById.get(id), metrics: themeMetricsById.get(id)})),
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const testFirst = [];
  const emerging = [];
  const archived = [];
  for (const angle of scored) {
    // Angles above the threshold but past the cap fall into emerging, not out of the report.
    if (angle.score >= TEST_FIRST_THRESHOLD && testFirst.length < MAX_TEST_FIRST) testFirst.push(angle);
    else if (angle.score >= EMERGING_THRESHOLD) emerging.push(angle);
    else archived.push(angle);
  }

  const dates = run.signals.map((signal) => signal.publishedDate).filter(isIsoDate).sort();
  const classCounts = {};
  for (const signal of run.signals) {
    classCounts[signal.evidenceClass] = (classCounts[signal.evidenceClass] ?? 0) + 1;
  }

  const sample = {
    signalCount: run.signals.length,
    distinctSources: unique(run.signals.map((signal) => signal.url)).size,
    distinctCommunities: unique(run.signals.map((signal) => signal.community)).size,
    distinctSourceTypes: unique(run.signals.map((signal) => signal.sourceType)).size,
    distinctAuthors: unique(run.signals.map((signal) => signal.authorRef)).size,
    publishedFrom: dates[0] ?? null,
    publishedTo: dates.at(-1) ?? null,
    medianAgeDays: median(dates.map((date) => dayNumber(compiledAt) - dayNumber(date))),
    classCounts,
  };

  const autoGaps = [];
  for (const [id, metrics] of themeMetricsById) {
    if (metrics.distinctSources <= 1) {
      autoGaps.push(`Theme "${themesById.get(id).label}" rests on a single source — find independent corroboration.`);
    }
  }
  if (!Object.keys(classCounts).some((value) => DEMAND_CLASSES.has(value))) {
    autoGaps.push(
      'No quantitative-demand or internal-data signal in this run, so nothing here can support a claim about how ' +
        'common these problems are. Search data or your own analytics would close that.',
    );
  }
  if (testFirst.length < 3) {
    autoGaps.push(
      `Only ${testFirst.length} angle(s) cleared the test-first threshold. Rather than promoting weaker angles, ` +
        'widen the source mix and re-run.',
    );
  }

  return {
    ok: true,
    warnings,
    compiledAt,
    brief: run.brief ?? {},
    limitsHonoured: run.limitsHonoured ?? {},
    sample,
    testFirst,
    emerging,
    archived,
    evidenceGaps: [...(run.evidenceGaps ?? []), ...autoGaps],
  };
};

const renderAngle = (angle, index) => {
  const lines = [];
  lines.push(`### ${index + 1}. ${angle.angle}`);
  lines.push('');
  lines.push(
    `**Score ${angle.score}/100** · confidence \`${angle.confidence}\` · claim \`${angle.claimType}\` · ` +
      `evidence strength ${angle.evidenceStrength}/5`,
  );
  lines.push('');
  lines.push(`**Underlying problem or desire** — ${angle.underlyingProblem}`);
  lines.push('');
  if (isFilled(angle.customerLanguage)) {
    lines.push(`**How the audience describes it** (paraphrased) — ${angle.customerLanguage}`);
    lines.push('');
  }
  lines.push(`**Why this may resonate** — ${angle.whyItMayResonate}`);
  lines.push('');
  lines.push('**Evidence**');
  lines.push('');
  lines.push('| Theme | Signals | Sources | People | Threads | Communities | Strength | Status | Published |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const {theme, metrics} of angle.metrics) {
    const range =
      metrics.publishedFrom && metrics.publishedTo
        ? metrics.publishedFrom === metrics.publishedTo
          ? metrics.publishedFrom
          : `${metrics.publishedFrom} → ${metrics.publishedTo}`
        : 'undated';
    lines.push(
      `| ${escapeCell(theme.label)} | ${metrics.signalCount} | ${metrics.distinctSources} | ` +
        `${metrics.distinctAuthors || '—'} | ${metrics.distinctThreads} | ${metrics.distinctCommunities} | ` +
        `${metrics.strength}/5 | ${theme.evidenceStatus} | ${range} |`,
    );
  }
  lines.push('');
  for (const {theme} of angle.metrics) {
    lines.push(`**Counter-signal (${escapeCell(theme.label)})** — ${theme.counterSignal}`);
    lines.push('');
    if (isFilled(theme.sampleNote)) {
      lines.push(`**Sample** — ${theme.sampleNote}`);
      lines.push('');
    }
  }
  if (angle.uncertainty) {
    lines.push(`> **Uncertainty.** ${angle.uncertainty}`);
    lines.push('');
  }
  lines.push(`**Why it ranks here** — ${angle.rankingRationale}`);
  lines.push('');
  lines.push('**Hooks to test**');
  lines.push('');
  for (const hook of angle.hooks) {
    const channel = isFilled(hook.channel) ? ` · ${hook.channel}` : '';
    lines.push(`- "${hook.text}" — *${hook.format}${channel}*`);
  }
  lines.push('');
  if (Array.isArray(angle.suggestedFormats) && angle.suggestedFormats.length > 0) {
    lines.push(`**Suggested formats** — ${angle.suggestedFormats.join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
};

export const renderReport = (compiled) => {
  const {sample, brief, limitsHonoured} = compiled;
  const lines = [];

  lines.push(`# Marketing angles — ${brief.product ?? 'untitled run'}`);
  lines.push('');
  lines.push(
    '> Qualitative language evidence shows how people describe a problem. It does not establish how common that ' +
      'problem is. Only demand or internal data can support a claim about prevalence.',
  );
  lines.push('');
  lines.push(`- **Audience:** ${brief.audience ?? 'not stated'}`);
  lines.push(`- **Decision this informs:** ${brief.decision ?? 'not stated'}`);
  lines.push(`- **Compiled:** ${compiled.compiledAt}`);
  lines.push(
    `- **Evidence base:** ${sample.signalCount} signals · ${sample.distinctSources} distinct sources · ` +
      `${sample.distinctCommunities} communities · ${sample.distinctSourceTypes} source types · ` +
      `${sample.distinctAuthors || 'unknown'} distinct people`,
  );
  lines.push(
    `- **Published:** ${sample.publishedFrom ?? 'undated'} → ${sample.publishedTo ?? 'undated'}` +
      (sample.medianAgeDays === null ? '' : ` (median age ${sample.medianAgeDays} days)`),
  );
  lines.push(
    `- **Evidence classes:** ${
      Object.entries(sample.classCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} ×${count}`)
        .join(' · ') || 'none'
    }`,
  );
  if (Object.keys(limitsHonoured).length > 0) {
    const spend = limitsHonoured.spend ?? {};
    lines.push(
      `- **Research limits:** ${limitsHonoured.venuesReviewed ?? '?'} venues · ` +
        `${limitsHonoured.communitiesReviewed ?? '?'} communities · ${limitsHonoured.threadsReviewed ?? '?'} threads · ` +
        `${limitsHonoured.paidFetches ?? 0} paid fetches · spend ${spend.amount ?? 0} ${spend.currency ?? ''}`.trim(),
    );
  }
  if (Array.isArray(brief.assumptions) && brief.assumptions.length > 0) {
    lines.push(`- **Assumed, not read:** ${brief.assumptions.join('; ')}`);
  }
  lines.push('');

  lines.push('## Angles to test first');
  lines.push('');
  if (compiled.testFirst.length === 0) {
    lines.push('None cleared the threshold. See emerging angles and evidence gaps below.');
    lines.push('');
  } else {
    if (compiled.testFirst.length < 3) {
      lines.push(
        `> Only ${compiled.testFirst.length} angle(s) cleared the threshold. Weaker angles were deliberately not ` +
          'promoted to fill the list.',
      );
      lines.push('');
    }
    compiled.testFirst.forEach((angle, index) => {
      lines.push(renderAngle(angle, index));
    });
  }

  lines.push('## Emerging angles');
  lines.push('');
  lines.push('Worth watching. Not enough support to rank yet.');
  lines.push('');
  if (compiled.emerging.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Angle | Score | Confidence | What it needs |');
    lines.push('| --- | ---: | --- | --- |');
    for (const angle of compiled.emerging) {
      lines.push(
        `| ${escapeCell(angle.angle)} | ${angle.score} | ${angle.confidence} | ` +
          `${escapeCell(angle.uncertainty ?? angle.rankingRationale)} |`,
      );
    }
  }
  lines.push('');

  if (compiled.archived.length > 0) {
    lines.push('## Archived');
    lines.push('');
    for (const angle of compiled.archived) {
      lines.push(`- ${angle.angle} (${angle.score})`);
    }
    lines.push('');
  }

  lines.push('## Evidence gaps');
  lines.push('');
  if (compiled.evidenceGaps.length === 0) lines.push('None recorded.');
  else for (const gap of compiled.evidenceGaps) lines.push(`- ${gap}`);
  lines.push('');

  lines.push('## Method and limits');
  lines.push('');
  lines.push(
    '- Evidence strength is derived from distinct sources and source diversity. The number of comments behind a ' +
      'theme never raises its strength.',
  );
  lines.push('- Every signal carries a URL and an access date. Counts are derived from those signals, never asserted.');
  lines.push('- Every ranked theme carries a counter-signal.');
  lines.push('- Ranking scores combine derived evidence with stated human judgement; each angle records its basis.');
  lines.push('');

  return `${lines.join('\n')}\n`;
};

const main = (argv) => {
  const args = argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const nowIndex = args.indexOf('--now');
  const outIndex = args.indexOf('--out');
  const now = nowIndex >= 0 ? args[nowIndex + 1] : undefined;
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const positional = args.filter((arg, index) => {
    if (arg.startsWith('--')) return false;
    return args[index - 1] !== '--now' && args[index - 1] !== '--out';
  });

  const runPath = positional[0];
  if (!runPath) {
    console.error('usage: node angles.mjs <run.json> [--out report.md] [--json] [--now YYYY-MM-DD] [--quiet]');
    return 1;
  }
  if (now !== undefined && !isIsoDate(now)) {
    console.error('--now must be YYYY-MM-DD');
    return 1;
  }

  let run;
  try {
    run = JSON.parse(readFileSync(resolve(runPath), 'utf8'));
  } catch (error) {
    console.error(`Cannot read ${runPath}: ${error.message}`);
    return 1;
  }

  const compiled = compile(run, {now});
  if (!compiled.ok) {
    console.error(`\n${compiled.errors.length} validation error(s) — the run file is not compilable:\n`);
    for (const error of compiled.errors) console.error(`  ✗ ${error}`);
    console.error('');
    return 1;
  }

  if (!flags.has('--quiet')) {
    for (const warning of compiled.warnings) console.error(`  ! ${warning}`);
  }

  const output = flags.has('--json') ? `${JSON.stringify(compiled, null, 2)}\n` : renderReport(compiled);
  if (out) {
    writeFileSync(resolve(out), output);
    if (!flags.has('--quiet')) {
      console.error(
        `Wrote ${out} — ${compiled.testFirst.length} to test first, ${compiled.emerging.length} emerging, ` +
          `from ${compiled.sample.signalCount} signals across ${compiled.sample.distinctSources} sources.`,
      );
    }
  } else {
    process.stdout.write(output);
  }
  return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv));
}
