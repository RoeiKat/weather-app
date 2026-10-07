# Small weather app design system

Date: **2026-10-07**.
Status: **Proposed refinement; human approval required before UI implementation.**
The user has specified the visual direction and Tailwind approach; this document
does not authorize code changes or resolve pending API/security decisions.

Follow the [application rules](../app/AGENTS.md),
[requirements](../requirements.md), and authoritative
[API contract](../backend/API_CONTRACT.md). The
[redesign record](../ai/14-ui-ux-redesign.md) captures sources and decisions.

## 1. Visual principles

- Friendly, weather-first: soft pale-blue canvas, dark navy type, vivid blue
  actions, large white rounded surfaces, diffused shadows, and breathing room.
- Lead with the resolved location, selected forecast temperature, and a friendly
  condition icon/illustration. Account controls and saved snapshots are secondary.
- Keep forecast days and three-hour time points prominent, not a dense dashboard
  grid. Decoration must not compete with weather, labels, or actions.
- Take visual cues from the supplied image, not its literal screen layout or
  artwork. Use original or appropriately licensed local artwork; no phone frame,
  status bar, device navigation, or ornamental application chrome.
- Show only contract data. No seven-day or yesterday view, daily highs/lows,
  humidity, precipitation probability, wind, visibility, UV, charts, maps,
  geolocation, autocomplete, or extra metrics.

## 2. Small token set

### Colors

| Token | Hex | Use |
| --- | --- | --- |
| `canvas` | `#EEF6FF` | Pale-blue page background |
| `surface` | `#FFFFFF` | Hero, day panels, forms, saved rows |
| `tint` | `#E6F0FC` | Quiet icon wells and supporting surfaces |
| `ink` | `#153653` | Navy headings, body, temperature |
| `muted` | `#52677D` | Secondary labels, dates, retrieval metadata |
| `primary` | `#2563EB` | Primary buttons and selected forecast point |
| `primary-hover` | `#1D4ED8` | Hover/active blue |
| `divider` | `#DCE7F2` | Decorative separators and subtle card outlines |
| `control-border` | `#7B93AD` | Input/control boundary on light surfaces |
| `skeleton` | `#DCE7F2` | Noninteractive blue-gray placeholders |
| `danger` / `danger-tint` | `#B91C1C` / `#FEF2F2` | Error text and backing |
| `success` / `success-tint` | `#166534` / `#F0FDF4` | Confirmed success text and backing |

White content on `primary` is intentionally darker than the reference's bright
illustration blue to support readable small text. Use `ink` or `muted` on light
surfaces; use white for both main and secondary selected-card text, not faded
white. `divider` is not sufficient as the sole interactive boundary. Verify
rendered text contrast (4.5:1 normal, 3:1 large) and control/focus contrast (3:1).

### Type, space, shape

- Native system sans-serif (`font-sans`); no font dependency. Body/inputs:
  `text-base` (16 px), `font-normal`, `leading-relaxed`.
- Metadata/time labels: `text-sm` (14 px), `leading-5`; avoid smaller essential
  text. Buttons: `text-sm font-semibold`. Day headings: `text-lg font-semibold`.
- Location/page heading: `text-2xl sm:text-3xl font-semibold` (24/30 px).
  Temperature: `text-6xl lg:text-7xl font-semibold leading-none tracking-tight`
  (60/72 px), with a smaller but clear Celsius unit and tabular numerals.
- Use 4/8/12/16/24/32/48 px spacing (`1/2/3/4/6/8/12`).
  Cards: `p-6 lg:p-8`; related items `gap-3` or `gap-4`;
  main sections `gap-6 lg:gap-8`; page breathing room `py-6 lg:py-10`.
- Radii: controls/saved rows 16 px (`rounded-2xl`), panels 24 px (`rounded-3xl`),
  hero 32 px (`rounded-[32px]`), forecast selectors/badges `rounded-full`.
