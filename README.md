# What is this repo?

This is **not** the code-review bot.

It is a private **demo harness** for a live GitHub App I deployed tonight at [ClawBuilders S1:E5 — Deploy AI Agents with Cloudflare](https://clawbuilder.club/events/s1/ep5/deploy-ai-agents-with-cloudflare).

When someone opens a pull request here, GitHub pings a Cloudflare Worker on the edge. That Worker reviews the PR and comments back as **[`cf-pr-review[bot]`](https://github.com/apps/cf-pr-review)**.

| Piece | What it is |
|---|---|
| This repo | Dummy code + two tripwire PRs, so people can *see* the bot work |
| [cf-pr-review](https://github.com/apps/cf-pr-review) | The GitHub App (bot identity + webhook) |
| Cloudflare Worker | The actual reviewer — Advanced Track of [`Clawbuilders/cloudflare-code-reviewer`](https://github.com/Clawbuilders/cloudflare-code-reviewer) |

`main` is almost empty on purpose. The interesting stuff is in the open PRs.

---

## Is this just the 10-minute starter?

No. The workshop has two tracks. I shipped the harder one.

| | Starter Track | What I deployed (Advanced Track) |
|---|---|---|
| Time-to-first-review | ~10 minutes | Longer: GitHub App + Worker + Durable Object |
| Identity | Comments as *you* (a personal access token) | Comments as `cf-pr-review[bot]` |
| Memory | Stateless Worker — each webhook is forgotten | SQLite Durable Object per PR, with a 15s push debounce |
| Review style | One model reads the diff and comments | Cheap deterministic gates first, then a triage model, then a multi-model committee |
| On secrets | The LLM might notice | Regex secret scan **blocks immediately** — the LLM never runs |
| On new npm deps | The LLM might guess | Live lookups to [osv.dev](https://osv.dev) (real CVEs) and [deps.dev](https://deps.dev) (OpenSSF Scorecard) |

Straightforward instructions: *“deploy one Worker, give it a token, let Qwen review every PR.”*

What I built: *a pipeline that spends almost no AI tokens on the easy cases, and only calls specialist models when something actually looks risky.*

---

## What happens when you open a PR

```text
You open / push a PR here
        │
        ▼
GitHub App webhook  →  Cloudflare Worker  /webhook/github
        │
        ▼
Durable Object for this exact PR  (15s debounce so rapid pushes don't spam)
        │
        ▼
Pillar 1 — secret scan (regex, Gitleaks-style)
   secrets found?  →  🚨 CRITICAL BLOCK comment  →  STOP
        │
        ▼
Pillar 2 — live osv.dev CVE lookup on new package.json deps
Pillar 3 — drop lockfiles / vendor / bundles so the LLM isn't wasted
Pillar 4 — OPA-style policy: auth, CI workflows, huge blast radius
Pillar 7 — live deps.dev OpenSSF Scorecard on new deps
        │
        ▼
Pillar 3.5 — Jev triage (or a free-tier fallback if Jev is down)
   “Does this need security? quality? both? neither?”
   A real CVE / policy hit always forces the security specialist.
        │
        ▼
Parallel committee (only the specialists triage asked for)
   DeepSeek-R1 Distill  →  security
   Qwen 2.5 Coder       →  code quality
        │
        ▼
Llama 3.3 70B Lead Arbiter  (dedupe + “don’t introduce a worse fix”)
        │
        ▼
One comment on the PR as cf-pr-review[bot]
```

Some pillars are **REAL** (they call a public HTTP API). Some are **HEURISTIC** (JS regex / path rules inspired by the named tool). A Cloudflare Worker is a V8 isolate — it cannot run the real `gitleaks` or `opa` binaries — so the workshop is honest about that.

---

## The two test PRs (look at these)

### [PR #1 — fake secrets + vulnerable deps](https://github.com/akshatdodhiya/code-reviewer-test/pull/1)

**Goal:** prove the hard stop. Secrets should never reach the LLM.

The branch adds:

- `config/aws-settings.js` — documented fake AWS + GitHub token *shapes* (not real credentials)
- `package.json` — `lodash@4.17.15` and `request@2.88.0` (old packages with known CVEs)

**What the bot did:** ~18 seconds later it posted a **CRITICAL SECURITY BLOCK**. It named `GitHub Token` and `AWS Access Key ID`, then exited. No committee. No CVE writeup. That is the correct behavior — if secrets are in the diff, everything else can wait.

### [PR #2 — vulnerable deps only](https://github.com/akshatdodhiya/code-reviewer-test/pull/2)

**Goal:** prove the rest of the pipeline when Pillar 1 has nothing to block.

Same old `lodash` / `request` pins. No secret-shaped strings.

**What the bot did:**

- Secret scan passed
- Jev was unavailable that run, so triage fell back to a free-tier model
- Quality specialist was skipped (a deps-only PR does not need a style review)
- Security committee posted the 7-pillar header and a writeup

The header proving the Advanced Track actually ran:

> AI Review Committee (7-Pillar Security Suite)
> Gitleaks-pattern • OSV.dev (live) • Hard-Rails Filter • Jev Triage Gate • OPA-inspired Policy • Mantis-style Reachability • OWASP-ASRH-style Regression • OpenSSF Scorecard (live)

---

## Why two PRs instead of one?

PR #1 is the *fire alarm*. PR #2 is the *inspection*.

If I only opened PR #1, people would think the bot is “just a secret scanner.” The secret gate is designed to return early, so the CVE / Scorecard / Jev / committee path would never show up.

If I only opened PR #2, people would never see that a leaked token gets blocked *before* any model is paid for.

Together they show the two personalities of the same agent: **cheap and strict first, expensive and thoughtful second.**

---

## How to demo this in 60 seconds

1. Open [PR #1](https://github.com/akshatdodhiya/code-reviewer-test/pull/1) — point at the red block comment from `cf-pr-review[bot]`.
2. Open [PR #2](https://github.com/akshatdodhiya/code-reviewer-test/pull/2) — point at the 7-pillar committee comment and the “quality specialist skipped” line.
3. Say: *the reviewer does not live on my laptop. GitHub wakes a Worker on Cloudflare’s edge, a Durable Object holds PR state, and the comment comes back as a real GitHub App.*

Want to trigger it again? Push any new commit to either PR branch (the `synchronize` event re-queues a review after a 15 second quiet period).

---

## Built with

- [Clawbuilders/cloudflare-code-reviewer](https://github.com/Clawbuilders/cloudflare-code-reviewer) — Advanced Track
- Cloudflare Workers + SQLite Durable Objects + Workers AI
- GitHub App webhooks (`pull_request` opened / synchronize)
- Live [osv.dev](https://osv.dev) and [deps.dev](https://deps.dev) APIs
- TypeSafe [Jev](https://developers.cloudflare.com/ai/models/typesafe/jev/) for triage (with a free-tier fallback)

This repo stays throwaway on purpose. The product is the bot, not the dummy `package.json`.
