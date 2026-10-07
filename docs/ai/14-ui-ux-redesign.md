# UI/UX redesign documentation

- **Date:** 2026-10-07.
- **Author / AI tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting repository owner; formal approval authority
  not independently verified.
- **Related requirements:** F-01 through F-04, N-01 (small application),
  N-04 (AI documentation), S-02, and AS-09 (graceful provider failure).
  No ADR, infrastructure, API, or workflow change.
- **Scope:** Write only [DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md) and this
  record. Everything else read-only; no staging or commits.

## Problem and prompt

**Faithful prompt summary, not a transcript:** Refine the small React +
TypeScript weather application's design system toward the supplied weather-app
visual reference. Specify Tailwind-first styling with minimal shared tokens,
desktop and mobile composition, components and states, accessible loading
skeletons, and strict adherence to the free five-day / three-hour forecast API.
Report reference observations and planned changes before editing. Keep saved
snapshots distinct from fresh data; document decisions and verify write scope.
No secrets or personal weather/account data were included in this record.

## Evidence read

- [Existing design system](../design/DESIGN_SYSTEM.md): calm light palette,
  modest 8-12 px rounding, day-card/grid guidance, and general loading cues;
  lacked a prominent hero, selected time-point treatment, Tailwind conventions,
  detailed desktop composition, and skeleton dimensions.
- [API contract](../backend/API_CONTRACT.md): authoritative routes, fields,
  fixed city timezone offset, partial boundary days, condition-code set,
  snapshot fields, authentication, and fresh retrieval rules.
- [Application rules](../app/AGENTS.md),
  [requirements](../requirements.md),
  [root contract](../../AGENTS.md),
  [repository instructions](../../.github/copilot-instructions.md), and
  [AI record convention](README.md).
- Supplied read-only visual reference: pale-blue canvas, navy type, blue selected
  pills, large rounded white surfaces, soft shadows, large temperatures,
  illustration-led weather, and airy forecast presentation. It also depicts
  device chrome and unsupported seven-day/daily/extra-metric content.
- Read-only [frontend manifest](../../frontend/package.json) and
  [application shell](../../frontend/src/App.tsx): React/TypeScript frontend
  exists; the inspected manifest does not yet include Tailwind. This session
  specifies the styling direction, not an installed or implemented migration.

## AI recommendations retained in the draft

1. Pale-blue `#EEF6FF` canvas, navy `#153653`, white surfaces, and a compact color
   set. Use `#2563EB` for white-on-blue actions/selection rather than the lighter
   reference blue; verify actual rendered contrast in implementation.
2. 16/24/32 px radii and pill selectors, two diffused shadows, a native font,
   60/72 px temperature type, and a short Tailwind spacing scale.
3. Centered 1120 px maximum content; at desktop, prominent hero alongside a
   wider forecast-day column. Mobile stacks naturally with bounded horizontal
   point strips. Saved snapshots remain below the primary weather composition.
4. One selected forecast point drives the hero and its explicit Save action.
   All points remain available by local day; selection is a native button with
   `aria-pressed` and a visible Selected label, not an invented tab framework.
   Forecast valid time is never described as an observation/current weather.
5. City-local formatting uses the supplied fixed offset, without double-applying
   browser timezone. Boundary coverage explains partial days; no daily summaries
   or inferred missing intervals. Snapshot timestamps remain explicitly UTC.
6. Original/licensed local icons follow fresh `condition.code`; snapshots show
   stored description text, without fabricating a code or timezone.
7. Layout-matched blue-gray skeletons for session controls, hero, forecast strips,
   and saved list. Actual loading only, hidden decorative placeholders, real
   status announcements, and reduced-motion-safe optional pulse. Small mutations
   use loading/disabled buttons rather than page skeletons.
8. Ordinary Tailwind responsive utilities plus one small token layer; no new
   component library, plugin architecture, font dependency, or large CSS system.
   Define clear focus, validation, loading, empty, error, and confirmed-success
   treatments without changing the API's behavior.

## Rejected or deferred

- **Rejected:** Literal copying of screenshot artwork/device chrome, seven-day
  or yesterday navigation, daily highs/lows, humidity, precipitation probability,
  wind, visibility, UV, charts/maps, geolocation, and autocomplete. They are
  outside the API or requested visual scope.
- **Rejected:** Dense equal-priority dashboard tiles, stretched mobile-only
  desktop layout, a large theme/component framework, fake loading weather,
  silent error-to-empty fallbacks, and treating snapshots as fresh forecasts.
- **Deferred:** Tailwind installation, frontend source/styles migration,
  screenshot comparison, live accessibility checks, and any API/security policy
  still requiring human approval. No dependencies installed or resources changed.

## Verification and human decision

- Read the sources and reference before editing; reported the six requested
  pre-edit observations, including unsupported screenshot elements.
- Documentation was checked against contract fields and flows, including
  partial days, timezone offset semantics, immutable snapshots, and explicit
  failure states. No weather-provider calls or external research were needed.
- **Checks passed:** `git diff --check` for the owned paths; clean whitespace
  and final newlines in both documents; all 14 relative Markdown links resolve.
- **Scope check passed:** Only the two owned paths were added/modified relative
  to the initial worktree status. All 15 pre-existing unrelated modified/untracked
  path statuses remained unchanged. The index is empty; nothing staged or
  committed. No write was made outside the permitted documents.
- **Human-confirmed constraints:** This request explicitly sets the visual
  direction, Tailwind-first approach, documentation scope, and API limitations.
- **Final human decision:** **Pending** review of the refined specification.
  A generated design document is not approval to implement the frontend.
- **Follow-up:** Obtain design approval, then implement in separately authorized
  frontend scope and verify the listed viewport, contrast, keyboard, screen-reader,
  reduced-motion, and state-layout acceptance checks. No build/test was run for
  this documentation-only change; rendered quality and runtime behavior remain
  unverified.