- Shared surface shadow: `0 12px 32px -12px rgba(21,54,83,0.16)`.
  Selected-card shadow: `0 8px 20px -8px rgba(37,99,235,0.35)`.
  Avoid heavy borders, hard black shadows, glass effects, or layered gradients.

## 3. Tailwind and responsive composition

Use **React + TypeScript and Tailwind CSS as the primary styling approach**.
Tailwind is not yet installed in the inspected frontend manifest; installation
and source migration belong to a separately authorized frontend task.

- Prefer straightforward utilities and responsive prefixes. Define only the
  shared colors, two shadows, and any nonstandard radius in one small theme/token
  layer using the chosen Tailwind version's native mechanism. No plugin,
  multi-theme architecture, extra component library, or general variant engine.
- Use complete static utility strings for selected/loading/error states; avoid
  dynamically constructed class names. Extract only repeated UI such as a
  button, labeled field, forecast-point control, or skeleton.
- Custom CSS is only for something utilities cannot express simply; a shimmer
  is optional, not a reason to build an animation system. Prefer a basic pulse.
- Page container: `mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8`.
  Auth form: `w-full max-w-[440px]`. Header and footer align to the container.
- Mobile first: header can wrap; search stacks; location/weather hero sits near
  the top; forecast groups and saved rows stack vertically. At `sm` (640 px),
  search fields/actions may share a row if labels and content fit.
- At `lg` (1024 px), use an intentional two-column weather composition:
  `grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-6 lg:gap-8`.
  Hero occupies the left column; all day groups occupy the wider right column.
  Align at the top, without a fixed-height dashboard or nested vertical scroller.
  Put saved forecasts below this weather composition, not in an equal-priority
  dashboard tile. Desktop hero uses its space for temperature and artwork.
- Forecast-point strips may scroll horizontally within their day panel using
  `flex gap-3 overflow-x-auto`; retain an accessible scrollbar and visible edge
  cue. Use `min-w-0` on grid/flex children, `max-w-full` on strips, and padding
  around focused controls. Do not mask page overflow with `overflow-x-hidden`.
- Support 320 px width and zoom/reflow. Long locations/descriptions wrap;
  temperature/unit remain legible. No fixed page width, clipped text, hover-only
  actions, or horizontal page scrolling.

## 4. Weather hero and day grouping

- Hero: large white surface with a pale-blue illustration area, resolved
  `location.name`, `countryCode` when non-null, and canonical coordinates as
  subdued verification detail. Do not infer a country name or a device location.
- Label the hero **Forecast for [local date/time]**. Initially select the first
  returned point; selecting another point updates temperature, description,
  icon, and valid time together. This is not "current weather" or an observation.
- Show `temperatureC` in Celsius (up to one decimal for display), the plain-text
  `condition.description`, and a Save forecast action for the selected point.
  Saving uses original values, not rounded display text; map the selected
  `condition.description` to `snapshot.description` with returned location.
- Use local icons for `clear`, `cloudy`, `rain`, `drizzle`, `thunderstorm`, `snow`,
  `mist`, and a neutral `other` fallback. Do not infer day/night or request
  provider icon URLs. Artwork supports, never replaces, visible condition text.
- Heading: **Forecast for the coming days**; explain "Three-hour forecast".
  Group every returned point by the selected city's local calendar date and
  preserve chronological order. Render all available groups, not daily averages.
- Compute local date/time from `forecastAt + timezoneOffsetSeconds`, formatting
  the shifted instant in UTC so the browser offset is not applied again.
  Use weekday/date headings and state the city's `UTC+/-HH:MM` offset (include
  seconds if supplied). This fixed offset is not an IANA timezone/DST guarantee.
- The five-day horizon may touch six local dates. First/last groups can be
  partial: label boundary coverage as "Available times: [first] to [last]" and
  note that boundary days may be partial. Never fill missing intervals or
  promise five complete calendar days.
- Show **Retrieved at** from `fetchedAt`, with explicit timezone context, apart
  from forecast valid time. Include OpenWeather attribution after verifying
  current product terms; weather requests go only through our backend.

