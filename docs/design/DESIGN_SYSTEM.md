# Small weather app design foundation

Date: **2026-10-07**.
Status: **Proposed visual specification; human approval required before UI
implementation.** The user's multi-day forecast requirement supersedes the
previous current-weather-only design. This is a short presentation guide, not
a component framework or a large design-system project.

Follow the [application rules](../app/AGENTS.md) and
[API contract](../backend/API_CONTRACT.md). Use React + TypeScript; Vite is
acceptable for the frontend. No unnecessary UI or state-management framework.

## Visual direction and layout

- Calm, polished light interface: pale background `#F8FAFC`, white cards,
  dark text `#0F172A`, secondary text `#475569`, blue actions `#1D4ED8`,
  and clearly labeled errors `#B91C1C`. Verify actual contrast.
- Native system sans-serif; 16 px body/inputs, 14 px supporting text,
  28-32 px page heading, and 18-20 px day headings.
- Use consistent 8, 16, 24, and 32 px spacing, subtle borders, and modest
  8-12 px corner rounding. No decorative dashboards or heavy animations.
- Center a maximum 1120 px content area with 16-24 px gutters. Stack search,
  forecast, and saved selections on mobile. Allow day cards to form a simple
  responsive grid on wider screens; avoid a mandatory 12-column layout system.
- Forms are at most 440 px wide. Support 320 px width and zoom/reflow without
  horizontal page scrolling, clipped text, or hidden keyboard focus.

## Simple navigation and controls

- Header: app name/home link, Login and Register when anonymous, signed-in
  indicator and Logout when authenticated. No extra navigation system.
- Search form: visibly labeled city input, optional two-letter country code,
  and Show forecast button. No autocomplete, maps, or geolocation permissions.
- Primary buttons are blue with white text; secondary actions use a simple
  outline/text style. Give controls clear focus/hover/disabled/loading states
  and at least 44 px targets. Use semantic buttons for actions, links for pages.
- Email/password forms follow the API validation rules. Allow password managers
  and paste, preserve nonsecret values on failure, associate field errors with
  labels, and show generic login failures. Registration success leads to login.
- Reuse only the simple components actually needed: input/label, button,
  status message, forecast day card, and saved-selection row.

## Multi-day forecast presentation

- Show the resolved city/country first, followed by a clear "Forecast for the
  coming days" heading. Show coordinates as secondary
  detail when needed to distinguish locations. Never imply browser geolocation.
- Group the normalized `forecast` points by date using the city's
  `timezoneOffsetSeconds`, not the browser timezone. Label weekday/date and
  the city's UTC offset. Preserve chronological order.
- Each day card shows its available three-hour forecast rows: local time,
  temperature with Celsius unit, and condition text with an optional local icon.
  This provides an attractive multi-day view without charts, extra metrics,
  a paid daily forecast, or an aggregation service.
- Give each forecast row a Save forecast action with an accessible name
  including its date/time, so the user selects a specific forecast point.
  Submit its temperature/description and valid time with the resolved location.
- First/last cards may represent partial days. Display available times and
  mark partial days; do not invent missing intervals, daily highs/lows, or
  promise five complete calendar days.
- Show "Retrieved at" from `fetchedAt` with explicit timezone context.
  Forecast times are predictions for those times, not observed conditions;
  do not call them current weather or observation timestamps.
- Map condition codes to local icons; never request provider icons directly.
  Condition text conveys meaning; decorative icons have empty alternative text.
- Include OpenWeather attribution appropriate to the free product after checking
  its terms. Attribution never permits frontend calls to OpenWeather.

## Saved selections and authentication

- Saving associates a minimal selected forecast snapshot and its city/location
  with the logged-in user. Anonymous users see Log in to save.
- After login, list that user's saved forecasts with city/country, selected
  forecast date/time, saved temperature/description, and creation time.
  Label these values Saved forecast snapshot, not current/fresh weather.
  Show stored timestamps explicitly in UTC; no extra timezone field is needed.
  Provide separate Open fresh forecast and Remove actions.
- Opening a saved selection always requests a fresh multi-day forecast through
  our backend, which calls OpenWeather again. Show loading while it fetches;
  do not reuse old forecast data as a successful new selection.
- Keep the saved snapshot unchanged when fresh data arrives. A saved forecast
  whose selected time is past may still be reopened for its city's upcoming
  forecast. No automatic history, snapshot-update workflow, or comparison chart.
- Indicate Saved on duplicate/new-save success. Change save/remove state only
  after server confirmation; keep the list intact if the operation fails.
- Clear private state on session expiry and offer login; never automatically
  replay a failed save. Logout completes only after server confirmation.

## States and accessibility

- Before searching: a short city-search prompt. While loading: an in-place
  activity cue and text, without fake weather or progress percentages.
- No match: suggest checking city/country. Provider error, timeout, or quota:
  explain forecast unavailability and offer deliberate retry; keep account and
  saved-preference features usable. Respect rate-limit wait hints.
- Empty saved list: explain how to save a forecast point. Failed list loading is an
  error, never an empty-list fallback. Place field/form errors near the action.
- If an old forecast remains after failure, label it Previous forecast with
  its city/retrieval time beside the error. Never present it as the new result.
- Ignore/cancel superseded searches so late responses cannot replace the newest
  selection. Do not automatically replay mutations or rapidly retry failures.
- Target WCAG 2.2 AA: keyboard operation, visible focus, semantic headings and
  landmarks, persistent labels, sufficient text/control contrast, no color-only
  status, polite live announcements, reduced motion, and sensible focus after
  validation or removal. Verify narrow screens, zoom, and screen-reader behavior.

No UI code, component library, stylesheets, visual prototype, or accessibility
certification is delivered by this document.
