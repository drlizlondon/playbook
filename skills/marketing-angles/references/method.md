# Method

The epistemics behind the skill. Read once; the rules here are what `scripts/angles.mjs` enforces.

## 1. Evidence classes

Every signal declares what kind of claim it can support. This is the single most important field in the run file.

| Class | What it is | Can support | Cannot support |
|---|---|---|---|
| `qualitative-language` | How people describe a problem, in public — forums, reviews, comments, communities | Wording, framing, emotional register, objections, desires | Prevalence, market size, willingness to pay |
| `direct-request` | Someone explicitly asks for the outcome or capability | That the request exists and how it is expressed | That the request is widespread |
| `competitor-positioning` | How another product frames the same problem | What the market is being told; where positioning is crowded | That the framing works, or that customers agree |
| `quantitative-demand` | Search volume, category sales, a survey with a described sample | Scale, direction, relative size | *Why* people behave that way |
| `internal-data` | Your own analytics, support tickets, sales-call notes, churn reasons | Scale within your own users, and often the sharpest language | Behaviour of people who are not yet your users |
| `hypothesis` | Your synthesis. Grounded in something, but not stated by anyone | Framing worth testing | Anything, on its own |

**The prevalence rule.** An angle may only claim that something is common, typical or widespread if at least one signal under it is `quantitative-demand` or `internal-data`. Otherwise it is a claim about language, not about the market. The compiler enforces this via `claimType`:

- `language-evidence` — "people describe it this way" (needs qualitative signals)
- `demand-evidence` — "this is widespread / growing / worth £X" (needs demand or internal signals)
- `hypothesis` — "we think this may resonate" (needs nothing, and must say so)

Nothing stops a `language-evidence` angle from being the best angle in the run. Most winning angles are language angles. The rule only stops it from *pretending to be* a demand angle.

## 2. What is never stored

Provenance without surveillance. The run file holds:

- the public URL, the community or site name, the publication date, the date you accessed it
- your own paraphrase of the signal
- opaque local aliases for people (`a1`) and threads (`t1`)

It never holds usernames, handles, post bodies, comment text, verbatim quotes, or any personal or health detail. The compiler rejects a file containing keys named `author`, `username`, `user`, `body`, `selftext`, `rawText`, `rawPost`, `comments`, `commentBodies`, `quote`, `quotes` or `handle`, at any depth. It also rejects a paraphrase wrapped in quotation marks, because that is a quote wearing a paraphrase's clothes.

Aliases exist so distinct-people counts are possible without holding identities. Assign them consistently within a run and let them expire with it; never carry them between runs and never derive them from a real handle.

## 3. Derived counts

Two words that are easy to confuse, so they are fixed here: a **venue** is one site, community or system you looked in. A **source** is one URL within it. Research limits are counted in venues; evidence strength is counted in sources.

You never write a count. The compiler derives, per theme:

| Metric | Derivation |
|---|---|
| `signalCount` | number of signals |
| `distinctSources` | distinct URLs |
| `distinctThreads` | distinct `threadRef`, falling back to URL |
| `distinctAuthors` | distinct `authorRef`, counted only where supplied |
| `distinctCommunities` | distinct `community` |
| `distinctSourceTypes` | distinct `sourceType` |
| `publishedRange` | earliest and latest `publishedDate` |
| `medianAgeDays` | median age at compile date |

Report a count only where it genuinely exists. Fifteen comments by one person in one thread is `signalCount: 15, distinctAuthors: 1, distinctThreads: 1` — and the report shows all three, so nobody mistakes volume for breadth.

## 4. Evidence strength

Strength is 0–5 and comes from **breadth, not volume**:

```
diversity = max(distinctCommunities, distinctSourceTypes)

5  distinctSources ≥ 5 and diversity ≥ 3
4  distinctSources ≥ 3 and diversity ≥ 2
3  distinctSources ≥ 2 and diversity ≥ 2
2  distinctSources ≥ 2
1  distinctSources = 1
0  none
```

`signalCount` is deliberately absent from this formula. Two themes with the same distinct-source counts score identically no matter how many comments sit behind them. That is the whole point, and a unit test pins it.

**Freshness** multiplies the evidence component: ×1.0 within 90 days, ×0.85 within 180, ×0.7 within 365, ×0.5 beyond. Old language is still language, but it decays — markets re-word themselves.

## 5. Ranking

```
positive = evidenceStrength/5 × 40 × freshnessFactor
         + strategicFit/5     × 25
         + differentiation/5  × 20
         + testability/5      × 15

risk     = overclaimRisk/5 × 20
         + brandRisk/5     × 15
         + thinnessPenalty (15 when max evidence strength ≤ 1)

score    = clamp(positive − risk, 0, 100)
```

`strategicFit`, `differentiation`, `testability`, `overclaimRisk` and `brandRisk` are 0–5 judgements you make. They are judgements, not measurements — which is why every angle must carry a `rankingRationale` in plain language. A score with no stated basis is decoration.

Tiers: **≥ 65** test first (capped at 5) · **45–64** emerging · **< 45** archived, listed by name only.

If fewer than three angles clear 65, the report says so rather than promoting weak ones to fill the slots.

## 6. Confidence labels

Attached to each angle, derived from its strongest theme:

| Label | Condition |
|---|---|
| `strong` | evidence strength ≥ 4 and evidence status `verified` or `partial` |
| `moderate` | evidence strength ≥ 3 |
| `thin` | evidence strength 2 |
| `single-source` | evidence strength 1 |
| `hypothesis` | evidence strength 0, or `claimType: hypothesis` |

`thin`, `single-source` and `hypothesis` angles get an automatic uncertainty sentence in the report. Do not delete it.

## 7. Evidence status

Per theme, three values, same meaning as any research ledger:

- `not_checked` — listening only; nothing verified against an authoritative or first-party source
- `partial` — verification has begun
- `verified` — the claim under this theme has been checked against a source that can actually support it

A theme may be `not_checked` and still produce the best angle in the run. Status describes verification, not value.

## 8. Counter-signals

Every theme referenced by an angle needs one, or the run does not compile. A counter-signal is what would make you wrong:

- the sample is skewed (a support forum contains people with problems, by construction)
- loud disagreement exists in the same threads
- the behaviour contradicts the stated preference
- the pattern is explained by something other than your angle
- it was true last year and the market has moved

"None found" is acceptable **only** with where you looked: `"none found — checked the two most-upvoted dissenting replies in each thread and the 1-star reviews"`. An empty counter-signal field is a run that has not been finished.

## 9. Angles vs hooks

An **angle** is a strategic position: the problem, the tension, the claim. Reusable for months.

A **hook** is one execution of it. Disposable, testable, plural. A good angle produces a reel opener, a headline, an ad line, an email subject and a landing-page H1 that all feel like the same argument in different clothes.

If your five hooks are five rewordings of one sentence, you have one hook. Vary the instrument: question, number, contradiction, admission, before/after, named enemy.

## 10. Working with sources other than forums

Nothing here is forum-specific. The same structure holds for:

- **Support tickets / sales calls** — `internal-data`, `community` is the queue or segment, `threadRef` is the ticket
- **Review sites** — `review-site`, and note the selection bias (reviews cluster at 1 and 5 stars)
- **Search data** — `quantitative-demand`, `url` is the report or export, `publishedDate` is the period
- **Interviews / surveys** — `interview` / `survey`, and record the sample in `sampleNote`

A run mixing internal data with public language is the strongest kind, because the internal data supplies scale and the public language supplies words.