## 5. Forecast-point controls and actions

- Each time point is a native button in a labeled day-group list, not a nested
  button or a tab interface. Accessible name includes date, local time,
  temperature, and condition; expose selection with `aria-pressed`.
- Selector: `shrink-0 w-28 min-h-40 rounded-full px-3 py-4`, with time at top,
  local icon in a 40 px circular well, temperature, and wrapping condition text.
  Height may grow for long descriptions; align items with stretch, not clipping.
- Unselected: white surface, navy temperature, muted label, visible
  `control-border` outline; hover adds a pale-blue tint.
  Selected: saturated `primary`, all-white text, selected shadow, and a visible
  **Selected** label so color is not the only cue. No layout-shifting scale effect.
- Only one point is selected across the forecast. Keyboard focus alone does not
  select; Enter/Space activates. Keep focused/selected points visible within
  the strip; avoid smooth scrolling when reduced motion is requested.
- Save forecast acts on the hero's explicitly dated selected point. Its accessible
  name includes that date/time. Anonymous users get a **Log in to save** link;
  selection remains available without authentication. If a save is pending,
  retain its target identity; completion must not mark a newly selected point
  saved. Show **Saved** only for a server-confirmed new or duplicate save.

## 6. Buttons, forms, and account screens

- Controls have at least 44 px targets: `min-h-11 px-5 rounded-2xl`.
  Primary: blue/white; hover darker blue. Secondary: white/navy with a visible
  control border; quiet links are underlined. Remove uses labeled danger text,
  not an unlabeled trash icon. Native buttons for actions, links for navigation.
- Disabled/loading buttons retain dimensions and a readable label, disallow
  duplicate submission, and announce "Logging in...", "Registering...",
  "Saving...", "Removing...", or "Logging out...". Do not reduce opacity on
  an entire form or replace the page with a skeleton for these actions.
- Search has persistent City and optional Country code labels plus Show forecast.
  City is 1-100 trimmed characters; country code is two letters. Validation
  follows the API; no fake suggestions or unrequested coordinate-entry workflow.
- Inputs: white, `min-h-11 rounded-2xl border px-4 py-3 text-base`, full width;
  associated helper/error text below. Placeholder is never the label.
- Login/register: centered white rounded panel on the blue canvas, simple heading,
  short supporting copy, email/password fields, full-width primary action, and
  a link to the alternate form. Preserve the lightweight shared header.
- Email allows password-manager autofill; use `autocomplete="email"`,
  `current-password` for login, `new-password` for register. Allow paste.
  API bounds: email at most 254 characters; password 12-128 Unicode code points,
  without trimming or invented composition rules. Avoid an HTML length rule
  that incorrectly treats UTF-16 code units as code points.
- Preserve nonsecret fields after failure; associate errors using
  `aria-invalid`/`aria-describedby`. Login failure is generic. Registration
  success leads to login with an **Account created** notice, not automatic login.

## 7. Saved forecast snapshots

- After login, show a secondary **Saved forecasts** section, in API list order.
  Use white rounded rows, subdued metadata, and a persistent
  **Saved forecast snapshot** text badge. Keep temperatures smaller than the hero
  (`text-2xl`); never style a snapshot as the live selected blue forecast point.
- Each row shows city/country, snapshot `forecastAt`, `temperatureC`,
  `description`, and **Saved at** from `createdAt`. Label both timestamps UTC:
  preferences carry no timezone offset. Do not infer condition-code icons from
  description text; snapshots do not contain `condition.code`.
- Separate **Open fresh forecast** and **Remove** buttons; stack on narrow screens.
  Reopening uses saved coordinates for a new backend forecast fetch every time,
  even if its selected timestamp has passed. Show hero/timeline loading; never
  copy snapshot values into fresh weather placeholders or overwrite the snapshot.
- Save/remove successes update state only after server confirmation. Failure
  leaves the saved list intact with an adjacent error. Expired sessions clear
  private data and offer login; never replay a failed mutation automatically.
  Logout is complete only after server confirmation.

## 8. Loading, empty, error, and success states

Skeletons use `skeleton` blocks on final surface shapes, matching the responsive
layout, padding, radii, and reserved space. Plain blocks only: no fabricated
city names, temperatures, weather icons/data, or progress percentages.

| Pending region | Skeleton layout |
| --- | --- |
| Session/auth bootstrap | Header account-label/action blocks reserving a 44 px control row; on auth screens keep the real form visible but unavailable until bootstrap succeeds |
| Main weather hero | Location/date lines, a 60/72 px temperature block, an illustration-sized block, and a 44 px action block inside the final rounded hero |
| Forecast groups/cards | Day-heading blocks and representative strips of the same `w-28 min-h-40` pill shapes; preserve the desktop right column and mobile strips |
| Saved forecast list | A few full-width rounded rows with title, snapshot/metadata lines, and action blocks; match the final mobile/desktop row arrangement |

- Hide skeleton decoration from assistive technology (`aria-hidden`); mark only
  the pending region `aria-busy` and announce a concise real loading message in
  a separate polite status region. Do not make placeholders focusable.
- Static placeholders are fine. If animated, use
  `motion-safe:animate-pulse motion-reduce:animate-none`; no flashing or essential
  motion. Reserve space via natural component sizes/min-heights, not fixed
  viewport heights or fake content.
- Skeletons appear only during an actual request, including fresh saved-location
  lookup. Before the first search, show a concise city-search prompt, not a
  permanent skeleton. For an independent refresh, affect only the pending region.
- Empty saved list: explain "Save a forecast point to see it here" with a route
  back to search. An anonymous save prompt is distinct from an empty private list.
  An empty/malformed forecast is an error under the API, not a sunny/zero result.
- No match: suggest checking city/country. Provider/network/timeout/quota failures:
  say the forecast could not be loaded and offer deliberate retry. Respect
  `Retry-After`; no rapid automatic retries. Account and saved operations remain
  usable during weather-provider failure.
- Session/list failures are explicit errors with retry, not anonymous/empty
  success. Field errors sit beside inputs; action errors beside their controls.
  Error surfaces use danger text/tint and a textual explanation, never color alone.
  Expose a sanitized request ID when available, not raw server/provider details.
- Prefer replacing old weather with skeletons on a new lookup. If retained after
  failure, label it **Previous forecast** with its actual city/retrieval time
  beside the error; do not call it the requested result. Ignore/cancel superseded
  searches so a late response cannot replace the newest selection.
- Success uses brief text: **Saved**, **Removed**, or **Account created**, announced
  politely. Do not shift the whole page or invent a toast system.

## 9. Focus and accessibility acceptance

- Target WCAG 2.2 AA: semantic landmarks/headings, skip link, persistent labels,
  keyboard access, visible text alternatives, and no color-only meaning.
- Interactive focus: `focus-visible:outline-2 focus-visible:outline-offset-4`
  with `primary` outline. On blue controls the white offset gap separates the
  ring. Do not clip focus rings inside scroll strips or remove native focus
  without a replacement. Decorative SVGs use `aria-hidden`; decorative images
  have empty alt text. Meaning stays in visible condition text.
- Selection does not move focus to the hero. Announce its updated forecast
  concisely; do not put the whole forecast/list in a live region. On navigation,
  focus the page heading; on invalid submit, focus the first invalid field;
  after removal, focus the next row's action or the saved-section heading.
- Before accepting frontend implementation, check 320/375 px mobile, 768 px
  intermediate, and 1024/1440 px desktop; 200% text zoom and 400% reflow;
  keyboard-only selection/scrolling/forms; screen-reader status/error behavior;
  contrast; reduced motion; and loading/empty/error/success layouts using
  controlled contract-shaped fixtures.

This is documentation only: no UI code, Tailwind installation, rendered visual
validation, runtime behavior verification, or accessibility certification.
