# Changelog

## The farmer flow, screen by screen

The farmer's daily path (add a farm, add a batch, check a photo for disease, log a harvest, share the lot, read the report) was opened in a real browser at desktop and phone width, with the harvest, QR and delete dialogs and a mocked disease result. Most of it held up. These are the fixes.

### Fixed
- **The words of an invalid field are in the language of the screen.** Only one of the 21 forms checked its fields itself. All the others showed the browser's own bubble ("Please fill out this field."), which follows the browser's language and not the app's. A new `ValidationMessages` sets the message in English, French or Kinyarwanda ("Fill in this field.", "Remplissez ce champ.", "Uzuza iki gice.") for a missing value, an email, a number range, a length and a pattern, and takes it away when the person edits the field. A message a page sets for itself is left alone. It covers every form at once.
- **The pager was English only** ("Showing 1 to 20 of 45", "Previous page", "Page 2"). It is in all three languages now.
- **The harvests page drew an empty pager panel** under a list that fits on one page (a stray line under the table).
- **"Healthy" on the disease check result** and in its confidence bars is said in the language of the screen, like everywhere else.
- **The batch code is in capitals on the farm page** (`#XCBPHXM3`), as on every other screen. It was lowercase in the batch table there.
- **The camera button and the photo drop zone have their own icons**, a camera and a photo, and no longer borrow the microscope of the menu.
- **The batch report** leaves room between the facts and the "Day 14 of 28" line.
- **A device is described once on the farm page.** Each room showed its sensors' names, status and last reading, and the Devices list below showed the same devices again. A room now says "1 sensor" with its status ("Online", "Offline", "Needs attention", or "1 of 2 online" when they differ), and the words link down to the Devices list, which keeps the name, the readings, when it was last seen and the Details button.
- **Dialogs keep their header and buttons in place and scroll only the body.** A tall dialog such as Edit farm used to scroll as a whole, so Save needed a scroll on a short screen. The box is now a column: the title and the buttons stay, the body scrolls with a soft shadow at the edge where more is hidden, and the scroll does not pass to the page behind. One change covers every dialog, because they already pass their buttons as a footer. On a phone the sheet is sized by the visible height (`dvh`) and keeps its buttons clear of the home bar. Printing the QR code is unchanged.

### Looked at and left alone
The add farm and add batch forms, the disease check upload and result, the harvest records page and its dialog, the QR dialog, the report, the edit farm, add room and delete farm dialogs, and the phone layouts all held up. On a phone a dialog becomes a bottom sheet.

### How it is guarded
`components/ui/ValidationMessages.test.tsx` and `appValidation.test.ts`, `components/ui/Pagination.test.tsx`, `styles/modal.test.ts`, and new cases in the tests for the harvests page, the farm page, the disease check and the icons. No backend change.

## Kinyarwanda dates, and the rest of the screen review

The second half of the screen review: French and Kinyarwanda on the farmer and admin screens, and a contrast check of the farmer, supervisor and admin screens in the light and the dark theme (all three roles pass AA, apart from the one fix below).

### Dates in Kinyarwanda
Browsers have no Kinyarwanda date data, so every date in Kinyarwanda showed English months ("Nov 25, 2026"), and the calendar showed "Mon Tue Wed". A new `dateFormat(locale, options)` writes Kinyarwanda month and weekday names, in the order people write them (day, month, year, a 24 hour clock): "25 Ugu 2026", "Ugushyingo 2026", "Kuwa gatatu 25 Ugushyingo 2026", and the calendar header "Mbe Kab Gtu Kan Gnu Gnd Cyu". English and French are still the browser's own formatter, unchanged. All 45 places that wrote a date now go through it, and a test fails if a screen calls the browser's formatter directly. The Kinyarwanda names are my drafts for a native reader to review, like the rest of the Kinyarwanda texts.

### Fixed
- **"Healthy" in a check result** is now said in the language of the screen ("Sains", "Bizima") in the tables, the lot page, the calendar and the reports. A disease keeps the name the model gives it (Grasserie).
- **The count on a quick action** sits on the corner of the card, so a long word such as "Ibiburaniswa" keeps the whole width of its card and is no longer cut in two.
- **The small line under a name in a table** wraps on a phone. A cut "Dernière mesure: 25.5 °C, 75 ..." hid the number it was there to show.
- **The top bar title** wraps to two lines instead of an ellipsis ("Tableau de bord de l'administration" on a phone).
- **The days of other months in the calendar** have AA contrast (3.7 to 1 before).

### How it is guarded
`utils/dateFormat.test.ts` and `dateFormatUse.test.ts`, `utils/resultLabel.test.ts`, and style guards in `styles/layout.test.ts`, `phoneText.test.ts`, `labels.test.ts` and `calendar.test.ts`. No backend change.

## A look at every screen, in a real browser

A pass over the farmer, supervisor, admin, sign in and public screens at desktop and phone width, in the light and dark themes and in French and Kinyarwanda. It found one real bug and a handful of rough edges, all fixed here.

### Fixed
- **The staff lot trace sent no token on its first try.** The client kept the sign in token from any address with `/lots/` in it, because the public QR page lives at `/lots/<token>`. The staff page `/supply/lots/<code>` has the same piece in its address, so its first request always got a 401 and only worked after a token refresh. A support session, which cannot refresh, was refused outright. Public addresses are now matched from the start of the address.
- **The egg lot page:** the five counts sit in one row (not three and two), the "Disease found" and "Open alert" badges have a gap between them, and a batch with no quantity no longer shows a lone dash.
- **The admin quick actions** split into two even rows of four (not seven and one), and a word is never broken in the middle ("Cooperative / s"). Six actions fill their row on a wide screen.
- **Filter bars** (logs, for example): the search box, the select and the inputs share one height and line up.
- **Stat tiles stay two across on a phone**, and an odd last tile runs across the row, so three or four counts no longer push the content far down the screen.
- **A dead public lot link** is laid out like the 404 page, centred, with a Go home button.

### Looked at and left alone
French and Kinyarwanda showed no clipped or overflowing text on the supervisor screens at either width. The raw stage names in server-written alert texts ("updated to HARVEST") stay as they are, because those texts are English only.

### How it is guarded
A test for the client's token rule in `services/api.test.ts`, and style guards in `styles/layout.test.ts`, `badgeRow.test.ts` and `phoneTiles.test.ts`.

## A modern code screen for the second step

The admin's code screen now shows the 6 digit code as six rounded boxes, in two groups of three, with a ring and a blinking cursor on the next box. The same boxes are used when an admin sets up the authenticator and in the in-app prompt that asks for a code before a sensitive action. A new `CodeInput` component draws them over one real field, so pasting, the code from a message, autofill and screen readers work as for any field. It keeps digits only (a pasted "123 456" is tidied), stops at six, turns the boxes red after a wrong code and clears that mark as soon as the person types again.

The buttons under the field were stuck together. Verify and the second choice are now a group with a gap, and the second choice ("Use a recovery code") is a quiet text button rather than a second big pill. Verify stays off until six digits are typed. Reduced motion is respected (no blinking cursor). The sign in pages keep their own colours whatever theme the app is set to. A dead duplicate `.l-auth__actions` rule was removed. Guards in `styles/codeInput.test.ts`; no backend change and no new words.

## Tab rows that scroll cleanly

A small addition to the shell slice. A row of tabs can be wider than a phone (the stage tabs on the batches page, the status tabs on devices, the settings tabs). It now scrolls sideways without a scrollbar and snaps to a tab. Each tab shows a gold focus ring for keyboard use, takes its size from the type scale, and the line under the chosen tab slides in instead of appearing. CSS only, with a guard in `styles/tabs.test.ts`.

I also walked every screen at phone width for the farmer, supervisor, admin, settings, sign-in and public pages. None overflowed the page, none had text under 11 px outside the landing page's miniature report, none had an unnamed control and each had one heading.

## Batches list: how long is left

A small addition to the shell slice. The batches list shows the date a harvest is expected, and now also how long is left, so a farmer sees at a glance which batch is next. Under the date it says "15 days left", "Due tomorrow", "Due today", "1 day overdue" or "3 days overdue". A batch already at the harvest stage shows nothing, because its stage says it. The hint is plain text (amber when due today or tomorrow, red when overdue, never colour alone), counted in whole days on the person's own calendar, and available in English, French and Kinyarwanda (drafts). New helper `utils/harvestHint.ts`, with tests, and a style guard for the hint. No backend change.

## Shell polish: quiet labels and a pressed state on every control

Step 2 of the interface renewal. It finishes the rules the foundation set, for the sidebar, the top bar, the bottom bar and every small label in the app.

### What changed
- **Sentence case everywhere.** No label in the app is set in capitals any more: the sidebar groups ("Overview", "Farming", "Monitoring", "Account"), the top bar's section line, the quick search kinds, facts, sub-headings, filter fields, comparison groups and the evidence heading. Labels that were tracked out to 0.12 to 0.18 em are now tracked at 0.02 em.
- **Nothing under 11 px.** Text that was 10.5 px is now 12 px (the type scale's smallest step).
- **The sidebar group label is readable.** It was 40 percent white on forest ink, which is under the AA ratio for small text. It is 62 percent now, and a test holds it at 4.5 to 1.
- **Every transition in the shell takes its time from the duration tokens**, with no literal times left in the app stylesheets.
- **Pressed states.** The sidebar items, the top bar buttons, the profile button and the bottom bar items press in by 2 percent (only for people who have not asked for less motion) and show a pressed colour.
- **The bottom bar wraps a long name onto a second line** ("Disease checks") instead of cutting it with an ellipsis.
- The new message dot on the bell uses the danger token instead of a hand written colour.

### How it is guarded
`styles/labels.test.ts` fails if any app stylesheet sets capitals, tracks a label wider than 0.1 em, sets text under 11 px or uses a literal transition time, if the sidebar group label drops under 4.5 to 1, if a shell control loses its pressed state, or if the bottom bar goes back to cutting a name with an ellipsis.

### Not changed
No words, no layout and no behaviour. CSS only.

### Checks
Style and layout tests (312) pass. Looked at in the browser: the sidebar and top bar at 1700 px in the light theme, and the phone bottom bar at 390 px. The full frontend suite, `tsc`, ESLint and the build are run before the pull request.

## Dashboards with a farm calendar and quick actions

The farmer, supervisor and admin dashboards are rebuilt around what needs a person today, then where they go most, then the data, with the farm calendar beside it. This is steps 3 and 4 of the interface renewal (`docs/superpowers/specs/2026-11-09-ui-renewal-design.md`, plan `2026-11-09-dashboards.md`, local only). It uses the calendar feed from the previous step and the look from the foundation step.

### What it does
- **Farm calendar.** A month grid on wide screens with the events of the chosen day under it, and an agenda of the next 14 days on phones. Events are batches started, expected harvests (the date a person typed), stage changes, disease checks, recorded harvests, and for supply rounds the day requests close and the delivery day. Every event is also written as text, a day's name says how many events it holds, and the colours of the dots are never the only sign. The keyboard moves by day (left, right), by week (up, down), to the start and end of the week (Home, End) and by month (PageUp, PageDown), with one day in the tab order. Names are shown as plain text. Staff can open a round from its event, a farmer cannot.
- **Quick actions.** Six to eight links per role, named with the same word as the sidebar, with the number of unread alerts where it matters. A farmer: farms, batches, disease checks, harvests, alerts, compare. A supervisor: decisions, supply, cooperative, alerts, disease checks, compare. An admin: users, cooperatives, messages, system, alerts, audit log, disease checks, farm monitoring. An admin looking at every farm on the supervisor page gets a monitoring set.
- **Layout.** A strip of what needs attention, quick actions, then the data in the main column and the calendar in a rail from 1100 px wide (the rail stays in view as the page scrolls). On a phone it is one column with the calendar first. Beside the rail the main column is narrow, so side by side pairs stack until the screen is 1600 px wide.
- **Nothing is shown twice.** The buttons that duplicated the quick actions in the page headers are gone. The farmer's header keeps only "New farm", and the admin's old "Quick actions" list panel and its styles are replaced by the shared component.
- If the calendar cannot load, it says so with Try again and the rest of the page is unchanged. A farmer who has nothing yet still sees only the first steps.

### How it is built
`services/calendar.service.ts`, `components/calendar/FarmCalendar.tsx` with `calendarDays.ts` (whole days written like 2026-11-05, never moments, so a time zone cannot move an event), and `components/dashboard/QuickActions.tsx`. The window asked of the server is the whole grid plus today and the next 13 days when that fits in 100 days. An older answer never replaces a newer one when a person moves quickly between months. New words (prefix `cal` and `qaTitle`) are in English, French and Kinyarwanda (drafts for native review). Style guard tests (`calendar.test.ts`, `layout.test.ts`) keep the 44 px targets, the focus ring, token only colours and the phone and wide screen rules.

### Numbers to confirm
French and Kinyarwanda words are drafts. The week starts on Monday.

### Not built
Events a person adds themselves (cleaning, leaf buying), reminders, a month browser on phones (the agenda shows the next 14 days only), and the supervisor and admin "today" strips with trends. The rest of the pages follow in the next steps.

### Checks
- Frontend 2386 tests in the full run (plus one style guard added after it, run with its neighbours), `tsc`, ESLint and `npm run build` clean. The backend is unchanged in this step (the calendar feed was the previous one).
- Browser check against a scratch database with demo data: the farmer dashboard in the light theme at 1280 px (the main column 758 px with the 340 px calendar rail beside it, 42 days with events on 8 of them, the agenda hidden, no sideways overflow), the keyboard on the real page (arrows, Home, End, PageUp and PageDown, with the focus following the chosen day), a day with an event showing its text and a link to the batch, the farmer dashboard on a phone at 390 px (quick actions in two columns, the agenda before the data, the grid hidden, no overflow), the supervisor dashboard in the dark theme, and English, French and Kinyarwanda. It found one thing: on a phone the month buttons were shown although the grid is hidden, so they are now hidden there, with a test first.
- Not checked in a browser: the admin dashboard (an admin sign in needs the second factor, so it is covered by unit tests), tablet width, a screen reader, and French text length in every card. Dates in Kinyarwanda show in English, as they do across the app today.

## Farm calendar feed

The first half of the farm calendar: one read route that lists the dated events of the farms a person may see. The calendar panel and the rebuilt dashboards use it and come next. The plan is `docs/superpowers/plans/2026-11-09-calendar.md` (local only), from the design agreed in phase 9 of the security and supply plan.

### What it does
`GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` answers `{events, from, to, truncated}`. Each event has a date, a kind, whether it is expected, and the batch, farm and a small detail the page needs to word it. The kinds are: batch started, harvest expected, stage changed, disease check, harvest recorded, round deadline and round delivery. Nothing is predicted. The only future harvest date is the one a person typed when they made the batch, because how long a cycle takes is not ours to guess.

### How it is built
- `core/farm_calendar.py` builds the events from records that already exist, narrowed by `core.access` like every other list: a farmer sees their own batches, a supervisor their cooperative's, an admin everything. An archived batch is left out with its checks and harvests. A draft or cancelled round is left out, and a farmer sees a delivery only for a round they have an approved, part approved or received request in.
- The window is at most 100 days, both end days included, and defaults to the current month. A bad window answers 422 with a reason, like every other bad parameter. At most 500 events are returned, earliest first, and `truncated` says so.
- The number of queries stays flat as batches grow (a test holds it). Naive dates from an older database are handled.
- One new permission row (`calendar`, all roles) and a row in the authorization matrix. No migration, no new model.

### Not built
The panel and the dashboards (next). Events a person adds themselves (cleaning, leaf buying). Reminders by email or SMS. Calendar subscription files.

### Checks
Backend 3510 tests, `ruff` clean. The frontend is untouched in this step.

## UI foundation: one product in light and dark

First step of the interface renewal (`docs/superpowers/specs/2026-11-09-ui-renewal-design.md` and the plan `2026-11-09-ui-foundation.md`, local only). The owner asked for a premium, consistent app, the whole app page by page, refining the identity that exists. This step changes only the shared layer, so every page picks it up. Dashboards, the calendar and the pages follow as their own pull requests.

### What changed
- **The dark theme matches the light one.** Light is warm paper with a forest ink sidebar and gold. Dark was neutral black with a black sidebar, so the two felt like different products. Dark is now "forest night": near black, tinted to the same green family at a very low chroma, with the forest ink sidebar and the same gold. This replaces the neutral black of the earlier dark theme PR (#103) on purpose; going back is one block of tokens in `index.css`.
- **Scales.** Tokens for a type scale (eight steps, 15 px body), a 4 px spacing scale (twelve steps) and three elevation levels (flat, raised, floating) with an edge highlight that differs per theme.
- **Controls.** Buttons have hover, pressed and keyboard focus states, press in by 2 percent, and take their times from the duration tokens. The danger button is drawn from tokens so it reads in both themes. Form fields show the focus ring for the keyboard as well as the mouse and are at least 44 px tall.
- **Hierarchy.** Cards, panels, tiles and chart cards separate by a hairline, a top edge of light and a soft shadow, the same everywhere. Only a card that can be clicked reacts to the pointer. Tile and column labels are sentence case, and tile values and table cells use tabular figures.
- **Motion.** Content rises in when a page opens (a 6 px lift and a fade, the first eight items stepping by 40 ms) on every page that uses the content stack. It moves only opacity and position. The loading skeleton card now matches the real card, so nothing jumps.
- All motion is inside `prefers-reduced-motion: no-preference`, so a person who asked for less sees none of it.

### How it is guarded
Five style test files (`themeTokens`, `scales`, `controls`, `hierarchy`, `entrance`) read the stylesheets: text pairs at 4.5 to 1 in both themes, the dark tint, the sidebar and gold parity, the scales, the states of every button variant, tokens instead of raw colours, motion only for people who allow it. They fail if a later change breaks the rules.

### Numbers
Frontend 2307 tests. `tsc`, ESLint and `npm run build` clean. No backend change.

### Checks
Looked at in the browser in the dark theme (supervisor and farmer dashboards, a phone width form page): tiles and cards read cleanly, the sidebar is forest ink, the entrance runs and ends fully visible. The light theme was looked at before the control and hierarchy steps and is covered by the contrast tests after them, but not looked at again on screen. Not checked: French and Kinyarwanda wording (no words changed), keyboard use of every control, tablet width.

### Not yet
The supervisor and admin dashboards still use raw grids with inline spacing, so they have no entrance motion until their redesign. Hover and press feel on tables rows, tabs and the shell, and the calendar, come in the next steps.

## API documentation

The API now describes itself, and a Swagger page shows it. This is item F1 of the plan, rebuilt clean after the old Postman PR (#13) was closed over secrets. The plan is `docs/superpowers/plans/2026-11-09-api-docs.md` (local only). The branch `feature/api-docs` is cut from master.

### What it does
- `/api/docs/` is a Swagger page and `/api/schema/` is the OpenAPI JSON (for Postman, Insomnia or a client generator). `python manage.py spectacular --file openapi.yaml` writes a YAML file.
- Each of the 130 or so routes shows what it does, whether it needs a sign in, **who may call it** (Farmer, Supervisor, Admin), and the answers it can give.
- The README's route table, which listed 18 of about 150 routes, is replaced by a pointer to the docs.

### How it is built
- `drf-spectacular` builds the schema, and `core/api_schema.py` makes it honest about this code. Most views build their answers as plain dictionaries, so the generator could guess no request or response bodies (129 errors in a probe). The schema class documents what the code does know: the docstring as summary and description (the sentence for each method where a view does several things), the tag from the path, the bearer scheme (and no lock on public routes), one success envelope and one error envelope, and the roles read from `core/permissions_table.py`, the table the guard itself uses, so the docs cannot disagree with it.
- An error answer is listed only when it can happen: 401 on a signed in route, 403 when some role is refused, 404 when the path names a record, 422 on a write, 429 always. `/api/health` and the alert stream are plain Django functions, so a hook adds them.
- The page loads Swagger from files served by the API itself (`drf-spectacular-sidecar`), so it needs no outside host. It has its own policy with a script nonce that changes on every response, with no inline script allowed. Every other route keeps `default-src 'none'`. Only two files can be fetched under `/api/docs/assets/`.
- `API_DOCS_ENABLED=false` switches all three addresses off (404). They are on by default.
- Tests fail on any generator warning, on a route missing from the schema, on a summary that is a stub or shows a body shape, on an example value (so no credentials), and on a change to the policy.
- No migration, no new model. Two packages added and pinned, `pip-audit` clean.

### Not built
- Request and response bodies of individual routes. The views build them as dictionaries, so the page lists the envelope and the field names that the description mentions. Adding serializers route by route would be a separate, larger piece of work.
- A few summaries still read awkwardly (for example "Is a farmer asking for a different amount") because they come from the views' own sentences.
- A rate limit on the three docs addresses (they are plain Django views, cached and cheap).

### Checks
- Backend 3508 tests in the full run (plus 3 added after it, run with their neighbours, 29 passing), `ruff` and `pip-audit` clean. The frontend is untouched.
- A browser check against a scratch database: the page loads the CSS, script and schema from the API itself with no console error and nothing blocked; 161 operations in the list; an operation shows "Who may call this: Admin." and the answers 401, 403, 429 and 2XX; the Authorize dialog accepts a real token; "Try it out" on `/api/farms/risk` returned the success envelope with the bearer header in the curl line. `scripts/smoke_deploy.py` passes against it.
- It found one thing: Swagger warned that an underscore in a deep link means a space and will stop working, so operation ids are now plain camelCase (for example `getSupplyLotsByLotCode`). In the browser pane Swagger's list only drew its first group until the pane was shown, which is the pane, not the docs.
- Not checked: the page on a phone, keyboard use, and the live site (this is not deployed yet).

## Lot tracing

A disease on one farm now leads to every other farm that got the same lot of eggs. This is step 6, the last step of the egg supply design (`docs/superpowers/specs/2026-11-06-egg-supply-design.md`, local only). The plan is `docs/superpowers/plans/2026-11-09-lot-tracing.md` (local only). The branch `feature/lot-tracing` is cut from master.

### What it does
- **A supervisor or admin** opens an "Egg lot" page that lists every batch of the lot: the farmer, farm and room, the stage and quantity, how the batch is doing, and the last disease check with its date. Disease first, then batches nobody has checked, then healthy ones. Counts at the top: batches, farms, with disease, healthy, not checked.
- **How to get there:** from a row on Disease checks, and from the lot code on a batch page. A farmer sees their own lot code as plain text and is never led to other farmers.
- **"How it is doing"** comes from the latest check only, so a batch that recovered reads healthy. A batch nobody has checked reads "Not checked", never healthy. An open disease alert is marked.

### How it is built
- `supply/tracing.py` builds the trace and reaches only what `core.access.scope_batches` allows, so a supervisor sees their own cooperative. A lot of another cooperative and a lot that does not exist both answer 404 with the same message.
- One read route, `GET /api/supply/lots/<lot_code>` (staff only), in the authorization matrix. It changes nothing, so support access is unaffected.
- The batch payloads and each disease check row now carry `lotCode`.
- No migration, no new model.

### Numbers to confirm
Nothing new. The French and Kinyarwanda texts are drafts for native review ("Egg lot" is a new term in all three languages).

### Not built
- An alert to supervisors when a disease appears on a lot that other farms share (the page is for looking, not for being told).
- Tracing back from a harvest or a cocoon lot (the QR page), and a search box for lot codes.
- Pausing a round from the lot page.

### Checks
- Backend 3481 tests, frontend 2262 tests (plus one page title test added after that full run, run with its neighbours, 303 passing), `ruff`, `tsc`, ESLint and `npm run build` clean.
- A browser check on a scratch database with a supervisor, three farmers in one lot (one with Grasserie and an open alert, one healthy, one never checked) and the other cooperative's supervisor: the link from a disease check row, the lot page with the rows in the right order and each status in words, the link from a batch page, a farmer seeing the lot code as plain text with no link and being refused the lot address, the other cooperative's supervisor getting "We could not find that lot.", and English, French and Kinyarwanda. It found one defect: the lot page had no entry in the page title table, so the browser tab and top bar used the product name. It now reads "Egg lot", fixed with a test first. The count tiles showed 0 in the hidden browser pane because its animation frames do not run, which is an artifact of the pane. Not checked in a browser: keyboard use of the lot page, mobile width, and a screen reader.
- Wording for the native review: "lot" is also the French word for a batch, and the Kinyarwanda "isarura" is already used for the harvest lot on the QR page. "Egg lot" may need a clearer term in both.
## Getting started list and earned allowances

A new farmer now sees what to do next, and a farmer who finishes a good lot can earn one more box. This is step 5 of the egg supply design (`docs/superpowers/specs/2026-11-06-egg-supply-design.md`, local only). The plan is `docs/superpowers/plans/2026-11-07-onboarding-and-nudges.md` (local only). The branch `feature/onboarding-and-nudges` is cut from master, after the supply rounds were merged.

### What it does
- **A farmer** sees "Getting started" on the dashboard (also on the first-run page): join a cooperative, add a farm, add a room and get it approved, get eggs. The first step not done is marked Next (or Waiting, when someone else has to act, with their names), the rest Later. A rejected room shows the reason and what to change. A farmer who was not given eggs is told so, with the reason. The list goes away once the farmer has eggs or a running batch.
- **A supervisor** sees an "earned allowance" in the Decisions inbox under Allowance: "{name} has earned more. Finished lot {code}. Suggested allowance: {n} boxes (now {m})." "Approve" raises the allowance by one box, writes the allowance history and emails the farmer once. "Not now" closes it and tells nobody.

### How it is built
- **The checklist** is one function, `supply/onboarding.py`, behind `GET /api/supply/onboarding`. It returns states and the facts to word them, and the page words them in English, French and Kinyarwanda.
- **The rule for an earned allowance** is written at the top of `supply/nudges.py`: the farmer is still in the cooperative that ran the round, used all of their allowance, the lot has no open disease alert, no allowance request waits, there is no suggestion for the lot yet, and one more box stays under 100 and within what their rooms hold when that is known. The step is one box.
- **It never blocks a harvest.** The check runs after the harvest is saved, and an error is logged and dropped.
- **Deciding is safe against two people at once**: a conditional UPDATE, so one wins and the other gets a 409. An approval whose allowance has moved since, or whose farmer has left the cooperative, is closed as no longer applicable.
- **Models.** `AllowanceSuggestion` (one per lot, held by the database), migration `supply.0003`. The decisions count gains `nudges`.

### Numbers to confirm
- The default allowance of 2 boxes and the empty space per box are kept, by the owner's decision of 2026-11-07, until real data arrives. The rule uses no mortality, because that needs the worms per box that a sericulture officer must give.
- The French and Kinyarwanda texts are drafts for native review.

### Not built
- A larger step than one box, a score or a record of past lots, and a reminder email to a supervisor who leaves a suggestion waiting.
- A screen to see the suggestions that were dismissed.

### Checks
- Backend 3461 tests, frontend 2242 tests, `ruff`, `tsc`, ESLint and `npm run build` clean.
- A browser check on a scratch database with a supervisor, two farmers, a new farmer with nothing and the other cooperative's supervisor: the new farmer's list at each step (join, farm, room waiting for the supervisor by name, room not approved with the reason, room approved, round open, request approved with day and place, done), then a lot harvested by a farmer who had used all of her allowance, the suggestion showing in the Decisions inbox with the right text in English, French and Kinyarwanda, "Approve" raising the allowance from 2 to 3 with the history line and one email, "Not now" leaving the allowance at 2 and sending nothing, and the other cooperative's supervisor seeing no suggestion. It found no defect. Not checked in the browser: the email in a mail app, an admin's view (an admin sign in needs the second factor), and the checklist with a screen reader. A room that was not approved now links back to its farm page, added after the check with a test first.

## Supply rounds and egg requests

The cooperative hands out eggs in scheduled rounds. A farmer asks inside what their allowance and rooms allow, the supervisor confirms a fair split, and a batch is made, with a lot code, when the farmer confirms the eggs arrived. This is step 3 of the egg supply design (`docs/superpowers/specs/2026-11-06-egg-supply-design.md`, local only). The plan is `docs/superpowers/plans/2026-11-07-supply-rounds.md` (local only). The branch `feature/supply-rounds` is cut from `feature/decisions-inbox`, so four branches now form one stack.

### What it does
- **A supervisor** makes a round (name, boxes, request deadline, delivery day and place, expected harvest), opens it (every farmer is emailed and the round gets a lot code), closes the requests, edits the proposed split with a live total against the stock, confirms it, records receipts for farmers, marks eggs not collected, pauses and cancels (with a reason). The Supply page and a "Supply" menu item are new, and a closed round with requests shows in the Decisions inbox.
- **A farmer** sees "Egg supply" on the dashboard: the round, the deadline, the delivery day and place, and their request as a short timeline in plain words. They request eggs (the dialog says what they can ask for and why, before sending), cancel, and confirm receipt with the quantity and the condition.
- **The batch** is made only when the eggs are received: in the room asked for, at the egg stage, in boxes, with the round's lot code and expected harvest date. Approval is a promise, receipt is the fact.
- Everyone who needs to know is emailed once: farmers when a round opens, requesters when the split is confirmed or the round is cancelled, and a farmer when a supervisor records their receipt.

### How it is built
- **Two pure functions** do the arithmetic. `request_limit` is the smallest of the allowance, the room's free space and the stock. `propose_split` shares a short stock in proportion, in whole boxes by the largest remainder, ties to the earlier request, never passing the stock or what anyone asked or can take. Both have property tests.
- **One module changes the state.** `supply/rounds.py` holds every rule. Anything two people could do at once (confirm, receive, cancel) is one conditional UPDATE, so one wins and the other gets a clear 409. Receipt makes exactly one batch.
- **Scope.** A supervisor reaches only their cooperative's rounds, a farmer only their own request, and the rest is "not found". The new write routes are refused in support access by default.
- **Models.** `SupplyRound`, `EggRequest` (one active request per farmer per round, held by the database), `Batch.lot_code`, and `SupplySettings.one_open_batch_per_room` (on by default).
- **The decisions count** now includes rounds to split.

### Numbers to confirm
The space one box needs stays empty until a sericulture officer gives it. While it is empty, no room cap is applied and the dialog says so. "One open batch per room" is on for every cooperative and has no screen yet.

### Not built
- The automatic return of uncollected eggs after a number of days (marked by hand for now), and the priority for a good record (it needs the worms per box that a sericulture officer must give).
- A screen to switch "one open batch per room" off, and a Supply page that lets an admin name a cooperative to make a round (an admin uses the API).
- Young worm (chawki) rounds, SMS, and the calendar.

### Checks
- Backend 3404 tests, frontend 2214 tests, `ruff`, `tsc`, ESLint and `npm run build` clean. One frontend test (`PublicLotPage` title) failed under full suite load and passes alone, as it did before.
- A browser check on a scratch database with a supervisor, two farmers and the other cooperative's supervisor: making a round (three refusals first), opening it (lot code shown), requests with the over-limit refusal, the other cooperative getting 404, closing, the proposed split (4 of 3 boxes refused, more than asked refused), confirming, a receipt recorded for one farmer (damaged), the batch made (egg stage, the right room, the lot code, the round's harvest date), the other farmer confirming receipt (3 refused, 2 accepted), the round becoming done, a second round cancelled with a reason, and the farmer and supervisor screens in English, French and Kinyarwanda. It found one defect: a farmer whose rooms had no space was still offered "Request eggs", which could only fail. The card now says "None of your rooms has space for eggs now.", fixed with a test first. Not checked in the browser: the emails in a mail app, an admin's view (an admin sign in needs the second factor), and keyboard use of the new dialogs beyond what the shared dialog already does.
- The French and Kinyarwanda texts are drafts for native review.
- Migrations: `supply.0002_rounds_and_requests`, `batches.0005_batch_lot_code`. They only add things. Run `python manage.py migrate` (the build does it).

## Decisions inbox

One screen where a supervisor or an admin decides what waits for them. It is the screen that room approval and the allowance were missing, so the three branches (`feature/room-approval`, `feature/allowance`, `feature/decisions-inbox`) now form one stack that can be merged. The plan is `docs/superpowers/plans/2026-11-06-decisions-inbox.md` (local only). It was built before step 3 of the egg supply design (rounds and requests), against the order in the design, because rooms and allowance could not ship without it. Step 3 adds egg requests to the same screen.

### What it does
- A "Decisions" item in the menu, right under the dashboard, with the number that wait. The supervisor and admin dashboards carry a line "{n} decisions wait for you". Neither shows when nothing waits.
- The page lists new rooms, room size changes and allowance requests together, the one waiting longest first, with filters and counts.
- A room is approved at once or rejected with a reason. A request is approved at the amount asked, approved at another amount (with an optional note), or declined with a reason. The farmer is told each time.
- "See details" on a request shows the evidence: the farmer's history of amounts, and their rooms with each size and what it can hold.
- When another supervisor decided first, the page says so and refreshes. The reviewer emails now open this page.

### How it is built
- **Two small endpoints.** `GET /api/team/decisions` counts rooms and requests for the caller, and `GET /api/supply/allowance/farmers/<id>` gives the evidence. Both are scoped as the other team routes are: a supervisor reaches their own cooperative, an admin all, a farmer neither. `supply/allowance.py` gained `waiting_requests`, which the request list and the count share.
- **One page over existing endpoints.** The list, the room review and the request decision were built with the two earlier branches. The count in the menu is taken as the page changes and when the page decides something (`ssms:decisions`).
- Everything a farmer typed is plain text. Reasons are required to refuse, and checked before they are sent.

### Not built
A filter by cooperative for admins, bulk approval, a history of past decisions, and push or SMS notices. Egg requests join the screen in step 3, and the nudges in step 5.

### Checks
- Backend 3020 tests, frontend 2122 tests, `ruff`, `tsc`, ESLint and `npm run build` clean.
- A browser check on a scratch database with a farmer and two supervisors: the dashboard line and the menu badge, the page with its filters, a room approved, a room rejected with a reason, a request approved at another amount (an amount of 101 refused first), a request declined with a reason, a stale click answered with "Someone decided this already." with the list and badge refreshed, the empty state, the other cooperative's count at zero and a farmer refused, and the page in English, French and Kinyarwanda. It found one defect, an empty "History" heading for a farmer still on the default amount, fixed with a test first. Not checked in the browser: an admin's view (an admin sign in needs the second factor, so it is covered by unit tests), the emails in a mail app, and keyboard use of the new dialogs beyond what the shared dialog already does.
- The French and Kinyarwanda texts are drafts for native review.
- No migration.

## Allowance

Every farmer now has a fixed number of egg boxes they may take per round, set by the cooperative and changed only by a request or a reduction, with a history of every change. This is step 2 of the egg supply design (`docs/superpowers/specs/2026-11-06-egg-supply-design.md`, local only). The plan is `docs/superpowers/plans/2026-11-06-allowance.md` (local only). The branch `feature/allowance` is cut from `feature/room-approval` (the capacity hint reads approved room sizes). The Decisions inbox (the next entry up) gives it, and room approval, their screen.

### What it does
- The cooperative has a default amount for a new farmer. An admin edits it on the cooperative's Details tab. The invitation can carry another amount (0 to 100), which the supervisor types in the invite dialog.
- A farmer sees "Your allowance" on the dashboard: the amount, where it came from, the last change in words, and one button, "Ask for a different amount". The dialog says why it refuses before sending (not a whole number from 0 to 100, the same amount, a reason under 10 or over 500 characters).
- A supervisor of the farmer's cooperative (or an admin, when there is none) approves the amount asked, approves another amount, or declines with a reason. The farmer is emailed each time. One request waits at a time and the farmer can withdraw it.
- A supervisor can lower an allowance with a reason from the Farmers tab, and never raise one. An admin may set any amount through the API.
- Every change is a line of history (start, amendment, reduction) with who and why. The supervisors are emailed when a request arrives, and the farmer when a decision or a direct change is made.

### How it is built
- **One module changes the amount.** `supply/allowance.py` holds `current`, `set_start`, `lower`, `set_as_admin`, `ask`, `withdraw`, `decide`, `for_farmers`. A decision is one conditional UPDATE, so two supervisors deciding the same request cannot both win. The second gets 409 and no second email.
- **No row means the default.** A farmer who joined before has no row and has the cooperative default. The first change writes the default into the history before the change. A row is valid only for the cooperative it was set in, so a farmer moved to another cooperative starts again.
- **Capacity helper.** `supply/capacity.py` works out what a farmer's approved rooms can hold from the space one box needs. It answers "not known" until that number is set, and step 3 uses it for the request limit.
- **Shared reviewers.** `cooperatives/reviewers.py` (`reviewers_of`) is the rule "supervisors of the cooperative, else every active admin", now used by room approval and the allowance.
- **Wire format.** `GET /api/supply/allowance`, `POST /api/supply/allowance/requests`, `DELETE .../requests/<id>`, `GET .../requests` (staff), `POST .../requests/<id>/decision`, `PATCH /api/supply/allowance/farmers/<id>`, `GET` and `PATCH /api/supply/settings`. Refusals carry a `code`. A supervisor reaches only their cooperative, and what is outside it is "not found". The new write routes are refused in support access by default.
- **Audit log.** Each request, withdrawal, decision, direct change and settings change.

### Numbers to confirm
- The default of 2 boxes is a first guess from the design example. Confirm it per cooperative.
- "Space one box needs (m²)" is empty on purpose, until a sericulture officer gives the number. Nothing is worked out from room sizes while it is empty.

### Not built
- A Change dialog for an admin on one farmer (the admin has no farmers tab, and uses the API), the nudges (step 5, the `suggestion` history kind is already declared), rounds and requests for eggs (step 3), and the other settings of the design (worms per box, pickup days, the two switches), which arrive with the step that uses them.

### Checks
- Backend 3003 tests, frontend 2082 tests, `ruff`, `tsc`, ESLint and `npm run build` clean.
- A browser check on a scratch database: the card with the cooperative default, both refusals in the ask dialog, a request with markup in the reason shown as plain text, the other cooperative's supervisor seeing nothing and getting 404, the farmer getting 403, a different amount granted, the second decision getting 409, the card in English, French and Kinyarwanda with the change in words, the invite dialog refusing 101 and sending 4, a farmer joining by that link and showing as set (not default), "Starts with 4 boxes" on the invitation, Lower refusing a higher amount and lowering with a reason, and the history reading start, amendment, reduction. Not checked in the browser: the admin's settings block (an admin sign in needs the second factor, so it is covered by unit tests only), the emails in a mail app, and the decision screen (it does not exist yet). The browser pane was not drawing during the check, so a closing dialog stayed on screen, which is the pane and not the page.
- The French and Kinyarwanda texts are drafts for native review.
- Migrations: `supply.0001_initial`, `cooperatives.0003_invitation_starter_boxes`. They only add things. Run `python manage.py migrate` (the build does it).

## Room approval

A farmer's new room, and a new size for an approved room, now wait for a supervisor to approve them. Only an approved room can hold a batch or a sensor. This is step 1 of the egg supply design (`docs/superpowers/specs/2026-11-06-egg-supply-design.md`, local only), which needs a trusted room size before it can work out an allowance. The plan is `docs/superpowers/plans/2026-11-06-room-approval.md` (local only).

### What it does
- A room has a size in square metres (1 to 5000). The farmer enters it when adding the room. A new room waits, and the farm page says so in words.
- The supervisors of the farmer's cooperative each get an email with the farmer, the farm, the room and the size. A farmer with no supervisor, or in no cooperative, goes to every active admin, and the email says so. A room added by an admin is approved at once.
- A supervisor approves, or rejects with a reason the farmer reads. A farmer whose room was rejected enters a new size to send it again.
- Changing the size of an approved room waits too. The room stays usable at the old size until the new one is approved.
- A farm with no approved room cannot start a batch. The form says "Add a room and wait for your supervisor to approve it before you add a batch." and the save button is off. The room "Room 1" is no longer made for a first batch.
- Batch and sensor room choices list approved rooms only, on the batch form, the move room dialog, the add device dialog and the device details.
- The farmer gets an email for each decision, with the reason when there is one.

### How it is built
- **One module changes the state.** `farms/room_review.py` holds `open_new`, `change_area`, `decide`, `reviewers_for` and `waiting_for`. A decision is one conditional UPDATE, so two reviewers deciding the same room cannot both win. The second gets 409 and no second email goes out.
- **Wire format.** `POST /api/rooms/<id>/review` (`decision`, `note`), `GET /api/team/rooms?status=pending`. A supervisor reaches only the rooms of their own cooperative. A room outside it is "not found". Refusals carry a `code` (`no_approved_room`, `room_not_approved`, `note_required`, `nothing_to_review`) so the page can tell them apart.
- **Existing rooms stay approved.** The migration gives them `approved`, with no size. Their first size waits for a decision like any other.
- **Mail never fails the request.** `farms/room_notify.py` sends one mail per person and logs a failure. The decision is already saved and the person sees it in the app.
- **Audit log.** A room added, a size asked for, and each decision with its reason.

### Not built
- A review history page, bulk approval, and the use of the size for the egg allowance (step 2).

### Checks
- Backend 2857 tests, frontend 2027 tests, `tsc`, ESLint and `npm run build` clean. One frontend title test (`PublicLotPage`) failed once under full suite load and passes alone and on the previous commit.
- A browser check on a scratch database, as a farmer, with the supervisors driven through the API: the empty rooms panel, the batch form blocked with the message, a size of 5001 refused, a new room waiting with its size, a supervisor of another cooperative seeing nothing and getting 404 on a decision, the farmer getting 403, a rejection without a reason refused, a rejection with a reason shown on the card, a resubmission, an approval that opens the batch form with the room chosen, a size change that keeps the old size in force and then goes through, a second decision refused with 409, the texts in English, French and Kinyarwanda, and the add room dialog by keyboard. Not checked in the browser: the add device and move room choices (unit tests only), the email in a real mail app, and the reviewer's side of the screen (it does not exist yet).
- The French and Kinyarwanda texts are drafts for native review.
- Migration: `farms.0005_room_approval`. It only adds things. Run `python manage.py migrate` (the build does it).

## Support access with consent

An admin can now look at a farmer's or supervisor's account to help, but only after that person says yes. Plan item 10. The design note is `docs/superpowers/specs/2026-11-06-support-access-design.md` (local only).

### What it does
- The admin asks from the Users page with a reason (10 to 300 characters), a length (15, 30 or 60 minutes) and a mode (view only, or ask to make changes as well). It needs a fresh code from the authenticator app, to ask and again to start.
- The person gets a question on their screen and one email (no link that approves). They allow or reject, and tick the box if they also let the admin make changes. The request lapses after 5 minutes. An allowed request must be started within 10 minutes.
- While the visit runs, both sides see a bar on every page. Either side can end it at once. It also ends when the time is up, when the person signs out everywhere or changes their password, when the person is deactivated or becomes an admin, and when the admin signs out, is deactivated or is demoted.
- The person has a list of every request about their account, with the outcome and the reason, in Settings, Security.

### How it is built
- **The token names the person.** While acting, `request.user` is the person, so every role check and record scope applies unchanged. The token also carries `act` (the admin). Authority comes from the database rows (`SupportAccess` and a `UserSession` linked to it), never from the token alone. Authentication is still one query.
- **Default deny for writes.** `core/support_rules.py` is checked in the authentication step, before any view. View only refuses every write. Edit mode allows 19 listed writes and never a delete. Anything unknown is refused. `tests/test_support_rules.py` keeps the reviewed list and walks every route.
- **Logging names the real admin.** Audit entries are the admin's, "on behalf of" the person. Security events say "as <person>". Every request of a visit is kept in the request log with the support access id.
- **The 30 second check does not keep a sign in alive.** Any request moves the idle clock, but this one is made by the page, so `core/jwt_authentication.py` leaves it out of the clock (`BACKGROUND_PATHS`). The idle limit still applies to it, so it cannot revive a stale sign in. Without this a tab left open on a shared computer would never have signed out.
- **The website.** The acting state lives in memory. While acting, any 401 ends the visit and never refreshes with the admin's cookie (which would send the person's request as the admin). Logging out while acting signs the admin out. The person's page asks every 30 seconds, only while the tab is visible. The shared Modal got an optional `dismissible` flag for a question that needs an answer, and the question starts with the focus on Reject.

### Not built
The emergency path that skips consent (dropped by the owner), recording the screen, chat, approving from an email, deleting in edit mode, and the live alert stream during a visit.

### Checks
- Backend 2756 tests, frontend 2008 tests, `tsc` and ESLint clean.
- A browser check of the whole flow on a scratch database (ask, answer with and without the changes box, start, continue after a reload, end from each side, the history) found five defects that unit tests missed. All are fixed with a test first: Start landed on "You can't open this page"; the strip offered a visit that was already over; the person's visits list showed a red error to the acting admin; the page kept the other person's data after a switch; and four identical error toasts piled up (identical toasts now show once).
- The French and Kinyarwanda texts are drafts for native review, as for the second factor.
- Migrations: `support_access.0001`, `users.0011`, `logs.0003`. They only add things. Run `python manage.py migrate` (the build now does it).

## Faster requests, a quicker wake, and why the API still slept

After the load test passed (1686 requests, none failed, 95th percentile 1.08 s) the API sat on Render's "application loading" page for more than five minutes after a wake, and it had been asleep during working hours.

### What was wrong
- **The pinger was GitHub's schedule.** `jobs-frequent.yml` is set to run every 5 minutes, but GitHub started only 4 runs in 20 hours (17:35, 22:48, 02:52, 09:58 UTC). Render sleeps a free service after 15 minutes of silence, so the API slept in working hours. The earlier "keep it awake" fix depended on a scheduler that does not keep time.
- **Every wake ran the whole setup again.** A woken service runs the start command again. `start.sh` ran `check --deploy`, `migrate`, `createcachetable` and `collectstatic` first, four Python processes that each load Django and open their own database connection, on a CPU that is a fraction of a laptop's. `build.sh` only installed packages.
- **Two lookups on every request.** The token names the person and the sign in. The API read the person, then the session, two round trips before the view ran.

### What changed
- `build.sh` now runs the four setup steps once per deploy and leaves `.setup_done`. `start.sh` skips them when the marker is there and only starts uvicorn. Without the marker (a host whose build cannot reach the database) `start.sh` does them as before. A failing build leaves the running copy in place. Tests run the real scripts with stand-ins for `python`, `pip` and `uvicorn`.
- Authentication reads the person and the session in one joined query (`core/jwt_authentication.py`). A page now costs 1 to 4 queries: `/api/auth/me` 1, `/api/alerts` 2, `/api/farms` 4. A test pins the one query and the refusals (ended session, missing session, deactivated person, token from before sessions).
- Runbook: a reliable keep-awake needs an outside pinger (cron-job.org or UptimeRobot, a GET of `/api/health` every 5 minutes, 06:00 to 20:00 Rwanda), a row for the stuck wake page, and how to confirm the quick wake from the log.

### What I could not prove
- The size of the wake saving. After the deploy, wake the API and read its log: there should be no `migrate` lines before uvicorn starts. Time the wake and write the number in the runbook.
- The cause of the five minute stall. The Supabase check showed only 2 pooler connections and the API answered by itself later. The runbook row covers the most likely cause (pooler slots).

## The service no longer restarts every 1000 requests, and the load test is realistic

The second live load test (after the faster rate limits) got 878 good answers and 3484 failures: 429 x3192, 502 x263, 503 x29. The tokens were accepted this time. I reproduced part of it on a scratch database.

### What was wrong
- **A restart every 1000 requests.** `start.sh` passed `--limit-max-requests 1000` to uvicorn, written when it ran two workers and a supervisor replaced the one that exited. Render runs one worker (`WEB_CONCURRENCY=1`), and with one worker uvicorn has no supervisor, so the exit stops the service until Render restarts it. Locally the API stopped at exactly request 1000 and 999 requests got no answer. Under the old load test that was every 40 seconds. In normal use it is a minute of "The server is waking up" after every 1000 requests, which is a few hundred page loads.
- **A load test that was a stress test.** Each person asked every half second to two seconds, about 40 requests a second for 50 people. A person loads a page and reads it. The API handles one request at a time per process, and a laptop tops out near 40 to 60 a second, so Render's free CPU could never have passed it.

### What changed
- `start.sh` only passes the restart flag when there is more than one worker. A test runs the real script with stand-ins for `python` and `uvicorn` and reads the arguments.
- The load test default is now a page view (three requests together) and then 8 to 20 seconds of reading, with people arriving at different moments, about 11 requests a second for 50 people. `--stress` keeps the old pace to find the ceiling.
- For each refusal the script prints one example: the headers that show who answered and the start of the body. This tells our API's 429 (JSON with a reference) from one made by Vercel or Render.

### Checked
- On a scratch database with the production start options: the old script took the API down at request 1000. With the new default, 50 people for 60 seconds: 609 requests, 0 failed, p95 0.23 s. That says nothing about Render's CPU.
- **Not explained:** the 3192 429s. Locally 50 people got no 429 at all, and our rate limits cannot fire at about 50 requests a minute per person (the limit is 300). The next live run prints an example of the 429 and who sent it. The System page, Logs, Requests tab filtered to status 429 would show whether our API sent any.
- **Not checked:** the live speed after this deploy.

## Faster requests: rate limits count in memory

The first live load test on 2026-11-06 failed all 5064 requests, and the app felt slow. Two separate causes.

### What was wrong
- **Slow requests.** Every request made six database round trips just to count itself against the rate limit (read, count, savepoint, check, write, release), because the counters lived in the database cache on Supabase. `/api/auth/me` asked 1 question for its data and 6 for the limit. `/api/farms` asked 4 and 6. That is more than half of all the database trips, and a write on every request.
- **The failed load test.** The tokens are signed with the `JWT_SECRET` in the terminal that runs `prepare_load_test`, and the live API only accepts its own. The runbook did not say so. Every request was refused with a 401, and refused requests count against the per address limit for visitors with no token, so the owner's own browser got "Too many requests" on the same address. The script showed 5064 failures and no reason.

### What changed
- Rate limit counters now live in memory (`core/throttles.py`, cache alias `throttle`). A rate limited request asks the database nothing about the limit. A test fails if any view goes back to a database counter. Sign in lockout, code challenges, stream tickets and the log burst job stay in the database cache because they must survive a restart or be shared with another process.
- The cost: each API process counts for itself, and a restart starts the counts again. The API runs one process, so the limits are exact today. Read the comment in `core/throttles.py` before adding processes.
- The load test script now asks once with the first token before it starts. A 401 stops it with the reason (the `JWT_SECRET` mismatch), and a 429 stops it with a note to wait. A run also prints how many requests got each answer, so a refusal is no longer mistaken for a slow site.
- Runbook section 8 says to set `JWT_SECRET` in the terminal too.

### Checked
- Throw-away tests, written first: no database query for the limit, every view's throttle uses the memory cache (a walk over all views), the limit still refuses the request over it, and the script's new stop and tally. The full suites are in the pull request.
- **Not checked:** the speed on the live site. Run the load test again after the deploy, and compare the page timings.

## Admin second factor: a code from an authenticator app

Every admin signs in with a password and then a 6 digit code. The first time, they set up the app. Supervisors and farmers sign in as before. The steps to deploy it are in `docs/deploy-runbook.md`, section 9.

### Checked
- Backend and frontend suites, `ruff`, `tsc`, `eslint` and `pip-audit` pass. New tests cover the key and its deploy check, the models and codes (drift of one step, replay, bad input), the challenge, the sign in and set-up endpoints, enforcement, step-up, new recovery codes, resetting another admin and the command, the three screens, the Settings panel, the code prompt and the Users page action, all with the tests written first.
- Rehearsed end to end on a scratch database against a running API, with real codes made from the secret (27 checks): set-up, sign in with a code, a wrong code, a code used twice, a recovery code used once, step-up, new recovery codes, resetting another admin (their token stopped working at once and their next sign in went to set-up), a farmer unaffected, the rate limit on the code endpoints, and all six new security event kinds in the log. I searched the server log for 34 secrets, codes, challenges and recovery codes and found none.
- In a real browser against that API: set-up with the QR code, the key and the recovery codes (nothing was remembered as signed in until Continue), the code step with a wrong and a right code, the Settings panel, new recovery codes, and the Users page reset, where the server refused it (403), took a fresh code (200), and reset it (200). The codes list reads at 16.3 to 1 in light and 14.9 to 1 in dark. No sideways scroll at 375 px.
- **Not checked:** a phone app scanning the QR code (the codes were made from the key shown on screen), Render and Supabase, the email to a reset admin (the console backend was used), a screen reader, and French and Kinyarwanda on screen (both are drafts). In the browser pane used here the page got no animation frames, so a closed dialog stayed in the page as a transparent layer. The existing delete dialog did the same, so it is the pane and not this change, but it was not confirmed in a normal browser.

### What changed
- **Sign in.** A correct admin password gives a challenge (5 minutes, one use, dies after 5 wrong codes) and no session. The code, or the first time set-up, turns it into a session. Wrong codes count toward the same 5 wrong, 15 minute lockout as passwords, and for an admin the password step no longer clears that count.
- **Enforced in the API.** An admin session that never passed a code, or a token with no session, is refused with 401 `mfa_required`. An admin who was signed in before this ships, or a supervisor made an admin, signs in again.
- **Secrets.** Stored encrypted with `MFA_ENCRYPTION_KEY`. Recovery codes (8, one use each) are stored as HMACs. A code cannot be used twice. A deploy without the key stops at `ssms.E001` before the running copy is replaced.
- **Step-up.** `POST /api/auth/mfa/step-up` and `require_recent_mfa` ask for a fresh code before something sensitive. The website prompts for it and tries the action again once.
- **Looking after it.** Settings, Security shows the status and makes new recovery codes. Another admin can reset someone's app from Users. `manage.py reset_admin_mfa` is the last resort.
- **Writes down.** Six new security events and audit entries for set-up, new codes and resets. Nothing secret goes in any of them.
- **Tests that signed an admin in** with one step now do both steps through `tests/mfa_helpers.py`. `jwt_client` gives an admin a verified session.
- Draft text: the French and Kinyarwanda on the new screens need a native review.

## Pilot capacity: about 50 people at once on the free plans

### Checked
- Backend and frontend suites pass. New tests cover the database settings, the working hours (their edges, midnight and bad values), the Render build filter, the waking up retry and banner in three languages, query counts on the busiest endpoints, the load account command and the load script.
- The pool was tried locally against a scratch database: 300 requests, 30 at a time, held 2 server connections (the cap is 4). The load test was rehearsed locally with 8 simulated people and 165 requests, none failed. Both used this machine's network, not the real one.
- **Not checked:** the pool and the load test on Render and Supabase with 50 people, whether Render's build filter patterns skip a docs only merge, the waking up banner against a really sleeping Render service, how the working hours behave over a full night, and the Kinyarwanda and French banner text (the Kinyarwanda is a draft).

### What changed
- **Database pool.** On a host the API shares 1 to 4 database connections (`DB_POOL_MAX`) instead of opening one per request. Closing connections per request had stopped a leak that filled Supabase's 15 connection limit, but cost a new connection every time.
- **Working hours.** The five minute job pings the API only from 04:00 to 18:00 UTC (06:00 to 20:00 in Rwanda) with `run_health_checks --awake-hours-utc 4-18`, so the free API sleeps at night and Render's 750 free hours last. `render.yaml` also stops the API redeploying for website, docs, test, script or workflow changes.
- **Waking up.** While the free API wakes, the site shows "The server is waking up" and tries reads and sign in again for up to 90 seconds. Saves are never repeated.
- **Fewer queries.** The admin users list made one query per person for the cooperative name. It now joins it. A test checks the busiest endpoints do not grow with the data.
- **Load test.** `manage.py prepare_load_test` makes throwaway farmers and tokens, and `scripts/load_test.py` simulates them reading at once and says pass or fail. The API limits each person to 300 requests a minute, so each simulated person has their own account. The runbook has the steps.

## Deploy setup: Render, Supabase and GitHub Actions

The API and the disease check service run on Render, the database on Supabase, the scheduled jobs on GitHub Actions and the website on Vercel. The steps are in `docs/deploy-runbook.md`.

### Checked
- Backend tests for the manifest, the two job workflows, the simulation workflow, the Vercel forward and the new `--skip` option. The frontend headers test still passes against the new `render.yaml`.
- **Not checked:** nothing has been deployed yet. Not run on a real host: the Render builds, the model download, the memory use of the disease service on the free plan, the live alert stream through the Vercel forward, the client address behind two proxies, and the GitHub schedules.

### What changed
- `render.yaml` describes two web services, `ssms-api` and `ssms-ai`. The Render database and both Render crons are gone. `DATABASE_URL`, the shared secret and the model link are typed into the dashboard.
- `ai_service/build.sh` downloads the model from `MODEL_URL` and refuses it unless it matches `MODEL_SHA256`.
- `jobs-frequent.yml` (every 5 minutes) and `jobs-nightly.yml` run the health check, the burst check, the offline marking and the cleanups. `run_health_checks --skip aiService` keeps the free disease service asleep.
- `frontend/vercel.json` forwards `/api` to the API, so the browser sees one site and the sign in cookie keeps working.
- `TRUSTED_PROXY_COUNT` is 2 (Vercel and Render). `start.sh` reads `WEB_CONCURRENCY`, set to 1 on the free plan.
- The sensor simulation workflow now runs only when someone presses the button.

## System health with history, uptime and test buttons

### Checked
- Backend and frontend suites (numbers in the pull request). New tests cover uptime with hand built rows and gaps, each new check, the command, the history API, every test button with the outside services faked, the throttle and the audit entry, and the Health page with its refresh timer and three languages.
- In a real browser as a throwaway admin (deleted, and the rows it wrote removed from the dev database): ten cards, the trend line and the status row, uptime figures, the note, and a phone width with one column and no sideways scroll. I pressed every test button for real: the database write and the device intake worked, the email test went out, photo storage and the disease check failed here for local reasons and said so in words.
- **Not checked:** the outside monitor and the health cron on a real host, the website and web API checks against real addresses, French and Kinyarwanda on screen (the Kinyarwanda is a draft), and the storage test against your real Cloudinary account over time.
- Pressing the email test on my throwaway admin sent a real message through the SMTP account in `.env` to an address that does not exist (`example.invalid`), so a bounce notice may reach that mailbox.
- Pressing the storage test uploaded 1 pixel to your Cloudinary account, under `ssms/health-test`. An unsigned upload cannot be deleted from here. Delete the folder in the Cloudinary dashboard if you like.

### What changed
- **History.** `run_health_checks` (every 5 minutes, in the new `ssms-health-check` cron in `render.yaml`) writes one row per service. 30 days, pruned by `prune_logs`. Migration `logs.0002`.
- **Ten services,** up from six: web API, database, disease check, email, error monitoring, photo storage, sensors, scheduled jobs (a nightly command finished in the last 26 hours), the live alert stream (opened with a ticket, first line read) and the website (a HEAD request). A check that breaks is a problem for its own service and never stops the others. The live alert stream now says it is connected as its first line.
- **Uptime** over 24 hours, 7 and 30 days, from the rows. No rows means unknown, never down, and a service that is not set up is counted neither way. Each figure says how many checks it is built from. `GET /api/admin/health/history`.
- **Test buttons** for email (to the admin who pressed it), photo storage, the disease check, a database write (rolled back) and the device intake (a throwaway farm, room and device, rolled back, no alert). `POST /api/admin/health/tests/<name>`: admins only, 5 a minute, written in the audit log, answers in a plain code the screen puts into words. Nothing touches a farmer's data.
- **Health tab.** A card per service: status in words, the answer time over the last 24 hours as a line (or a row of checks, with the same facts in words), uptime figures, a Run test button and its result. It refreshes by itself every minute while the page is on screen.
- Settings: `HEALTH_API_URL`, `HEALTH_LOG_KEEP_DAYS`, `SCHEDULE_STALE_HOURS`. The deploy checklist now asks for an outside monitor on `/api/health`.

## Compare batches from Farm monitoring

Admins and supervisors had no way to the batch comparison: the Batches page, which holds its button, is in the farmer menu only. The Active batches panel on Farm monitoring (the supervisor's Dashboard) now ends with "Compare batches" in place of "View farms", which duplicated the Farms menu item. Batches stays out of the admin and supervisor menus on purpose.

### Checked
- Frontend tests: the link goes to `/batches/compare` and the old link is gone. `tsc` and ESLint clean.
- **Not checked:** the page in a real browser (a one link change), and the farmer's own route to the comparison, which is unchanged.

## Four logs and a reference on every answer

### Checked
- Backend and frontend suites: the full numbers are in the pull request. Every new part has its own tests: the reference, the change builder, each log, the Logs API, the burst alert, the JSON lines and the Logs page.
- In a real browser as a throwaway admin (deleted, and the rows it wrote removed from the dev database): System, Logs, the four streams, a real sign in and a real wrong password showing in Security with their references, the Requests stream with real rows, and a reference typed into the box finding its row.
- **Not checked:** the Jobs stream and the audit stream in the browser with real rows, a real 500 on screen with its reference, French and Kinyarwanda on screen (the Kinyarwanda is a draft), the burst mail in a real mailbox, and `prune_logs` and `check_log_bursts` on a real schedule.

### What changed
- **A reference on every answer.** `X-Request-ID` on every response, and `reference` in every error body (404 and 500 are now plain JSON too). A plain reference from the caller is kept, anything else is replaced. A server problem on screen ends with "Reference: ABC123..." so a person can quote it.
- **Audit log, richer.** Each entry can carry the request reference, the device, what each field was and became (`changes`, secrets never included, long text cut), who it was on behalf of and the outcome. Farm, batch, room, safe range and role changes record their changes. Migration `audit_log.0003`.
- **Security log.** Sign ins, wrong passwords, lockouts, password changes and resets asked for, new devices, devices signed out, a copied sign in cookie used again, a sign in ended for sitting idle, refusals for the role and slow downs. 12 months.
- **Request log.** Every failed request and 5 percent of the good ones: reference, method, route pattern, status, milliseconds, role and address. Never the address that was typed (a lot token cannot land in it), the query, a header or a body. Good browser preflight questions and the health probe are left out. 14 days.
- **Jobs and devices log.** Mail that did not go out (subject only, never the address), refused device readings (never the key), devices that went quiet, and every scheduled command starting and ending. 90 days.
- **Logs tab.** System, Logs has four streams with filters that apply by themselves (date range, reference, kind, status, route, search), pages, CSV export and empty and error states. A reference finds the same request in every stream. `GET /api/admin/logs/<stream>`, admins only. Every look is written in the audit log (once a minute per log), and every export always.
- **JSON log lines.** One object per line with `request_id`. `LOG_LEVEL` sets the level. Sentry reports carry the reference as a tag.
- **Burst alert.** `check_log_bursts` (every 5 minutes) mails the admins once when 10 server errors or 30 refusals come within 5 minutes, then stays quiet for 30.
- **Pruning.** `prune_logs` runs in the nightly cron. The audit log is never pruned.
- Migrations: `audit_log.0003` and the new `logs` app. Run `python manage.py migrate`.

## One table for who may do what

### Checked
- Backend: the permission table, the permission class and the walk have their own tests (see below). The existing access matrix, which sends every endpoint every kind of caller, passes unchanged, so no endpoint changed who it lets in. The full suite is in the pull request.
- **Not checked in a browser:** nothing on screen changed. The only visible effect is the audit log text for admin edits.

### What changed
- `core/permissions_table.py` is the one place that says which role may do what, for 72 views in 23 resources (12 more are open to anyone on purpose, 2 are not classes). A view names its `resource` and the new `RolePermission` class reads the table. More than 40 role checks written by hand inside views are gone, and so are the two `IsAdmin` classes. The live alert stream reads the table too.
- Behaviour is unchanged: a role the table refuses gets 403 before anything else, a stranger gets 401, and a method the view does not have still gets 405. Which records a role may reach is still `core/access.py`.
- `tests/security/test_permission_walk.py` finds every view under `/api` and fails when one has no table entry. It also asks every view as each role and checks the answer against the table, both ways: refused when the table says no, never refused when it says yes. Open views must be named in its `PUBLIC` list, so a new open view has to be added by hand.
- **On behalf of.** When an admin changes a farm, room, batch, mortality record, harvest, shared lot or disease check that a farmer owns, the audit entry ends with "(on behalf of farmer@example.rw)". A farmer's own change reads as before. New helper: `on_behalf_of(request, farm)`.

## Idle sign out with a warning

### Checked
- Backend: tests for the idle limit, the once a minute write, the refresh refusal with its audit entry, the ping and the settings override. The full suite is in the pull request.
- Frontend: tests with fake timers for the timer (warning, expiry, stay, activity in another tab, a laptop waking, no timers left after unmount), the dialog (role, focus, countdown, three languages) and the layout.
- In a real browser as a throwaway admin (deleted) with the admin limit set to 2 minutes: the dialog appeared after 60 seconds of silence with the focus on "Stay signed in", Stay closed it and pinged the server, and the page signed out and went to the login page at the limit. The login notice shows.
- **Not checked:** the shared computer tick end to end in a real browser (the login page with the tick was looked at; the limit is covered by tests), a second tab in a real browser (the tab to tab sharing is covered by tests with a fake channel), a laptop that really slept, a phone, and French and Kinyarwanda on screen. The Kinyarwanda wording is a draft.

### What changed
- An admin's sign in ends after 15 minutes without use, a supervisor's after 30. Farmers have no limit. Set `SESSION_IDLE_ADMIN_MINUTES`, `SESSION_IDLE_SUPERVISOR_MINUTES` or `SESSION_IDLE_FARMER_MINUTES` (0 means none). The server decides: it refuses an idle session on the next request, and a renewal of an idle session is refused and written to the audit log.
- Using the site moves the clock, written at most once a minute per session. A silent renewal does not count, because it is the page asking, not the person.
- `POST /api/auth/session/ping` tells the server somebody is still reading, and says the limit. The page sends it at most every 5 minutes, and only after the person did something.
- One minute before the end a dialog asks "Are you still there?" with a countdown. Escape, a click outside or Stay signed in keeps the person in. Activity in another tab clears the warning here. Time is read from the clock, so a sleeping laptop signs out on wake.
- **Shared computer tick.** The login page has "This is a shared computer". Ticked, the sign in gets a 30 minute idle limit (`SESSION_IDLE_SHARED_MINUTES`), even for a farmer, who otherwise has none. It never loosens a stricter role limit. The flag lives on the session, so renewals keep it, and the signed in devices list shows "Shared computer". Only a real tick counts. Migration `0009`: run `python manage.py migrate`.
- The login page says "You were signed out because nobody used this page for a while." It did not show at all while developing, for any notice, because React draws the page twice and the first draw removed it. That is fixed.

## Limits, a wait message and website security headers

### Checked
- Backend: new tests for each limit, the wait time in the answer and the CORS header; the full suite is in the pull request.
- Frontend: tests for the wait message in three languages and for the header file. In a real browser, with the policy enforced by a small local server and violations logged: the landing page, the sign in page and nine signed in admin pages gave no violation.
- **Not checked:** the map tiles, the bot check, error reports and photo uploads against the policy, and anything on the real domain. French and Kinyarwanda on screen. The Kinyarwanda wording of the wait message is a draft.

### What changed
- Each person gets 20 PDF reports a minute (batch report, farm summary), 10 exports a minute (CSV and PDF of a list, counted only when exported) and 20 photo checks a minute. They are counted per person, so an office sharing one address does not share an allowance. A device sending readings is not counted.
- After a 429 the screen says "Too many requests. Try again in 12 seconds." in English, French or Kinyarwanda, never the server's words. The answer now carries `retryAfter`, and the `Retry-After` header is readable from another address.
- The photo check already looked inside the file and refused a text file renamed to `.jpg`, a huge picture and a wrong format. New tests cover an empty file and one cut off halfway.
- The website host now sends a Content Security Policy (report only for now), Permissions-Policy (camera and location for this site, no microphone) and Strict-Transport-Security. The one inline script moved to `hero-preload.js`, so the page has no inline script.
- Enforcing the policy waits for the domain decision. `docs/deploy-checklist.md` says what to switch.

## React Router 7

React Router is upgraded from 6.23 to 7.18.5. It clears the two moderate advisories (an open redirect through `<Link>` and `useNavigate`, and a constructor injection in server rendering that SSMS does not use). `npm audit` for the packages that ship to the browser now reports 0 vulnerabilities, and CI fails on moderate or above, up from high.

### Checked
- Frontend: 1675 tests pass, `tsc`, ESLint and the production build clean. The router future flag warnings are gone from the test output.
- In a real browser with a throwaway admin (deleted): sign in redirect, sidebar links, the System tabs and the old address redirects, back and forward, one cooperative with its tabs, and the 404 page.
- **Not checked:** the supervisor and farmer routes in a real browser, and every dialog that navigates after saving (tests cover them with a memory router).
- Still reported, development only: 17 advisories in `vitest`, `vite` and `esbuild` (one critical in `tinypool`). They never ship. Upgrading `vitest` is a separate change.

## Each page title once, tables that fit, no Rename on devices

### Checked
- Frontend: 1675 tests pass, `tsc` and ESLint clean. Backend: 1682 tests pass at 93.70 percent coverage (gate 80).
- In a real browser as a throwaway admin (deleted), at 1219 px wide with the menu open (the width where the tables clipped): Devices and the audit log became card lists with no sideways scroll, the System health panels have a 24 px gap, signed in devices show no Rename.
- **Not checked:** every other page at every width. The cramped rule is general (it measures each table), but I only looked at Devices and the audit log. French and Kinyarwanda on screen.

### What changed
- The top bar names the page, so the big title under it is gone. The title stays for screen readers. A line under the top bar stays only when it carries a count or a name (for example "17 devices registered."). Farm and batch names, the welcome line and cooperative names stay as titles.
- The explanatory sentences are gone from Users, Cooperatives, Settings, System, Disease checks, the dashboards, the add pages, the batch picker and System health. 13 unused words removed.
- Tabs (System, Settings) no longer repeat their name in a heading inside the tab.
- A table card too narrow for its columns now turns into the phone card list at any screen width. `useCrampedTables` measures every table card, so a long place name or a narrow window cannot clip a column again.
- System health panels are spaced.
- Signed in devices: Rename is removed. The label (browser and system) and the last use time are enough to spot a device you do not know, and Rename needed a column, an endpoint, validation and tests. Migration `0008` drops `customName`. Run `python manage.py migrate` after pulling.

## Checks on every pull request

GitHub now runs the tests and checks on every pull request and on every push to master.

### Checked
- Backend, run locally with the same commands: `ruff check .` clean, `pip-audit` found nothing, `check --deploy --fail-level WARNING` clean, 1683 tests pass with 93.71 percent coverage against the 80 percent gate.
- Frontend, run locally: `npm run lint`, `tsc --noEmit` and `npm run build` clean, 1664 tests pass with no unhandled errors, `npm audit --omit=dev --audit-level=high` passes.
- **Not checked:** the workflow itself has not run on GitHub yet. This pull request is its first run. Windows and Linux differ in file name case, so the first Linux run may find something.

### What changed
- `.github/workflows/ci.yml`: a backend job (Postgres 16, ruff, pip-audit, deploy check, tests with the coverage gate) and a frontend job (ESLint, tsc, vitest, build, npm audit). A newer push cancels the older run. The jobs can only read the repository.
- A test that reads the workflow file and fails when a required step is missing.
- ESLint is installed and configured with the two stable React hook rules. The `lint` script worked with no config before.

### Found and fixed on the way
- The banned wording test could never fail: a stray backspace character sat in its pattern where a word boundary was meant. It works now.
- The motion token test pattern lost its `\s` inside a template string. It passed by luck.
- One invitation test used empty dates, which the real API never sends. It caused the unhandled `RangeError` that made `vitest run` exit with an error.
- Three ruff findings in the training script.

### Known and not gating yet
- `npm audit` reports 2 moderate advisories in React Router (fixed by the React Router 7 upgrade, next item) and critical ones in `vitest` through `tinypool` (development only, never shipped). CI gates on high and above for what ships.
- The newer React Compiler rules in the hooks plugin flag 36 places that work today (28 are `set-state-in-effect`). They stay off.
- `check_content.py --all` finds 40 older em dashes (settings, models, `render.yaml` and others). It is not in CI until the content review item clears them.
- Tests that need the AI model do not exist in the main suite, so none are skipped.

## A shorter admin menu and a System hub

Health, Logs and Activity are tabs of one System page. The admin menu is 12 items in 4 groups, down from 15.

### Checked
- Frontend: 1664 tests pass and `tsc` is clean. Backend untouched.
- In a real browser with a throwaway admin (deleted): the menu groups and items, the System hub with its three tabs and the sidebar marking System on each, the old addresses redirecting, Farm monitoring in the title, top bar, sidebar and tab, quick search finding System health, and the phone width (no sideways scroll).
- **Not checked:** the supervisor's "Dashboard" name in a real browser (my browser check was cut off); it is covered by tests only. French and Kinyarwanda on screen, the Health tab's test results.

### What changed
- System hub at `/admin/system` with tabs Health, Logs (the audit log) and Activity (the old system report). The old addresses redirect.
- Admin menu groups: Overview, Farming, Administration, Account. "System overview" is "Farm monitoring" for admin and "Dashboard" for supervisors. "Detection reports" is "Disease checks".

## One page for a cooperative

A cooperative is now one page with its report, farms, members and details as tabs. This replaces the separate Cooperative report page, the Members window on the Cooperatives list and, for supervisors, the My farmers page.

### Checked
- Frontend: 1634 tests pass and `tsc` is clean (net 55 new). Backend untouched, so its suite was not run again for this change.
- **In a real browser** on your dev servers with a throwaway admin and a throwaway supervisor of a real cooperative (both deleted again), looking and opening dialogs but never saving:
  - **Admin.** The list has "All cooperatives" as its first row with the totals and no tiles; opening Gatsibo Sericulture 1 shows its name and place, the tabs Report, Farms, Members and Details, the real numbers (4 farms, 3 farmers, 10 batches running), one farms table with the risk and its reasons, all 5 members, and the details; the dates carry from one tab to the next; the edit form opens filled in and cancels without saving; the old report address lands on All cooperatives; the sidebar no longer has "Cooperative report".
  - **Supervisor.** "My cooperative" with the cooperative's name under it and the tabs Report, Farms and Farmers; the old My farmers address lands on the Farmers tab; an admin page is refused; the menu is 7 items plus Settings.
  - **Phone (375 px).** The tabs fit, the dates stack, the farms become cards, and there is no sideways scroll.
- A flaw I found there, not in the plan: the reasons a farm is at risk were cut off with "..." on a phone. They now wrap (found in the browser, then fixed with a test).
- Not checked: the delete, the member add and remove and the create flows in the real browser (they are covered by tests and I did not want to change your real cooperatives), the supervisor invitation flow in the real browser, French and Kinyarwanda on screen (tested), and the PDF and CSV downloads from the new page (the buttons call the same service as before, tested with fakes). `npm test` still prints the one unhandled `RangeError`, now from the Farmers tab tests (it is the same one that was in the My farmers tests, and it is on `master` too).

### What changed
- **Cooperatives list.** Each row opens its own page. The first row, "All cooperatives", opens every cooperative together. The tiles that repeated the dashboard are gone, and so are Edit and Delete in the rows (they are on the cooperative's Details tab). Restore stays on the Deleted tab.
- **One cooperative (admin).** Tabs: Report (dates, tiles, harvest, checks, alerts, CSV and PDF), Farms (one table, riskiest first, with the reasons under the level, replacing the two farm tables), Members (add and remove, as before), Details (edit and delete). No cooperative picker: you choose by opening one.
- **My cooperative (supervisor).** The same page for their own cooperative: Report, Farms, and Farmers (the farmers and invitation links, from My farmers). They cannot edit it.
- **Old addresses keep working.** `/reports/cooperative` goes to All cooperatives for an admin and to My cooperative for a supervisor; `/supervisor/farmers` goes to the Farmers tab.
- **Sidebar.** Admin: "Cooperative report" is gone. Supervisor: "My farmers" and "Cooperative report" became "My cooperative". Cooperatives stays marked on every page of a cooperative.
- **One tab bar.** Settings and the cooperative page share one component and one set of styles.
- **Removed:** the old report page, the Members window, and 14 words nothing used.

### Left for the next part
- Part 2: the shorter admin sidebar, "System overview" renamed Dashboard for supervisors, "Farm monitoring" for the admin's all-farms view, and the System hub with Health, Logs and Activity tabs.

## Settings sections as tabs, and a sidebar that scrolls as one list

The Settings sections now sit as tabs under the page title instead of a second menu beside the main one. The Account group in the sidebar is back in the normal list.

### Checked
- Frontend: 1579 tests pass and `tsc` is clean (6 new tests that read the stylesheets, because layout cannot be seen by the other tests). Backend unchanged.
- **In a real browser** on your dev servers with a throwaway admin (deleted again): the four tabs sit above the content with the open one underlined, the content is 820 pixels wide and the account card is smaller; each tab shows the right panels and the page does not scroll sideways; the last sidebar group is `static`, no longer pinned. At 375 pixels the tab row scrolls sideways (the fourth tab, Safe ranges, is partly cut off as a hint) and the page does not scroll sideways.
- Not checked: a farmer or supervisor (they see three tabs, covered by the earlier tests), French and Kinyarwanda on screen, light mode, and keyboard use in a real browser.

### What changed
- **Tabs.** Account, Security, Appearance and, for admin, Safe ranges, as a row under the title with a line under the open one. The content keeps a readable width, and the account card is more compact.
- **Sidebar.** Settings and Sign Out are the last group of the menu and scroll with it, as asked. The earlier pinned placement is removed.

## The account menu becomes a link, and a calmer error page

The person in the top bar is now one link to Settings, with no dropdown. The page that appears when a screen breaks says less.

### Checked
- Frontend: 1573 tests pass and `tsc` is clean (6 new tests for the error page, 4 new for the top bar link; the tests of the old dropdown were removed). Backend unchanged.
- **In a real browser** on your dev servers, with a throwaway admin (deleted again): the person in the top bar is a link (no caret, no underline) that opens Settings, Account, and no menu appears; reloading `/settings/safe-ranges` directly shows Safe ranges inside Settings with its five rows and no crash.
- Not checked: the new error page itself on screen (its words and layout are tested, but I could not make a real screen break on purpose), a phone, and French and Kinyarwanda on screen (the link's name is tested in French).

### What changed
- **Top bar.** The name and role are a link to Settings, Account. The dropdown is gone, so Alerts is no longer listed twice (the bell and the sidebar have it), and Sign Out stays only in the sidebar. The sidebar's Settings link is the same place.
- **Language and theme** are now only in Settings, Appearance. On a very narrow screen the small language switch is hidden, so the language is chosen there or on the login page.
- **Error page.** It now says "We're sorry. Please refresh the page." and no longer offers "Technical details" or mentions the dashboard. The error is still written to the browser console for whoever debugs.
- **Left over code removed:** the dropdown's styles, the language switcher's menu mode and one unused word.

### A note on the page that crashed in your screenshot
- While I was editing files with your dev server running, the open tab can end up with two copies of the same module ("useLanguage must be used inside LanguageProvider"), which shows this page. Refreshing fixes it, and it cannot happen in the built site. I could not make it happen on a fresh page load.

## A Settings page in place of the Profile page (phase 1b, part 1)

Everything a person configures now sits in one Settings page, with a section list beside it (above it on a phone). The Profile page is gone.

### Checked
- Frontend: 1571 tests pass and `tsc` is clean (26 new tests for Settings and seven for the sidebar link; the nine old Profile page tests moved into them). Backend: 1673 tests pass, with one test line added for the email link.
- **In a real browser** on your dev servers, with a throwaway admin and a throwaway farmer (both deleted): `/profile` lands on Settings, Account with the title "Settings | SSMS"; the admin sees Account, Security, Appearance and Safe ranges, the farmer sees the first three; the sidebar shows an Account group with Settings and no Safe ranges item, and Settings stays on screen at the top and the bottom of the scrolling menu and stays highlighted on every section; each section has exactly one page title; Safe ranges shows the five stage rows inside Settings; the Light, Dark and Auto buttons change the theme and I put it back on Auto; the avatar menu says "Settings"; the sidebar's Safe ranges link and the old `/admin/thresholds` address both land in the new place; a farmer typing the Safe ranges address is sent to the "not allowed" page; at 375 pixels there is no sideways page scroll and the section list scrolls sideways.
- The sticky placement of Settings is a stylesheet rule that tests cannot see, so I checked it only by measuring in the browser at 800 pixels high with the menu expanded. The narrow icon rail was not scrolled.
- Not checked: a supervisor in a browser (covered by tests, same as a farmer), French and Kinyarwanda on screen (covered by tests), light mode of the new layout, keyboard use in the browser (the section links are plain links, tested for order), and a real change of name or password through the new tabs (tested with fakes, not run against the server).

### What changed
- **Settings, with sections.** Account (the identity card and the name), Security (password and signed in devices), Appearance (language, and light or dark), and for admin only Safe ranges.
- **Old addresses keep working.** `/profile` goes to Account and `/admin/thresholds` goes to Safe ranges. Anyone who is not an admin who opens Safe ranges is sent to the "not allowed" page, as for other admin pages.
- **Settings in the sidebar.** Every role has a last group, Account, with Settings in it, kept at the foot of the sidebar next to Sign Out so a long menu never scrolls it out of sight. The admin's separate Safe ranges link is gone (it is a section of Settings, and quick search still finds it).
- **The account menu** says "Settings", and quick search finds it. The new device email and the privacy policy now point to Settings, Security.
- **Language and theme** are still in the account menu as a shortcut. The theme choices are defined once and used by both.
- **Loaded when opened**, like the other pages, so the main bundle does not grow.

### Left for the next parts
- Alerts still appears in the account menu, Sign out is still in two places, and the admin menu is still long. Part 2 (sidebar cleanup and the System hub) deals with those.

## Signed in devices, and a sign in that survives a lost answer (security plan, phase 1)

Every sign in is now a session the person can see on their Profile page, name, and sign out. A renewal whose answer was lost on a weak signal no longer signs the person out.

### Checked
- Backend: 1673 tests pass (71 new) and `ruff` is clean on the changed files. Frontend: 1544 tests pass (24 new) and `tsc` is clean. `pip-audit` finds nothing in the two new packages. `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`, which also happens on `master`.
- **In a real browser** on your running dev servers, with a throwaway farmer (deleted again, its sessions with it): signing in showed one device on the Profile page; a second sign in from an iPhone agent added "Safari on iPhone"; I renamed it to "My phone" with the Enter key; "Sign out" asked first, and after confirming the phone's access token and refresh cookie both answered 401 at once while the browser stayed signed in; the audit log says "Signed out device: Safari on iPhone". A page reload renewed the sign in through the new session. Kinyarwanda reads correctly and there is no sideways scroll at 375 pixels.
- The address was removed after the browser check, so that check saw it and the final screen was not looked at again in a browser (the page tests cover it).
- Not checked: a real phone model (Chrome only gives it on request, and I did not try a phone), Safari and Firefox, the "new device" email in a real mailbox (tested with the test mail box only), a renewal lost on a real weak network (tested by throwing the answer away in a test), waiting 15 minutes for a token to run out, load (each request that carries a session token now does one more indexed read), light mode, and French on screen (tested in the test suite).

### What it does
- **Devices list.** Profile shows each place the account is signed in: the name, which one is this device and when it was last used. No network address is kept for a device (removed before this shipped). The audit log still records an address for security events such as sign in, as the privacy policy says. Rename a device, sign one out (with a question first), or sign out all the others.
- **Names.** "Chrome on Windows", "Safari on iPhone", "SSMS app on Windows" for the installed app. Chrome hides the phone model, so "Chrome on Pixel 9" appears only when the browser agrees to say it; otherwise it says "Chrome on Android". Anything the page sends is cleaned and cut to 40 characters.
- **A lost answer.** Every refresh cookie is used once. If the answer never arrives, the same browser may ask again with the old cookie for 30 seconds. The same cookie from another browser, or later, means a copy, and the whole session ends and is written to the audit log. Two tabs asking together are both answered.
- **A limit.** A sign in ends 30 days after it began, however often it renews. Before this it could slide for ever.
- **Ending at once.** Signing a device out, changing the password, a password reset or turning a user off now stops that device's access token at its next request, not when the token runs out in up to 15 minutes.
- **New device email.** A sign in from a device the account has not used before sends a short email (no address in it) that says what to do if it was not them. The very first sign in of an account sends nothing.
- **Nightly clean up.** Sessions that ended more than 30 days ago are deleted (`prune_sessions`, in the nightly job).
- **The privacy policy** says what is kept and for how long.

### Needs doing on Render
- Run the migrations `users/0005_usersession` and `users/0006_session_recent_tokens`. Both are applied to your local database.
- Install the new packages (`ua-parser`, `ua-parser-builtins`). Nothing else.
- People who are signed in on the day this ships stay signed in: their old cookie is accepted once and given a session.

### Decided
- **Same browser only, for a short time.** A copied cookie used at once from a different browser is refused. A test that replayed an old cookie from an identical client had to change, because that is exactly the retry this allows. It now replays from another browser.
- **Remembering tokens, not "current and previous".** The session keeps the last 5 refresh tokens and which were used. Keeping only two would let two racing tabs leave the cookie holding a token that is neither, and sign the person out 15 minutes later.
- **Devices list shows live sessions only.** Ended ones are kept for 30 days for the record and then pruned.
- **The "signed out everywhere" reason has a short name** (`signed_out_all`) because the column holds 20 characters. The tests found this.

## A QR code on a harvest lot (Plan 9, item G6)

A farmer can make a QR code for a harvest lot. A buyer who scans it sees a short page about the lot, with no sign in, and the farmer can switch it off at any time.

### Checked
- Backend: 1573 tests pass (45 new: 34 for the lot link and page, 11 for the code on the report) and `ruff` is clean on the changed files. Frontend: 1520 tests pass (43 new) and `tsc` is clean. ESLint is not installed on this machine, so frontend lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **In a real browser** with a throwaway administrator (deleted again) on your demo data: the "Share with QR" button shows on a harvest record, the dialog explains what a buyer will and will not see, creating the code draws a real QR code, the lot gets a "Shared" tag, the public page at the link shows the farm, cooperative, dates, weight, silk and grade, ending the sharing makes the old link answer "This link is no longer valid." and puts the dialog back to the start. I checked the public answer for leaks and it holds only the 11 allowed fields. I left no share token in your database.
- **The QR code itself:** I took the image the page drew, and separately the drawing the report places in the PDF, and decoded both with a separate QR reader. Each decodes to exactly the lot's address. A phone camera was not tried.
- **The report with a real batch:** I built the report for a real demo batch with a lot shared, then cleared the share again. With the code allowed the page has the "Scan to see where this lot comes from." line, without it the line is not there.
- Not checked: scanning with a phone or scanning the code on a printed or on-screen PDF page (the drawing was decoded, not the finished page), the Print and Download image buttons (the print layout is written and the PNG conversion needs a real click, neither was tried), a farm that has a district chosen (the demo farms have only an old text place, so the Place row was left out, which is the tested behaviour), the supervisor view, and French and Kinyarwanda on screen (the dialog and page are tested in French).

### What it does
- **Making the code.** On a batch's harvest page each record has a "Share with QR" button (the owner only). The label says what it does: it makes the lot visible to others. The dialog first says what a buyer will see and what they never will, and the code is only made when the farmer presses "Create the QR code".
- **What a stranger sees:** the farm name, the district and province, the cooperative if there is one, the breed, the start and harvest dates, the days of rearing, the cocoon weight, the silk yield if recorded, and the grade, and a line saying the numbers were recorded by the farmer in SSMS.
- **What a stranger never sees:** the owner's name, email or phone, the street, the exact position, the notes, or anything else. A test searches the whole answer for the owner's name, email, street, coordinates and notes.
- **Stopping.** "Stop sharing" asks first and says that printed codes stop working. The link then answers "This link is no longer valid." like an unknown link, so nobody can tell an ended link from one that never existed. Sharing again makes a new code.
- **Printing and saving.** Print leaves only the code, the line "Scan to see where this lot comes from." and a caption (farm, harvest date, weight) on the paper. "Download image" saves a PNG. The code is always drawn dark on white, also in dark mode, because that is how scanners read it.
- **Safety of the link.** The code holds a 22 character random secret, not the lot's id. It is not in the harvest list (which only says whether a lot is shared), not in the audit log, and the page is never kept by browsers or listed by search engines (`Cache-Control: no-store`, `X-Robots-Tag: noindex`, a noindex tag, and `Disallow: /lot/` in robots.txt). A stranger is slowed to 30 requests a minute.
- **Who may:** the owner and administrators make and end links. A supervisor may read lots but not change them, so gets nothing. Another farmer gets "not found".
- **On the batch report.** Once a lot is shared, its QR code is also printed on that batch's PDF report, with the farm, the harvest date and the weight and the line "Scan to see where this lot comes from.", ready to cut out for the box. The dialog says so. The report only carries it for the farmer who owns the batch and for administrators. A supervisor still gets the report, without the code, since the code holds a secret address.
- **The privacy policy** has a new section about it.

### Needs doing on Render
- Run the migration `harvest/0003_harvestrecord_share_token` when you deploy. It adds two empty columns. It is already applied to your local database.

### Decided
- **A deliberate step, not an automatic code.** A code that opens a farmer's data to anyone who scans it is a privacy choice, like a share link in a document app, so it is made on purpose. Once it exists it shows up where it is useful, on the report.
- **A lot is one harvest record**, not a whole batch, since the weight and the grade belong to a harvest.
- **The district, not the village.** A buyer needs the area, and a village can point at a household.
- **The cooperative is shown** when the farm's owner is in one. It names an organisation, not a person.
- **The numbers are the farmer's own.** The page says so. Nothing on it is checked by SSMS.
- **The link is stored as it is**, so the farmer can print the code again later. Invitation links are stored hashed because they are shown once. A printed code cannot be shown once.
- **No per-scan statistics.** Nothing is recorded about who opens a page.
- **The French and Kinyarwanda texts are my drafts** and need a native read. The privacy policy section is in English only, like the rest of that page.
- A leftover from the compare work: the cocoon word is Igishishwa on the landing page and in the stages, and "imideri" in other texts. The page uses "imideri" for cocoon weight as the other pages do.

## Chore: tidy imports

`ruff` reported 21 older findings in files nobody had touched for a while. 18 are fixed with `ruff --fix`, which only reorders or removes import lines: imports out of order in 15 files and 3 unused imports.

- Backend: 1528 tests pass before and after, `python manage.py check` is clean, and `ruff` reports nothing outside the one file below.
- Left alone: `rsn_train_sericulture_model.py`, the model training script. It has 3 findings (an unused `os`, an unused `tensorflow` import and the import order). I cannot run it here and it is not part of the app, so it is the owner's to tidy.
- Frontend lint is still not run: `package.json` has a `lint` script but ESLint is not a dependency and there is no ESLint configuration. Adding it is a tooling choice and belongs with the CI work (item F3).

## Compare batches side by side (Plan 9, item G5)

A new page puts two to four batches next to each other, marks the best result in each row, and draws how much each one harvested over time.

### Checked
- Backend: 1516 tests pass (36 new for this). Frontend: 1477 tests pass (42 new) and `tsc` is clean. No migration. `ruff` is clean. ESLint is not installed on this machine, so frontend lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **In a real browser** with a throwaway administrator (deleted again) and your seeded demo data: the picker lists the batches, three finished demo batches compare, the best cocoon weight and silk yield are marked, and the chart draws one point for each. Looked at in light, dark and at phone width (the page does not scroll sideways, and the table scrolls inside its own box).
- **Checking against your real database found two problems the tests could not see**, both fixed here, and a third in older code that was fixed separately (see below).
- Not checked in a browser: French and Kinyarwanda on screen (the page is tested in French), the farmer and supervisor views (the same page and the same access rules, tested), the yield per egg box and per 1,000 worms rows (your demo batches have no start count, so those rows are left out; they are tested), and a screen reader.

### What it does
- **Where:** a "Compare batches" button on the Batches page, "Compare batches" in Ctrl K, or `/batches/compare`. Pick two to four batches (up to four, in the order you click), press Compare, and the choice is in the address, so a comparison can be bookmarked or sent.
- **The table** has one column for each batch and rows in three groups. The batch: breed, start date, days running, what it started with, room. What it gave: cocoons harvested (kg), silk (g), cocoons per egg box and per 1,000 worms, harvests recorded, grades. How it went: deaths, death rate, share of readings inside the safe range, disease checks, grasserie found, problem alerts.
- **"Best"** is written next to the best value in a row, not shown by colour alone. It is marked for cocoon weight, silk and yield (highest), death rate, grasserie and problem alerts (lowest), and time in the safe range (highest). Nothing is marked when the batches are equal, or when fewer than two have a value.
- **The chart** shows the total cocoons harvested so far, by the day since each batch started, one line for each batch with its own colour and its own dash, and a table of the same numbers for screen readers.
- **Who may compare what:** the same rules as everywhere else. A farmer compares their own batches, a supervisor their cooperative's, an administrator any. A batch that does not exist and one you may not see give the same answer.
- **The server:** `GET /api/batches/compare?ids=a,b,c`. Two to four different ids (a repeated id counts once, anything else gives a plain message), a fixed handful of queries however many harvests or checks there are, and nothing is changed.

### Found on the way
- **A crash on your database.** In your database the batch dates (`startDate`, `expectedHarvestDate`) are stored as `timestamp without time zone`, so Django hands them back naive even though the project uses time zones. The first version of the endpoint subtracted one from the current time and returned an error on real data. The test database is built from migrations and has proper time zone columns, so the tests passed. There is now a test that reproduces your column type (it changes the column inside a transaction that is rolled back), and the comparison makes those dates aware first.
- **The same crash existed in the batch report PDF and in recording deaths.** Those were fixed separately and merged first (see the next entry), and the comparison now uses the same shared helper, `core.timeutil.aware`.
- **Stage changes counted as alerts.** The existing alert count includes the "stage changed" notices, so every finished demo batch showed 4 alerts. The comparison now counts only temperature, humidity and disease alerts and calls them "problem alerts".

### Decided
- **Deaths are shown but not ranked.** A batch that started with more worms will have more deaths. Only the death rate is marked, and it is only known for batches counted in worms.
- **Yield per egg box and per 1,000 worms are separate rows** and are never ranked against each other. A row that no batch has a value for is left out.
- **Harvests recorded and disease checks are not ranked**, since more or fewer of them is not better or worse in itself.
- **Safe range uses the batch's current stage** for the whole life of the batch, as the batch report does. A batch that has moved on is judged by its latest range.
- **Per farm trends are not built.** "Yield over time" here means within a batch's own harvests, lined up from its start day. A view of one farm's batches one after another would be a separate page.
- **Not in the sidebar.** The page is reached from Batches and from Ctrl K, so the menu does not get longer.
- The French and Kinyarwanda texts are my drafts and need a native read.

## Fix: the batch report and recording deaths on databases with naive batch dates

Two things crashed on the local development database: opening a batch report as a PDF for any batch that is not at harvest stage, and recording deaths on a batch.

### Cause
The batch dates (`batches.startDate` and `expectedHarvestDate`) are stored as `timestamp without time zone` in the local database, because it was built before Django. Django returns those dates without a time zone even though the project uses time zones, and code that took one away from the current time (`batches/report.py`) or turned one into a local day (`batches/mortality_views.py`) stopped with `TypeError: can't subtract offset-naive and offset-aware datetimes` or `ValueError: localtime() cannot be applied to a naive datetime`. The test database is built from migrations and has proper columns, so the tests did not see it.

### Fix
- `core/timeutil.aware()` gives a date its time zone (UTC, which is how they were saved) when it has none, and leaves any other date as it is.
- The report and the mortality view use it.
- `conftest.py` has a `naive_batch_dates` fixture that changes the two columns to the older type inside the test's transaction, which is rolled back afterwards. The new tests use it, and they fail without the fix (checked by putting the old code back).

### Checked
- Backend: 1492 tests pass on this branch (12 new) and `ruff` is clean on the changed files. The whole project still has 22 older `ruff` findings in other files, which I left alone.
- Against the local database, read only: the report for a batch at cocoon stage, which raised `TypeError` before, now builds (134 KB). Recording deaths was covered by the test only, since trying it would write to the local database.

### Looked for, not changed
- Other columns of the older type are `alert_logs.createdAt`, `disease_detections.detectedAt`, `farms` and `users` dates and `sensor_readings.timestamp`. I searched the code for places that take them away from the current time or turn them into a local day and found none; the other uses only print them. `core/health.py` already handled this case itself.
- `batches/compare.py` on the compare batches branch has its own copy of this helper. It should use `core.timeutil.aware` once both are merged.
- If the production database was also built before Django, these two crashes would have happened there too.

## Share preview and install check (Plan 9, item G7)

The deployed site now points its share preview at its own address instead of localhost, and the web app is set up to be installed on a phone with an icon that survives Android's round mask and a start page of its own.

### Checked
- Frontend: 1435 tests pass (26 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **Share preview:** I built the site with Vercel's variable set by hand (`VERCEL_PROJECT_PRODUCTION_URL=ssms-django.vercel.app`). The built page has `canonical`, `og:url` and `og:image` on `https://ssms-django.vercel.app` and no `localhost` anywhere.
- **In a real browser** with a throwaway administrator (deleted again): opening `/app` signed out lands on the login page. Signed in, a fresh load of `/app` restores the session and lands on `/admin`. The manifest and all four icons load and have the sizes they say.
- Not checked: a real Vercel build (the variable was set by hand, and it only works if the project exposes Vercel's system variables, which is the default), what WhatsApp shows for the link after a deploy, and the "Add to home screen" prompt on a phone. The pane cannot do the last one, so the install side is covered by tests of the manifest and icons.

### What was wrong
- **The share preview was broken on the live site.** `ssms-django.vercel.app` served `og:image`, `og:url` and the canonical link as `http://localhost:4173/...`, because `VITE_SITE_URL` is not set on Vercel and the build fell back to the local default. A WhatsApp or Facebook link would show no image. The live `sitemap.xml` and `robots.txt` pointed at `localhost:5173` for the same reason.
- **The installed app would open on the public landing page** (`start_url` was `/`), even for someone who was signed in.
- **The app icons were not safe for Android's mask.** The farthest point of the emblem is 43 percent of the icon width away from the centre, and the safe zone for Android's round mask ends at 40 percent, so the leaf tips would be cut.
- A correction to my own earlier plan: the **WhatsApp share button on invite links already exists** (the invite dialog has Copy and Share on WhatsApp, and it is tested). Nothing was needed there.

### What changed
- **`scripts/siteUrl.mjs`** works out the site address: `VITE_SITE_URL` when it is set, otherwise on Vercel the production address Vercel gives the project, otherwise the address of that deployment. `vite.config.ts` and the sitemap script both use it, so a deployed build never points at localhost. Local builds are unchanged.
- **`/app`** is a new page that sends a signed in person to their own dashboard and anyone else to the login page. The manifest's `start_url` and `id` are `/app`. The role to dashboard rule was written out in two places and is now one function, `homePathFor`.
- **Maskable icons.** `icon-maskable-192.png` and `icon-maskable-512.png` have the emblem smaller on a solid white square, so it stays inside the safe circle. The plain icons are untouched. `npm run icons` builds them, and it rebuilds the other icons byte for byte.
- **The manifest** now has `id`, `scope`, `lang`, the start page, and the four icon entries (plain and maskable, never both in one entry).
- **Tests** check the address rules, the start page and its route, that every icon file exists with exactly the size it says, that the maskable emblem sits inside the safe circle on a solid background, and the new page for each role and for a signed out visitor.

### After the merge
- Vercel redeploys. Open the site's page source and check that `og:image` starts with `https://ssms-django.vercel.app`, then paste the link into WhatsApp. WhatsApp keeps old previews for a while, so a link shared earlier may still show the old one. Facebook's Sharing Debugger can refresh it.
- If the page still says `localhost`, set `VITE_SITE_URL` to the real address in the Vercel project settings. It takes priority over everything above.

### Decided
- **Nothing sets `VITE_SITE_URL` by hand.** The Vercel address is used when it is missing. A custom domain later needs `VITE_SITE_URL` set once.
- **No service worker was added.** The app needs the network anyway, and offline use is G10, which is not being built. I could not try the install prompt on a phone, so if a phone refuses to offer it, a minimal service worker is the first thing to try.
- **Join links share the general preview.** A link to `/join/...` shows the site's title, description and image, because the app is a single page and link previews do not run JavaScript. Giving each invite its own preview would need the server to render that page.

## One motion style that respects reduced motion (Plan 9, item G8)

The signed in app now follows the "reduce motion" setting of the computer everywhere, and its code and stylesheets share one set of durations and one easing curve.

### Checked
- Frontend: 1409 tests pass (18 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **In a real browser** with a throwaway administrator (deleted again): the app signs in and changes pages, the sign out dialog opens and closes, and the new reduced motion rules are loaded in the page. The browser pane cannot switch on the computer's "reduce motion" setting, so that path is covered by the tests and not by watching it. Timers in the pane also run slowly, so I could confirm that the dialog opens and closes but not how smooth it is.
- Not checked: a real computer with "reduce motion" turned on, and the landing page (its own motion code is unchanged).

### The audit
What I found before changing anything:
- **Framer animations ignored the setting.** Page changes (a fade with a 10 pixel slide), dialogs (scale and slide) and toasts (slide and scale) always moved. Framer only follows the setting if it is told to.
- **Smooth scrolling was on for everyone** (`html { scroll-behavior: smooth }`). Only the landing page turned it off.
- **The stylesheet rules covered part of the app.** A few blocks switched off the skeleton shimmer, the progress bar and the sidebar. The `anim-in`, `anim-fade` and `anim-scale` classes had no rule.
- **No shared style.** Durations in code were 0.28, 0.15, 0.18, 0.24 and 0.2 seconds, and in the stylesheets 0.2 seconds in 22 places, 0.25 in 12, 0.3 in 5, 0.4 in 4 and a few more. The easing curve was written out by hand in three files.

### What changed
- **`MotionProvider`** wraps the app and tells framer whether the person asked for less motion. When they did, slides and scaling are dropped and only fades remain. It follows the setting while the page is open.
- **`utils/motion.ts`** holds the shared easing (`EASE_OUT`), the three durations (`fast` 0.12, `base` 0.2, `slow` 0.35 seconds) and the page change and arrive and leave transitions. The page change, dialogs and toasts use them. A test fails if the values drift from the `--ease-out` and `--duration-*` tokens in `index.css`, or if one of those three files brings back its own numbers.
- **In the stylesheet**, smooth scrolling is only for people who did not ask for less motion. One rule under "reduce motion" cuts every animation and transition to a hundredth of a millisecond and runs animations once. The loading spinner is the one exception, because it is the only sign that something is loading.
- **The usual 200 ms** in the app stylesheets now comes from `--duration-normal` (15 lines), and a test stops raw 0.2 second values coming back. The value is the same, so nothing looks different.
- **Test setup:** `matchMedia` in the tests now answers with the live setting and tells listeners when it changes, like a browser does.

### Decided
- **Fades stay for people who asked for less motion.** A fade is not the kind of movement the setting is about. Slides, scaling, looping and smooth scrolling go.
- **The other raw durations stay** (0.25 seconds in 12 places, 0.3 in 5, 0.4 in 4, 0.15 in 2 and a few single ones). Moving them to the tokens would change how some things feel for no gain a person would notice. They are all cut to nothing under "reduce motion" anyway.
- **The landing page keeps its own motion code.** It already respects the setting.

## Stage names in three languages and a translation check (Plan 9, item G9, first part)

The five batch stages now read in the language of the screen, and a test makes sure every text in the app has English, French and Kinyarwanda.

### Checked
- Frontend: 1391 tests pass (16 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **I tried it in a real browser** with a throwaway administrator (deleted again). In French the batch list tabs, the stage badges and the stepper read Œuf, Larve, Pupe, Cocon, Récolte. In Kinyarwanda the stepper reads Igi, Larva, Pupa, Igishishwa, Isarura.
- I broke one French text on purpose and the new test failed, then I put it back.
- Not checked in a browser: every one of the 15 places the stage name is used. The batch list, batch page and stepper were looked at, the rest are covered by the type check and the tests.

### What changed
- **The bug.** The stage names (Egg, Larva, Pupa, Cocoon, Harvest) were one English-only list, used in 15 places. A French or Kinyarwanda user saw English stages on badges, in the stepper, in alerts, in the reports and inside sentences such as "Larva, température minimale".
- **The fix.** `stageLabel(t, stage)` reads the name from the translations (`stageEGG` and the four others). An unknown stage is shown as it came.
- **One name for each stage.** The words are the ones the landing page already used, and a test keeps the two lists equal.
- **The translation check** (`i18n/parity.test.ts`) fails when a text is missing or empty in any language, when a language drops a placeholder such as `{name}`, when a text contains an en dash or em dash, when placeholder text such as TODO is left in, when a French or Kinyarwanda sentence is still English, or when the landing and page texts share a key. All 1540 texts pass today. The product name is allowed to stay the same in every language.
- One old test expected the English word "Larva" inside a French label, which was the bug. It now expects "Larve".

### Not changed
- Alert messages that come from the server, such as "Grasserie suspected in this batch", are still written in English by the server. That is a separate change.
- The Kinyarwanda words are my drafts. "Larva" and "Pupa" are kept as they are, and cocoon is "Igishishwa" on the landing page and in the stages, while other texts call the cocoon "imideri". A native speaker should choose one.

## A small language switcher and a better first language (Plan 9, item G3)

The signed in app has a small EN FR RW switcher in the top bar, and the app picks its first language from the browser's whole ranked list.

### Checked
- Frontend: 1375 tests pass (35 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **I tried it in a real browser** with a throwaway administrator (deleted again):
  - The EN FR RW switcher sits in the top bar next to Search. Pressing FR changed the whole page to French at once, and the French was still there after a reload.
  - At phone width the switcher is not in the top bar. The same choice is in the account menu, under Language, above Appearance, and it fits with no sideways scroll.
- Not checked in a browser: picking the first language from the browser (an emulated browser does not let me change its language list, so this is tested with a stubbed list), Kinyarwanda on screen, and a screen reader.

### What changed
- **Phones had no switcher in the app.** The old language menu in the top bar was hidden on screens under 420 pixels wide, so a person on a small phone could not change language inside the app. Now a small row of codes, EN FR RW, is in the top bar from 640 pixels up, and the same choice is in the account menu on narrower screens.
- **The switcher** (`components/ui/LanguageSwitcher.tsx`) shows the short code. The full name (English, Français, Kinyarwanda) is the tooltip and the accessible name, and each button carries its own `lang`, so a screen reader says each name in its own language.
- **The first language** is the first one in the browser's ranked list that the app speaks. Before, only the browser's first entry was read, so a browser set to German then French got English. "fr-CA" counts as French, and so does Kinyarwanda given as `kin`. A browser that speaks none of them gets English.
- **A blocked browser store no longer breaks the app.** Reading or saving the language threw when the browser refused storage, which could stop the page from loading at all. Now the language works for the visit and is just not remembered.
- A language picked from the browser is not saved. Only a choice the person makes is saved, so a browser language change is followed until they choose.

### Decided
- **The landing page and the sign in pages keep their language menus.** They already work on a phone, and the landing page has its own design. Changing them is a separate design decision.
- **Two places on purpose.** The pill and the account menu row exist in the page at the same time and one is hidden by screen width, so a keyboard or screen reader user on a narrow screen finds the menu row, and on a wide screen the pill.
- The word "Language" is the one the landing page already had in the three languages. The new texts are the same ones, so there is nothing new for a native reader to check beyond the codes.

## Dark mode for the signed in app (Plan 9, item G2)

The signed in app has a dark theme. Open the account menu and pick Auto, Light or Dark under Appearance. Auto follows the computer and changes with it.

### Checked
- Frontend: 1340 tests pass (98 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **I tried it in a real browser** with a throwaway administrator (deleted again), who sees the seeded farms, batches and alerts:
  - Looked at screenshots of the dashboard, system report, new farm form, farm page, batch page with its charts, the account menu and quick search in dark. Light and dark switch over at once from the menu. The sign out dialog I only checked by its computed colours, since the screenshot of it arrived late.
  - A script measured text against its background on 19 pages (every admin page, farms, batches, harvests, disease reports, alerts, devices, supervisor overview, cooperative report, profile, new farm, and one batch page) and found no text under 4.5 to 1. It reads computed colours and each page had under two seconds to load, so it does not replace looking.
  - The landing page stays light for a signed in person who chose dark.
  - A phone width screen is dark, with no sideways scroll.
- Not checked in a browser: a screen reader, French and Kinyarwanda on screen, a computer whose setting changes while the page is open (this is tested, not tried), print, the farmer dashboard, the supervisor farmers page, and a reload straight into dark (the boot script is tested, not watched).

### What it does
- **Where it applies.** Only inside the signed in app. The landing page, sign in and sign up pages, and the legal pages keep their own light look. The theme goes on the page when the app opens and comes off when it closes.
- **No cream flash.** A tiny script (`public/theme-boot.js`) runs before the app and sets dark for a signed in person who wants it, so a reload does not flash the light page while the app loads. It skips the public pages, and a test checks it against every public route in `App.tsx`.
- **The choice** is saved in the browser (`ssms_theme`), shared between tabs, and still works when the browser refuses to save it.
- **Colours are tokens.** Every surface, tint, message, risk label and coloured word in `index.css` now has a light and a dark value. The light values are the ones that were already there, so light mode should look the same.
- **Charts** draw with `--chart-1` to `--chart-5` and keep a name's colour in both themes. The dark shades are lighter versions of the same five hues.
- **Contrast is tested.** A test reads `index.css` and fails if text, links, messages, risk labels or chart colours drop under their limit in either theme: 4.5 to 1 for text and 3 to 1 for chart colours. Another test fails if the app stylesheets bring back a white surface or their own select arrow.

### Decided
- **Signed in app only.** The landing page has its own designed look. A dark landing page would be a design task of its own.
- **Three choices, with Auto first.** Most people never open the menu and get what their computer is set to.
- **The sidebar and toasts are dark in both themes**, so they do not change.
- **Map tiles stay light.** They come from an outside map service.
- **Light faint text and placeholders are not at 4.5 to 1.** The faint grey (`--text-faint`) and the placeholder grey were already under that in light mode. I kept them as they were, and the test only holds both themes to 3 to 1 for those two.
- **I could not run the palette validator** from the data visualisation skill: its script is not on this machine. I checked the dark chart colours myself for contrast on a card (3 to 1 or more) and compared how far apart they are in OKLab: the closest pair is 11.0 in both themes (blue and plum), so dark keeps the separation light has. I did not simulate colour blindness.
- The texts (Appearance, Auto, Light, Dark) are in English, French and Kinyarwanda. The French and Kinyarwanda are my drafts and need a native read.

## Quick search with Ctrl K (Plan 9, item G1)

Press Ctrl K (Cmd K on a Mac) anywhere in the signed in app, or press Search in the top bar, to jump to a page or to one of your farms without using the menu.

### Checked
- Frontend: 1242 tests pass (49 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- `npm test` still prints the one unhandled `RangeError` from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.
- **I tried it in a real browser** with a throwaway farmer who had two farms (the account and its farms are deleted again):
  - Ctrl K opens the box with the cursor in it and lists the farmer's pages and farms.
  - Typing a place name and pressing Enter opened the right farm, closed the box and gave the page its scroll back.
  - At phone width the box fits, with no sideways scroll. The top bar button shrinks to the search icon.
  - No console errors.
- Not checked in a browser: the Cmd K key on a Mac, a screen reader, French and Kinyarwanda on screen (the box is tested in French, not looked at), and the supervisor and admin lists.

### What it does
- **Pages:** every page in the person's own menu, plus Profile, and New farm for farmers and admins. A farmer never sees admin pages in the list.
- **Farms:** the farms the person may see, with the place under each name. Supervisors and admins can also find a farm by its owner's name.
- **Matching:** every word typed must appear somewhere in the name, place or owner. It ignores capitals and accents, so "elevage" finds "Élevage". A name that starts with what you typed comes first. At most 8 farms show.
- **Keyboard:** Up and Down to move (they wrap), Enter to open, Escape to close, Ctrl K again to close. The focus goes back to where it was.
- **Screen readers:** it is a combobox with a list of options, and a hidden line says how many results there are.
- The farms are read once, the first time the box opens, and searched on the device after that. If they cannot be read the pages still work, and the next opening tries again.
- Shift K and Alt K are left alone, since browsers use them.

### Decided
- **Pages and farms only for now.** Batches, people and alerts are not searched. There is no list of all batches for a farmer, so searching them would mean one request per farm. It is a good next step once there is a search endpoint on the server.
- **No recent items.** With nothing typed it shows every page and five farms.
- The texts are in English, French and Kinyarwanda. The French and Kinyarwanda are my drafts and need a native read.

## The access token is kept in memory (Plan 9, item I5)

The sign in token is no longer saved in the browser. It lives in the page's memory, and a reload gets a new one from the refresh cookie.

### Checked
- Frontend: 1193 tests pass (47 new) and `tsc` is clean. No backend change and no migration. ESLint is not installed on this machine, so lint was not run.
- **I tried it in a real browser** against your running backend, with a throwaway farmer account that I created and have deleted:
  - A visitor who never signed in makes no API call and stores nothing.
  - After signing in, browser storage holds one flag, `ssms_session`, and no token and no user.
  - A reload keeps the person signed in: one refresh call, then `/auth/me`, with no login screen in between. It stays one refresh call even though `StrictMode` mounts the app twice.
  - Signing out clears the flag, and a reload goes to the login page without any API call.
  - A browser that still has the old `ssms_token` and `ssms_user` keys has them removed, and is not signed in from them.
- The throwaway account left 2 audit-log rows (its login and logout) in your local `ssms_db`. I did not edit the audit log.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### What this changes
- **Before:** the access token and the user (name, email, role) were saved in `localStorage`, so any script on the page, or anyone with the browser profile, could read them, and they stayed after the tab closed.
- **Now:** the access token is a variable in a small `session` module. The user is read from the server after each reload. The only thing saved is `ssms_session`, a flag that says a sign in may still be alive, so a visitor does not trigger a pointless refresh. The refresh token was already an httpOnly cookie, and still is.
- **Where it helps and where it does not.** This closes the easy theft of a saved token. It does not stop a script that runs inside the page: such a script can still call the API as the person, or ask for a new token with the cookie. Stopping that is the job of a Content Security Policy and of keeping untrusted code out of the page.

### Changed
- `services/session.ts` is new. It holds the token and the flag, and it does the renewal.
- **One renewal at a time.** The server rotates the refresh cookie and refuses the old one, so two renewals at once would sign the person out. Requests that run out together now share one renewal, and a Web Lock makes tabs take turns.
- **A renewal with no answer keeps the session.** If the server cannot be reached, the person is not signed out. Only a real refusal ends the session.
- A page reload shows the loading spinner while the sign in is restored, then the page.
- The three CSV exports (audit log, system report, disease checks) used `fetch` and read the token from storage. They now go through the shared client, like the PDF exports, so they renew a stale sign in too.
- The password change on the Profile page keeps the fresh token in memory.
- `useAuth()` no longer returns the token. Nothing used it.

### Decided
- The user is not saved either. It costs one `/auth/me` call after a reload and avoids showing an old role or name.
- The flag stays in `localStorage`, so a new tab can restore the session too. It holds no secret.

### Known limits
- Each tab holds its own token. A sign in or sign out in one tab does not update the others until they next ask the server.
- A Content Security Policy is not set up yet. It belongs with the security plan.

## The result screen no longer presents the check as certain (Plan 9, item E, wording)

The disease check result no longer says "100% sure", no longer adds "This check can make mistakes. Treat it as a quick second opinion, not a diagnosis.", and describes what the photo looks like instead of stating what is so.

### Checked
- Frontend: 1094 tests pass (6 new) and `tsc` is clean. No backend change.
- I have not looked at the result screen in a browser. It needs the backend and the AI service running, and the wording is covered by tests in English and French.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Changed
- **Removed** the "{n}% sure" line under the result.
- **Removed** the line "This check can make mistakes. Treat it as a quick second opinion, not a diagnosis." from the result screen.
- **Banner.** "No sign of disease in this photo" is now "This photo looks healthy. Keep checking as usual." and "A disease may be present" is now "This photo looks like a case of grasserie." Both still say what to do next. English, French and Kinyarwanda.
- The unused style of the removed line is gone.

### Decided
- You chose to change the result screen only. The score bars ("How likely each condition is") stay, so what the Terms of Service and the landing FAQ say, that each result shows a confidence score, is still true.

### Left as they are, in case you want them changed
- The Terms of Service, the landing FAQ and the landing note still say the check can make mistakes. The Terms are the place for that, so I would keep it.
- The alert text and the alert email still show a percentage, and the email says the check "can be wrong".
- The history tables and the reports still show a confidence column.
- The page subtitle still says "get a quick second opinion".
- The photo-check info card still says it is general advice, not a diagnosis. That line is about the advice, not the result.
- The French and Kinyarwanda words of the new banner are my drafts for a native speaker.
## A better Register page and a way to ask for a new link on Login (Plan 9, item I6)

The Register page now shows the password rules as you type, asks for the password twice, asks for the terms to be accepted, and is in English, French and Kinyarwanda. Sign in and sign up both have a Continue with Google button, which does not work yet. The Join page (invitation link) has the same fields. Login keeps an unverified person on the page and offers a new verification link there.

### Checked
- Backend: 1480 tests pass (5 new). Frontend: 1140 tests pass (52 new) and `tsc` is clean. One migration, `users/0004`.
- **I applied `users/0004` to your local database `ssms_db` myself.** It adds one empty column. Nothing else is pending.
- I looked at the Register page in a browser, in English and in French, on a desktop and a phone width: the rules tick as you type, the mismatch message shows, the page does not scroll sideways and the console is clean. I also looked at the Login page and the Continue with Google button on a phone width.
- I have not seen the Login notice for an unverified email or the Join page in a browser. They are covered by tests only.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **Live password rules** under the password, as plain lines of text: at least 8 characters, an uppercase letter, a lowercase letter and a number. A met rule turns green, goes bolder and gets a tick, so it is not shown by colour alone. Each rule also says in words whether it is met, for a screen reader. The old hint said "one uppercase letter and one digit" and left out the lowercase rule the server has always required.
- **Confirm password.** A message appears as soon as the second box differs from the first.
- **Terms box.** "I agree to the Terms of Service and the Privacy Policy", with both links opening in a new tab so nothing typed is lost. The form is not sent without it.
- **Plain messages before the server is asked** when a rule is broken, the two passwords differ or the box is not ticked.
- **The acceptance time is kept.** `users.terms_accepted_at` is set when the box was ticked. It is not returned by the API. The privacy policy says it, and its date is now 29 October 2026.
- **Login.** When an account's email is not verified, the page stays as it is, keeps what was typed, says so, and offers "Send a new link". It says when the link is on its way and when it could not be sent, and it forgets the notice when the email is changed or another attempt is made.
- **Continue with Google** under the form on Login and on Register, after an "or" line. It does not work yet. Pressing it says "Sign in with Google is not available yet." and does nothing else. It is outside the form, so it never sends it.
- **Translations** of all the Register, Join and new Login text into French and Kinyarwanda. They are my drafts for a native speaker.

### Changed
- The Register page no longer sends a role. The server never read it.
- The Join page uses the same fields as Register.

### Decided
- The terms box is required on both screens, but the server does not refuse a registration that leaves it out. It only records the time when it is sent. Refusing it on the server would break every other client of the API, and the page already stops it.
- The server still judges common passwords and passwords close to the name or email. The page cannot check those, so the server's message shows if one is chosen.
- A person with an unverified email now stays on Login. The "check your email" page is still used right after registering.
- The Google button is there so the layout and the words are settled. Making it work needs a Google Cloud project, a client ID and a server route, and is a separate item.

### Known limits
- The Reset password page still has its own English rule list and English text. It is the next screen to bring in line.
- Server messages (for example "An account with this email already exists") are still English in every language.

## How the check does on photos it has not seen (Plan 9, item E, step 2)

A script scores the silkworm check on photos that were not in training, and `docs/model-card.md` reports the result with its limits.

### Result
- 691 silkworm photos (594 Grasserie, 97 Healthy), none of them in the training folder. The check answered 690 and was right on 99.4% of those, and on 99.3% of all 691 (95% interval 98.3 to 99.7).
- Grasserie recall 99.2%, Healthy recall 100.0%. Four Grasserie photos were called Healthy, three with a high score. A disease called healthy raises no alert, so that is the direction that matters.
- All 110 mulberry leaf photos were refused as not a silkworm.
- The 0.60 limit changes little on these photos, so I left it. The card has the table for 0.50 to 0.95.
- The strict rule dropped 128 of 722 Grasserie photos and 235 of 332 Healthy photos from the test folder, because the same photo is in `new_dataset`.

### What this does not show
- These photos come from the same dataset as the training photos. Photos from Rwandan farms will be harder, so this is the best case.
- The only non-silkworm photos tested are leaves. A hand, an empty tray or a cocoon could be called Grasserie or Healthy with a high score. Not tested.
- The four mistakes are numbered close together, so related photos may count more than once. The intervals do not account for that.
- Only 97 Healthy photos were left after the strict rule.
- The 44 `disease_free` leaf photos could not be compared with training, because that folder is gone.

### Checked
- AI service: 92 tests pass (53 new in this step and the last), 1 skipped as before. Nothing else changed, so the backend and frontend suites were not rerun.
- I ran `evaluate.py` on your dataset, 801 photos, with the real model. The numbers in `docs/model-evaluation.json` are that run. A test checks that every figure in the card matches that file.
- No migration. Nothing in the app changed.

### Added
- `ai_service/decision.py`: the rule that turns scores into Grasserie, Healthy, NotSilkworm or Uncertain. The service and the evaluation share it, so the numbers are about what the service really says.
- `ai_service/evaluation.py` and `ai_service/evaluate.py`: choose one file per photo, leave out photos seen in training, count the answers, give 95% intervals, list the mistakes and try other limits.
- `docs/model-card.md` and `docs/model-evaluation.json`.

### Known limits
- Rerunning needs TensorFlow and the course dataset on your computer. The dataset is not in the repository.
- The farmer answers in the app ("Was this result correct?") will be a better measure than this page once there are enough of them. Nothing summarises them yet.

## The disease check is about silkworms (Plan 9, item E, step 1)

The check now says what the model really sees: grasserie or a healthy silkworm. A photo that is not a clear silkworm gets a calm answer and is not saved. No more Flacherie, Muscardine or Pebrine, which the model was never trained on.

### Why
- The model has five outputs, in the alphabetical order of its training folders: `disease_free`, `grasserie_silkworms`, `healthy_silkworms`, `leaf_rust`, `leaf_spot`. The service named them Flacherie, Grasserie, Healthy, Muscardine, Pebrine. Only Grasserie and Healthy were right.
- So a healthy mulberry leaf came back as "Flacherie", and a leaf with rust as "Muscardine".
- I confirmed the order by running 40 photos from each of your test folders through the model. Every class landed on the index above.

### Checked
- AI service: 39 tests pass (23 new), 1 skipped as before. Backend: 1475 tests pass (26 new). Frontend: 1088 tests pass (7 new) and `tsc` is clean.
- I ran the real model through the real service on 12 photos of each class from your `test` folder: Grasserie 12 of 12, Healthy 12 of 12, and the leaf photos came back as "not a silkworm". Some large leaf photos were refused by the existing 5 MB and unreadable-photo limits, so they never reached the model.
- This is a smoke test, not an evaluation. Evaluation numbers come in step 2.
- No migration. I have not looked at the new result screen in a browser.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Changed
- **AI service.** The class order is read from `sericulture_resnet50_model.classes.json`, saved next to the model. The service will not start without it, and refuses to answer if the model and the file disagree on the number of classes.
- **Four answers.** Grasserie, Healthy, NotSilkworm (the model takes it for a leaf) and Uncertain (its top score is under 0.60). Only the Grasserie and Healthy scores are reported. The limit 0.60 is a starting value, not a measured one. `UNCERTAIN_BELOW` changes it.
- **Backend.** An unclear photo is answered with status 200 and a short message. It is not saved, not uploaded to Cloudinary and raises no alert. A result this version does not know (for example from an older service during a deploy) is refused with the usual "couldn't finish" message and nothing is saved.
- **Alerts.** Only Grasserie raises a disease alert. The feedback choices are Healthy, Grasserie and Something else.
- **Screens.** The result page shows "This does not look like a silkworm" or "The check is not sure about this photo", with what to do and "Nothing was saved". The disease card now covers grasserie only. The photo tips no longer mention leaves. The landing page FAQ and the example card say what the check was trained on.
- **Demo seed.** The one sick check is now Grasserie.
- **`docs/disease-guidance.md`.** The notes on flacherie, muscardine and pebrine are taken out, with a line saying why. They stay in the git history.

### Added
- `python manage.py list_old_detection_names`. It only counts saved results the check can no longer give, and the disease alerts that name them. It changes nothing.
- On your local database it finds 3 old results (2 Flacherie, 1 Muscardine) and 1 old disease alert. They came from leaf photos or from the wrong names. I left them alone.

### Decided
- An unclear photo is not saved, so the healthy and disease counts stay true.
- Old saved results are listed, not changed. Deleting or relabelling them is your call.
- The leaf outputs of the model are not used. Adding leaf checks back later is mostly a screen and wording change.

### Known limits
- The French and Kinyarwanda words of the new messages are my drafts for a native speaker.
- Existing records with an old name still show with that name, with no advice card and a neutral colour.
- `DISEASE_ALERT_MIN_CONFIDENCE` (0.5) is now below the service limit (0.60), so it only matters if the limit is lowered.

## System health and safe ranges (Plan 9, item D5)

Two admin pages under System. "Safe ranges" lets an admin change the temperature and humidity limits of each stage, and shows who changed them last. "System health" tells an admin in words whether the database, the disease check service and the sensors are working, and which services are set up.

### Checked
- Backend: 1449 tests pass (45 new). Frontend: 1081 tests pass (44 new) and `tsc` is clean. One migration, `alerts/0007`.
- **I applied `alerts/0007` to your local database `ssms_db` myself.** Nothing else is pending.
- I ran the health checks against `ssms_db`. That run found a real bug: the dev database returns some reading times without a time zone, and the sensors check crashed on them. A test now covers it and the checks run.
- Locally the report says "Problem" for the disease check service (it is not running) and for the sensors (the demo readings are from yesterday). Both are true.
- I have not looked at either page in a browser.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **Safe ranges** page. One row per stage with four boxes (lowest and highest temperature, lowest and highest humidity), "Save" and "Use the usual range". The page explains a wrong entry in a sentence before anything is sent, and the server checks it again. A change applies to the next reading. An alert that is already open stays open until a reading comes back inside the range.
- **Who changed a range.** Each stage remembers the last admin who saved it and when. Only admins are shown this.
- **System health** page. Six checks (database, disease check service, email, error reporting, photo storage, sensors), each with its status in words (OK, Problem, Not set up) and one sentence. It also counts unread alerts, open temperature and humidity alerts and unanswered messages. "Check again" asks again, and the last answer stays on screen while it does.
- **API.** `PUT /api/alerts/thresholds/<stage>` records the admin. `GET /api/admin/health` is admin only. The authorization matrix has a row for it.

### Decided
- "Not set up" is not a problem. A local machine is meant to print its emails and keep its errors to itself.
- Email, error reporting and photo storage only say that they are set up. SSMS sends no test message and uploads no test photo, and the page says so.
- The report never shows a web address, a key or a password. The disease check service is asked for three seconds at most.
- A reading time without a time zone is read as UTC, as it was written.

### Known limits
- The health page does not keep a history. It shows how things are now.
- Scheduled jobs are not checked, because SSMS has none to report on yet.
- The French and Kinyarwanda words of both pages are my drafts for a native speaker.


## Which contact messages have been answered (Plan 9, item D4)

On the admin Messages page, an admin can mark a message as answered, and the page shows who answered it and when. Nothing is lost when two admins share the inbox.

### Checked
- Backend: 1404 tests pass (18 new). Frontend: 1037 tests pass (11 new) and `tsc` is clean. One migration, `contacts/0002`.
- **I applied `contacts/0002` to your local database `ssms_db` myself**, and checked that the Messages list still answers. Nothing else is pending.
- I have not looked at the Messages page in a browser.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **"Mark as answered"** in the open message, next to "Reply by email". It records the admin and the time, and the message then says "Answered by Aline Uwase, 8 Oct 2026". "Remove the answered mark" takes it back. The Messages page reminds the admin to mark it after sending the reply, because the reply goes out from the admin's own mail app and SSMS cannot see it.
- **Tabs "Unanswered" and "Answered"** with their counts, and an "Answered" badge, in words, on each answered row beside "New".
- **API.** `POST` and `DELETE /api/admin/contacts/<id>/replied`, admin only. The list now carries `repliedAt` and `repliedBy`, loaded in the same query, so it costs the same however many messages were answered.
- Marking and unmarking are written to the audit log. The words of the message are not copied into it.

### Decided
- Marking a message answered also marks it read. Removing the mark leaves it read.
- Marking it again keeps the first answer, so the record says who answered first. It writes nothing new to the audit log.
- The mark is made by hand. SSMS does not send the reply itself, so it cannot know it was sent.

### Known limits
- The bell in the top bar still counts unread messages, not unanswered ones.
- The French and Kinyarwanda words of the new buttons and messages are my drafts for a native speaker.

## The cooperative report (Plan 9, item D3, part 3 of 3)

Supervisors and admins can see what happened on the farms of a cooperative between two dates, and download it as a PDF or a CSV. This finishes D3.

### Checked
- Backend: 1386 tests pass (55 new). Frontend: 1026 tests pass (27 new) and `tsc` is clean. No migration.
- I looked at a rendered French report made from sample data, and the layout is clean. I have not opened the page in a browser or downloaded a file from the running app.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **A "Cooperative report" page** in the menu of supervisors and admins. It opens on the last 30 days. Changing a date reloads by itself, and "Reset" appears only after a change. An admin can also choose one cooperative or all of them. A supervisor always gets their own cooperative.
- **What it shows, for the dates chosen:**
  - farms, farmers with a farm, batches running now and batches started in the period;
  - harvest: records, kg of cocoons, silk, and the grade counts;
  - disease checks by result;
  - alerts by type, with how many were acknowledged and resolved;
  - every farm ranked by risk, with the level in words and the reasons;
  - a table per farm: batches running, cocoons in kg and alerts.
- **Download PDF** on the SSMS letterhead, in English, French or Kinyarwanda, with the words taken from the screens' translations. **Export CSV** has the same numbers as plain rows, safe against spreadsheet formulas.
- **`GET /api/reports/cooperative`** with `from`, `to`, `cooperative` (admins), `export=csv|pdf` and `lang`. Each day is counted from its first second to its last. Dates are checked with kind messages: not a date, an end before the start, and more than one year.
- **A download is written to the audit log**, with who, the cooperative and the dates. Looking at the numbers on screen is not.
- The cost does not grow with the number of farms: the same number of queries for 3 farms or 80, and a test checks it.

### Decided
- The risk levels in the report are how each farm stands **today**, not for the period, because the rule looks at the last 14 days and at sensors now. The report says so in one sentence, on the screen and in the PDF.
- The farms' **exact positions are left out** of the report and its downloads. They are for the map, not for a document that gets passed around.
- A supervisor without a cooperative gets a kind message, not an empty report. A farmer is refused.
- The period counts days in the server's time zone (UTC).

### Known limits
- The PDF lists every farm of the cooperative. A cooperative with hundreds of farms makes a long document, with numbered pages.
- Nothing is cached. Each preview and each download works the report out again.
- The CSV is in English, like the other CSV exports.
- The French and Kinyarwanda words of the report and the page are my drafts for a native speaker.

## A map of farms for supervisors (Plan 9, item D3, part 2 of 3)

The "Farms that need a look first" panel on the supervisor dashboard has a Map tab: a real map with a pin for each farm, coloured by risk.

### Checked
- Backend: 1331 tests pass (25 new). Frontend: 999 tests pass (28 new) and `tsc` is clean. No migration.
- The production build works. The map is its own chunk (154 KB, 45 KB compressed), fetched only when someone opens the Map tab, so the landing page is unchanged at 136 KB of its 250 KB budget.
- The map is tested with the real Leaflet inside the test browser, but **I have not looked at it in a real browser**, so I have not seen the OpenStreetMap pictures load or the pins on them. Please open the Map tab once.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **A real map**, using Leaflet and pictures from OpenStreetMap, with its credit line. It opens zoomed to the farms. "Show all of Rwanda" and "Zoom to the farms" switch the view.
- **A pin for each farm, in its risk colour, and a different shape too**: a diamond with "!" for High, a circle for Medium, a small circle for OK. A pin drawn with a dashed edge means the position is approximate. Colour is never the only difference.
- **A card for the chosen farm**: its name as a link, owner, level in words, the reasons, and, for an approximate pin, "Placed at the middle of its village. The farmer has not saved an exact position."
- **Keyboard use.** Every pin can be tabbed to and chosen with Enter or Space. Leaflet's own Enter key only opens popups, so the choosing is done here.
- **Where each farm goes.** The risk endpoint now gives each farm a `position`: the exact spot its owner saved, else the middle of its village outline, else the middle of its sector, else none. The middle is always a point inside the shape, even for a bent village or one with a hole. It was checked against all 14,802 village outlines. A farm with no place chosen is listed under "Not on the map".
- **Settings.** `VITE_MAP_TILES_URL` and `VITE_MAP_ATTRIBUTION` choose the map picture provider. Both are empty by default, which means OpenStreetMap. Switching to a paid provider with satellite pictures is a setting and not a rewrite.
- **The privacy page** has a new section, "The map". It says the browser asks OpenStreetMap for pictures, so OpenStreetMap can see the viewer's IP address and the area being looked at, and is sent no farm name or position, because the pins are drawn in the browser.

### Decided
- The map is a tab of the existing panel and uses the same ranking data, so it costs no extra request.
- The list stays the first tab, and it is the version for screen readers and for people who cannot use a map.

### Known limits
- OpenStreetMap's free server is meant for light use. That is fine for a cooperative-sized project. For a larger launch, use a provider with a key.
- No satellite view yet, and a farmer cannot set the pin by tapping the map.
- Pins at the same spot sit on top of each other, with no grouping.
- The French and Kinyarwanda words of the map are my drafts for a native speaker.

## A farm keeps its exact position (Plan 9, item D3, part 1 of 3)

"Use my location" now saves the exact spot the farm stands on, so the farm map (the next part) can show it. The farmer can remove it any time.

### Checked
- Backend: 1306 tests pass (32 new). Frontend: 971 tests pass (14 new) and `tsc` is clean. One migration, `farms/0004`.
- **I applied `farms/0004` to your local database `ssms_db` myself.** Nothing else is pending.
- I have not tried it with a real phone, and I have not looked at the form in a browser.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **The position is saved with the farm.** "Use my location" fills the place as before and now also keeps the spot, rounded to about a metre (5 decimals). The form says so, in plain words with the numbers: "The exact position of the farm is saved with it, so your cooperative can see it on the map." A "Remove the position" button forgets it.
- **The server checks it.** Both numbers or neither. Inside Rwanda. Inside the sector chosen for the farm, so a pin can never sit in the wrong place. Each refusal has a kind message.
- **It follows the place.** Choosing another place on the form lets go of the position, because it no longer matches. Moving a farm to another sector through the API without a new position clears the old one. Renaming a farm, or changing only the street, keeps it. An edit sends the saved position back, so saving the form never loses it by accident.
- **Who sees it.** The farm's owner, supervisors of the cooperative and admins, the same people who see the farm. A supervisor cannot change it. A farmer of another cooperative gets a 404.
- **The audit log never holds the coordinates.**
- **The privacy page tells the truth**: it now says the exact position is saved if you use "Use my location", who can see it, and that it can be removed. The old hint on the button said "Your position is not saved". That is no longer true and is replaced.

### Decided
- No map picker. The position comes only from the phone, through "Use my location", as you chose. A farmer without a phone position still picks the place from the lists and has no pin.
- Existing farms have no position. The map will place them at their village instead and say that it is approximate.

### Known limits
- The French and Kinyarwanda words of the new hint and the position line are my drafts for a native speaker.
- A phone's position can be off by tens of metres, more indoors. The farmer sees the numbers and can remove them. There is no way to move the pin by hand.

## Acknowledge alerts and comment on them (Plan 9, item D2)

A supervisor can say "I'm on it" on an alert and give advice, and the farmer can answer, all on the Alerts page. The farm's owner is told by email when someone else comments.

### Checked
- Backend: 1274 tests pass (62 new). Frontend: 957 tests pass (29 new) and `tsc` is clean. One migration, `alerts/0006`.
- **I applied `alerts/0006` to your local database `ssms_db` myself**, and checked that the alert list still answers with the new fields. Nothing else is pending.
- I have not looked at the Alerts page in a browser, and I have not sent a real email.
- I fixed `DevicesPage.test.tsx`, which failed in full runs. It compared "5 minutes ago" with a time made when the file loaded. The clock is frozen for that file now.
- `npm test` still prints the one unhandled error from `SupervisorFarmersPage.test.tsx`. It happens on `master` too.

### Added
- **Acknowledge.** Supervisors and admins get an "Acknowledge" button on each alert. It records who and when, and everyone who sees the alert reads "Acknowledged by Claire Mukamana, 2 hours ago". A second supervisor can "Take over", and the person who acknowledged can "Remove acknowledgement". Farmers see the line but have no button. Acknowledging does not mark the alert read, and marking read does not acknowledge, because read is the same for everyone and this says who is dealing with it.
- **Comments.** Each alert has "Comments (n)" that opens a thread, oldest first. Everyone who can see the alert can read it. The owner, supervisors and admins can write. A comment is plain text up to 1,000 characters, shown with its line breaks and never as markup. It cannot be edited. Its author can delete it, after a confirm, and an admin can delete any. Deleting hides it and keeps the row.
- **Email to the owner.** A comment from a supervisor or admin sends the owner a branded email with the alert, the comment and a button to the Alerts page. The owner's own comments send nothing. The email names the writer but never their role. If the email fails the comment is still saved.
- **API.** `POST` and `DELETE /api/alerts/<id>/acknowledge`, `GET` and `POST /api/alerts/<id>/comments`, `DELETE /api/alerts/<id>/comments/<comment id>`, with rows in the authorization matrix. The alert list now carries `acknowledgedBy`, `acknowledgedAt` and `commentCount`, counted in the same query, so the list costs the same however many comments there are.
- Acknowledging, commenting and deleting are written to the audit log. The audit entry names the alert and never repeats the words of the comment, which may be advice for one farmer.

### Decided
- A farmer cannot acknowledge, even their own alert. Out of scope for a supervisor of another cooperative: the alert and its thread give a 404.
- A comment never shows a role, so a farmer is not told that an administrator wrote it.
- The Alerts page loads a thread only when it is opened.

### Known limits
- No edits, no attachments, no live updates over the alert stream, and no separate advice inbox. A new comment shows when the page is opened or the thread is reopened.
- The owner is emailed for every comment, with no hourly limit. A supervisor who posts ten comments sends ten emails.
- The French and Kinyarwanda words of the new buttons and messages are my drafts for a native speaker.

## Farm risk ranking for supervisors (Plan 9, item D1)

The supervisor dashboard now opens with the farms that need a look first, and says why in words.

### Checked
- Backend: 1212 tests pass (33 new). Frontend: 927 tests pass (15 new) and `tsc` is clean, plus one old test that fails only when the machine is slow (see below). No migration.
- I ranked your real local farms as an admin: Mukamana Cocoon Farm comes first (a disease alert, an open air problem and two quiet sensors). Most of the others are Medium, because the demo sensors have stopped reporting. That is the data, not a fault.
- I have not looked at the panel in a browser.
- `DevicesPage.test.tsx` ("shows status in words...") failed once in a full run while the backend suite ran beside it, and passes alone. It compares the text "5 minutes ago" with a time made when the file loads, so a slow machine can tip it into "6 minutes ago". It is an old test and I left it.

### Added
- **`GET /api/farms/risk`**, for supervisors (their cooperative's farms) and admins (every farm). Farmers get a 403. Each row has the farm, its owner, a level, and the counts behind it.
- **The rule is plain, so a supervisor can say it back to a farmer:**
  - **High:** a disease alert in the last 14 days, or a temperature or humidity problem that is still open.
  - **Medium:** a sensor that is offline or in error.
  - **OK:** none of those.

  Within a level the farm with more trouble comes first (a disease counts for 5, an air problem for 3, a sensor for 2), and farms with equal trouble are in name order. These are counts of real events, not a prediction.
- **A panel on the supervisor dashboard**, "Farms that need a look first". It lists up to five farms that are High or Medium, each with its level in words, its owner, a link to the farm and the reasons ("2 disease alerts in the last 14 days", "1 sensor offline"). "Show all N farms" adds the quiet ones. It says so calmly when no farm needs a look. If the ranking cannot load, the rest of the dashboard still works.
- The cost does not grow with the number of farms: five queries however many farms there are. A test checks it.

### Decided
- Sensors switched off on purpose are ignored. A sensor that says "online" but has been quiet too long counts as offline, the same rule the device pages use.
- An air alert that was read still counts as open until a good reading closes it. A disease alert counts for 14 days even when read.
- Late harvests, deaths and the share of readings out of range are not part of the rule. They can be added if you want them.

### Known limits
- A farm with no sensors at all is OK, because nothing is known about it.
- The French and Kinyarwanda words of the panel are my drafts for a native speaker.
- The panel shows only the top five before "Show all". It is not paged, which is fine for a cooperative but would want paging for a very large one.

## "Use my location" fills the cell and village too (Plan 9, item B11 follow-up)

"Use my location" now fills province, district, sector, cell and village where the data is sure, from a point alone. The street stays a field you type.

### Checked
- Backend: 1148 tests pass (12 new). Frontend: 898 tests pass (5 new) and `tsc` is clean. No migration.
- I tried six real places (Kigali Convention Centre, Kicukiro, Musanze, Huye, Gatsibo, Nyagatare) and each gave a sensible cell and village. The Convention Centre came out as Kimihurura sector, Kamukina cell, Nyenyeri village. I have not tried it from the running form with a real phone.
- One full frontend run in this session showed two failures I did not capture. Two reruns passed all 898. That run was twice as slow as usual, so I think they were timeouts on a busy machine.

### Added
- **Village outlines**, from the same World Bank dataset as the sectors (`rwa_villages.zip`, CC BY 4.0, 2012). 14,802 outlines in 30 files, one for each district, 7 MB in all, simplified to about 30 metres. A lookup reads only the file of the district the point is in.
- **`POST /api/locations/locate`** now also returns `cell` and, when sure, `village`.
- The form fills the cell and village and says so: "We filled in your place down to the village. Please check it and add the street if you like." When only the cell is known it asks for the village. When neither is known it behaves as before.

### Decided
- **Villages are matched by name, never by code.** The 2012 file and the current register number villages differently, so the same code can name a different village in each. Each outline is matched to the register by its district, sector, cell and village names together. Of 14,815 outlines, 14,663 give a village and its cell, 139 give the cell only (14 of them because two outlines share the same names), and 13 match nothing and are left out. 179 register villages (1.2 %) have no outline, so a point there gives the cell or sector and the person picks the village.
- **No street.** No street data exists. Reading it from OpenStreetMap would send each farm's position to a third party, so I did not.

### Known limits
- The outlines date from 2012 and are simplified, so a point near a border can land in the village next door. The form tells the person to check.
- The French and Kinyarwanda words of the three new messages are my drafts for a native speaker.
- The README said cells and villages had no boundary data. That was wrong and is corrected.

## The farm summary as a PDF (Plan 9, item K3, part 2)

A farm can be summed up on a few pages of letterhead, in the language of the screen. This finishes item K: emails, system documents, and now the farmer's own documents all share one look.

### Checked
- Backend: 1167 tests pass (31 new). Frontend: 908 tests pass (15 new) and `tsc` is clean. No migration.
- I looked at the rendered page of a French summary made from sample data and the layout is clean. I have not downloaded one from the running app in a browser.
- The one "unhandled error" that `npm test` prints (`SupervisorFarmersPage`) is still the old one from `master`.

### Added
- **`GET /api/farms/<id>/summary?lang=en|fr|rw`** returns the PDF. Anyone who may see the farm may ask: its owner, a supervisor of the cooperative, an admin. The name on the document is the person who asked.
- **What it holds:** the place, the owner and the date the farm was registered; the rooms with the number of batches in each now; every active batch with its stage, dates, room and size; the harvest summed across the farm's batches with the grade counts; and how many alerts have not been seen (batch alerts and room alerts together). Deleted rooms, batches and harvest records are left out.
- **A "Summary (PDF)" button** in the farm page header, shown to everyone who can open the page.
- The sentences are added to `frontend/src/i18n/pages.ts` and copied by `python scripts/build_doc_text.py`, like the batch report.

### Changed
- Number, date and language helpers for the PDFs moved from `batches/report.py` into `core/doc_format.py`, so both documents share them.
- **Toasts show no symbol any more.** An error toast had two crosses, one for the error and one to close it. Now every toast is its message and a close cross, and the kind is told by its colour: green for success, red for an error, amber for a warning and slate blue for a note. The success tick is gone too.

### Known limits
- A toast is no longer announced by its symbol, and it is not announced to a screen reader at all yet. That is the same as before, and worth its own small change.
- Stage names stay English in every language, as on the screen.
- The French and Kinyarwanda words for "Owner", "Registered", "Room", "Batches now" and the table headings are my drafts for a native speaker.
- The farm summary lists every active batch. A farm with a very long history runs over several numbered pages.

## The batch report as a PDF (Plan 9, item K3, part 1)

A batch report can now be downloaded as a PDF on the SSMS letterhead, in the language of the screen: English, French or Kinyarwanda.

### Checked
- Backend: 1136 tests pass (46 new). Frontend: 893 tests pass (6 new) and `tsc` is clean. No migration.
- I looked at the rendered pages of a French report made from sample data and the layout is clean. I have not downloaded one from the running app in a browser.
- The one "unhandled error" that `npm test` prints (`SupervisorFarmersPage`) is still the old one from `master`.

### Added
- **`GET /api/batches/<id>/report?lang=en|fr|rw`** returns the PDF. Anyone who may see the batch may ask for it. The name on the document is the person who asked. An unknown language reads in English.
- **The same words as the screen.** The sentences come from `frontend/src/i18n/pages.ts`, copied into `core/doc_text.py` by `python scripts/build_doc_text.py`. A test fails when the screen and the PDF differ, so change a sentence on the screen, then run the script.
- **The letterhead footer in three languages**: "Page 1 of 2", "Page 1 sur 2", "Urupapuro 1 kuri 2", and the date with French and Kinyarwanda month names.
- **A "Download PDF" button** on the batch report page, beside "Print or save as PDF". The PDF holds every death entry and every disease check. The printed screen still stops at 8 and 5 so it fits one page.

### Fixed
- **The conditions line counted buckets, not hours.** A month of readings comes in six hour buckets, so "of the 120 hours" really covered 720. The screen and the PDF now say the real number of hours.

### Known limits
- Stage names (Egg, Larva, Pupa) are English in every language, as they are on the screen today.
- The French and Kinyarwanda footer words and Kinyarwanda month names are my drafts for a native speaker to read.
- Numbers use a comma in English and a narrow space in French and Kinyarwanda.
- The farm summary PDF is the next part of K3.

## PDF documents with the SSMS letterhead (Plan 9, item K2)

The system report and the audit log can now be downloaded as PDF documents that look like they came from one organisation: logo, name, title, a footer with the address and contact details, who made the document and when, and "Page x of y" on every page.

### Checked
- Backend: 1090 tests pass (40 new). Frontend: 887 tests pass (16 new) and `tsc` is clean. No migration.
- I looked at the rendered pages of a sample report and audit log, made from sample numbers, and the layout is clean. I have not downloaded one from the running app in a browser.
- `npm test` prints one "unhandled error" from `SupervisorFarmersPage.test.tsx` ("sends the address when one is typed", Invalid time value). It happens on `master` too and is not from this work. All its tests pass.

### Added
- **One letterhead, `core/pdf.py`.** A document is a title and a list of pieces (paragraph, heading, facts, table). Tables repeat their header on every page. Text from people (names, details) is drawn as written, never read as markup.
- **System report PDF** at `GET /api/admin/reports?export=pdf`: users, farms and batches, batches by stage, harvests by grade, disease checks, activity in the last 30 days, farmers with the most farms.
- **Audit log PDF** at `GET /api/admin/audit-log?export=pdf`. It keeps the filters on screen and names them at the top. It holds the latest 500 entries and says how many were left out, with a pointer to the CSV export. `PDF_AUDIT_ROW_LIMIT` changes the 500.
- **Buttons.** The report page has "Download PDF". The audit log page has "Export PDF" beside "Export CSV". Both disable while a file is made, and say kindly if it fails.
- The name on each document is the signed in person who asked for it.
- New packages: `reportlab` (and `charset-normalizer`, which it needs) for the app, `pypdf` for the tests.

### Changed
- "Print / PDF" on the report page is now "Download PDF". It no longer opens the browser print dialog, because the letterhead version is the one to file. The CSV button is unchanged.
- PDF downloads go through the shared API client, so an expired sign-in is refreshed like any other request.

### Known limits
- The page font is Helvetica. It draws French accents and the usual punctuation. A letter outside that set (for example some rare Kinyarwanda or Polish letters) shows as "?" instead of stopping the document.
- Documents are in English. The audit log PDF has no IP address column (the CSV does).
- The batch report and a farm summary still need the letterhead (item K3).
- Run `pip install -r requirements.txt` for the new packages.

## Professional emails (Plan 9, item K1)

Every email SSMS sends now has one look: the logo, a clear heading, a button where there is something to do, and a footer that says who we are and why the person got the email.

### Checked
- Backend: 1050 tests pass (24 are new). No migration, no frontend change.
- I could not look at an email in a mail app. The HTML is built with tables and inline styles, which is what mail apps need, but please send yourself one (register a new account, or ask for a password reset) and open it in Gmail on a phone and a computer.

### Added
- **One mailer, `core/mail.py`.** An email is a heading, a greeting, short paragraphs, optional facts, an optional button and a reason. The plain text part and the HTML part are made from the same fields, so they always agree.
- **The logo travels inside the email**, so it shows on localhost and in apps that block pictures from the web.
- **A footer on every email:** the SSMS name, address, contact email, website, links to Privacy and Terms, and one line saying why the person received it.
- **Eight emails use it:** verify your email, reset your password, an account an admin added, a cooperative invitation, the reply to the contact form, the note to the team, the room alert and the disease alert.
- **The team note can be answered with Reply.** It carries the sender's address as the reply address.
- Settings for what the footer shows: `SUPPORT_EMAIL` (default smartsericulturerw@gmail.com), `ORG_ADDRESS` (default the UR-CST P.O. Box 3900, Kigali line) and `FRONTEND_URL` for the website. Change them in the environment, not in the templates.

### Changed
- Two emails began with a stray comma ("`, The SSMS Team`"). That is gone.
- The room alert now lists the safe temperature and humidity as facts instead of a text block.

### Known limits
- Emails are in English. The person's language is not stored yet, so French and Kinyarwanda emails wait for that.
- The address line is my wording of the UR-CST address. Please confirm the exact text and set `ORG_ADDRESS` if it differs. No phone number is shown, because none was given.
- The footer website is `FRONTEND_URL`. On Render it must be set to the real landing page address, or the links point at localhost.

## First run and quiet milestones (Plan 9, item B10)

A new farmer lands on a short welcome instead of a page of zeros, and the first batch and first harvest get a plain word of recognition.

### Checked
- Backend: 1026 tests pass. Frontend: 871 tests pass and `tsc` is clean. No migration.
- Not yet looked at in the browser by me. Please sign in as a farmer with no farm (a new account) and look at the dashboard, then create a first batch and log a first harvest.

### Added
- **A welcome for a farmer with no farm and no batch.** The dashboard shows "Let's get your first batch going", three short steps (add your farm, start a batch, follow it day by day) and one button, "Add your farm". The tiles, charts and empty lists are left out until there is something to show. Once there is a farm the normal dashboard returns. If the farms or batches request fails, nobody is welcomed as new, because a failed request says nothing about what they have.
- **No empty charts before a batch.** A farm with no batch yet no longer shows two charts that say "No sensor readings yet."
- **A quiet word on the first batch and the first harvest.** The answers to `POST /api/batches` and `POST /api/harvest/batch/<id>` carry `milestone` (`FIRST_BATCH`, `FIRST_HARVEST` or null). The page then shows "Your first batch is created. It starts at the egg stage. Open it any day to see how it is doing." or "Your first harvest is recorded. The totals are on the Harvests page." in place of the usual message. A plain toast, no confetti, no emoji.
- English, French and Kinyarwanda.

### Rulings to confirm
- **"First" means the first the farmer has ever had, deleted ones included.** Deleting the first batch and starting another does not repeat the message.
- **Only the owner gets the word.** An admin starting a batch or logging a harvest for a farmer sees the usual message, and the farmer's own later batch is then not "first" either, because one already exists.
- **The other empty pages stay as they are.** Farms, Batches, Alerts, Devices, Harvests and the reports already say what is missing and offer the next step. I did not find a page that needed more.
- **The supervisor dashboard has no welcome yet.** A supervisor with no farmers sees its existing empty states.

### Not done yet
- The French and Kinyarwanda text is my draft and needs a native speaker.

## Printable one-page batch report (Plan 9, item B9)

Every batch now has a plain report page that fits one sheet of paper, at `/batches/<id>/report`. A "Batch report" button on the batch page opens it.

### Checked
- Frontend: 860 tests pass and `tsc` is clean. No backend change and no migration.
- Not yet looked at in the browser or in a print preview by me. Please open a batch, press "Batch report", then "Print or save as PDF", and look at the preview (A4, one sheet).

### Added
- **What the report holds.** The batch (stage, farm, place, dates, day of the cycle, breed, what it started with, notes, every room it has been in), the last 30 days of conditions (lowest, average and highest temperature and humidity, and the share of hours inside the usual range for the current stage), deaths (total, and the share when counted in worms, newest eight rows), disease checks (how many found a disease, newest five), alerts not yet seen, and the harvest (records, kilograms, silk, count per grade). It ends with "Prepared on <date> for <your name>."
- **Print or save as PDF** uses the browser's own print dialog. The menus, the bottom bar and the buttons are hidden when printing, the page is A4 with 14 mm margins, and the tab title ("Batch report 9SIEO7CV") becomes the suggested file name.
- Anyone who may open the batch may open its report: the owner, their supervisor and admins. English, French and Kinyarwanda.

### Rulings to confirm
- **If any part fails to load, the page shows an error instead of a report.** A printed "No deaths recorded" must never mean "we could not ask". Only the usual ranges are allowed to fall back to defaults.
- **The conditions are judged against the range of the batch's current stage**, as the batch page does. A batch that changed stage during the 30 days is not judged stage by stage.
- Long logs keep to their newest rows (eight deaths, five checks) with "and N more", so the report stays on one sheet.

### Not done yet
- The logo, letterhead, page numbers and footer come with the documents work (item K). This is the plain version, and K will put the same letterhead on it. The French and Kinyarwanda text needs a native speaker.

## Harvest rules: right stage, hidden when deleted, a page at a time (Plan 9, item B8)

Harvest records now follow three rules, and the Harvests page no longer loads every record at once.

### Checked
- Backend: 1015 tests pass. Frontend: 824 tests pass and `tsc` is clean.
- Not yet looked at in the browser by me. Please open Harvests, a batch's harvest page at an early stage, and delete one record.

### Added
- **Only at the right stage.** `POST /api/harvest/batch/<id>` is refused with "A harvest can be recorded once the batch has reached the cocoon stage." for a batch at Egg, Larva or Pupa. Cocoon and Harvest are accepted, so a harvest can be logged over several days. Admins follow the same rule. The batch harvest page hides "Log harvest" before then and says when it will be possible.
- **Deleting hides, it does not remove.** A deleted record keeps its row (`harvest_records.isActive`) and disappears from the lists, the CSV, the totals and the admin report. A second delete says "not found". The audit log still records the delete.
- **A page at a time.** `GET /api/harvest?page=N` returns 20 records with the usual `pagination` block (`page_size` up to 100). `?search=` narrows by farm name, grade or note on the server. Without `page` the list stays one flat list, as before.
- **Totals no longer depend on the page.** `GET /api/harvest/stats` also returns `byFarm` (top eight farms by cocoon weight), and the Harvests page takes its tiles and both charts from it, so they cover every record. The search waits for a pause in typing before it asks the server.

### Rulings to confirm
- Cocoon and Harvest both count as "the right stage". A harvest is often picked over more than one day.
- The check on the stage comes before the check on the numbers, so a batch that is too young gets the stage message.
- The list of one batch's records (`/api/harvest/batch/<id>`) is not paginated. One batch has a handful of records.

### Before you run this
- Run `python manage.py migrate` (adds `harvest/0002`).
- The authorization matrix world now starts its batches at the cocoon stage, and its stage row moves a batch to Harvest.

## Disease alert when a check is positive (Plan 9, item B7)

A disease check that names a disease now raises an alert on the batch, so the farmer's supervisor sees it without being told.

### Checked
- Backend: 994 tests pass. Frontend: 815 tests pass and `tsc` is clean.
- Not yet looked at in the browser by me. Please run a disease check on a photo and look at Alerts.

### Added
- **The alert.** A check that names Flacherie, Grasserie, Muscardine or Pebrine with at least 50% confidence adds a Disease alert to the batch: "Flacherie suspected in this batch (83% confidence). Check the batch and ask your supervisor to take a look." The farmer, the supervisor of their cooperative and admins see it in Alerts, and supervisors and admins get it on the live stream like other alerts. Every positive check is its own alert, because each has its own photo.
- **The limit is a setting**, `DISEASE_ALERT_MIN_CONFIDENCE`, 0.5 by default. Below it the result and the card still show, and nobody is alarmed. A healthy result, or a class the page does not know, never raises one.
- **An email to the farm owner, only when someone else made the check** (a supervisor or admin). The owner who made it is looking at the result. It names the batch and who checked it, says the check can be wrong, and sends them to their supervisor or an officer before any disinfectant or medicine. At most one email an hour per batch.
- The result page says "An alert was added to this batch, so your supervisor can see it too" when one was raised. The answer from `POST /api/detections` carries `alertRaised`.

### Rulings to confirm
- The 50% limit is my choice. Raise it to alarm less, lower it to alarm more.
- If saving the alert fails, the check itself still succeeds and the failure is logged.

## Disease result: what it may mean, and was it right? (Plan 9, item B6)

A disease result now comes with plain guidance and a way to say whether the check got it right.

### Checked
- Backend: 974 tests pass. Frontend: 813 tests pass and `tsc` is clean. Your local database is migrated through `sensors/0005`.
- Not yet looked at in the browser by me. Please run a disease check once and read the card.

### Added
- **A card under a disease result**, for Grasserie, Flacherie, Muscardine and Pebrine: a sentence or two on what it is, then what to do now. The steps are the same for every disease (take sick worms out, dispose of them away from the room, wash hands and tools, check the other trays, keep the room clean and aired, ask your supervisor or a sericulture officer before using any disinfectant or medicine), plus a line or two for the disease itself. A healthy result gets no card.
- **"Was this result correct?"** Yes saves at once. No asks what it really was (or "I am not sure") and sends it. The answer can be changed later. `POST /api/detections/<id>/feedback` for the people who may see the check, saved on the check with the time, written to the audit log, and shown in the check lists. The answers are only kept so we can see how the check does on real photos.

### The card is general guidance and needs an expert
- It names no product, dose or number, and a test fails if it ever does. Treatment and disinfection go to the supervisor or an officer.
- **I could not open several of the sources in full** (the Central Silk Board pages and the pebrine review blocked or errored). Some lines rest on search summaries of them. `docs/disease-guidance.md` lists each line and where it comes from. **A sericulture officer should read the English before the card is relied on**, and the French and Kinyarwanda need a native speaker.

### Before you run this
- Run `python manage.py migrate`.

## Disease photo: camera, smaller photos and a framing guide (Plan 9, item B5)

Taking a photo for the disease check is easier on a phone, and a large photo no longer gets turned away.

### Checked
- Frontend: 783 tests pass and `tsc` is clean. No backend change.
- Not yet looked at in the browser by me. Please open a batch's Disease check on a phone once and take a photo.

### Added
- **Use the camera.** On a device with a camera, a button opens the camera in the page, using the back camera. A square shows what will be sent, and "Take photo" sends the middle square of the picture. The camera is switched off when the photo is taken, when the person cancels or presses Escape, and when they leave the page. If the camera is blocked or missing, the page says so in plain words and offers the normal file picker.
- **Smaller photos.** A photo is made into a JPEG of at most 1,280 pixels on the long side before it is sent, with a note such as "It was 5.0 MB, and was made smaller to send faster." The server refuses anything over 5 MB and phone photos often are, so before this the check could fail on a good photo. A small photo is sent as it is. If the browser cannot do it, the original is sent.
- **Framing advice**, folded away under "How to take a photo the check can read": get close, use daylight without flash, hold still. The disease model squeezes every photo into a square, which is why the camera frames a square.

### Changed
- The page said photos could be up to 10 MB. The server limit is 5 MB, and the page now says large photos are made smaller for you.

### Known limits
- Photos chosen from the gallery are made smaller but not cropped. Only camera photos are cut to the square.
- The French and Kinyarwanda words are drafts for a native speaker.

## Rwanda places for farms (Plan 9, item L2)

A farm's location is now chosen the way Irembo asks for it: province, district, sector, cell and village as linked lists, with an optional street. "Use my location" fills in what a map can tell.

### Checked
- Backend: 942 tests pass. Frontend: 745 tests pass and `tsc` is clean.
- Your local database is migrated through `farms/0003`. Your existing farms keep their old text and have no place chosen yet.
- Not yet looked at in the browser by me, because the sign-in step was blocked. Please open New farm and Edit farm once.

### Added
- **The places of Rwanda**, in `locations/`: 5 provinces, 30 districts, 416 sectors, 2,148 cells and 14,842 villages, with their government codes. Where it comes from, what was checked and what is not perfect is in `locations/README.md`.
- **Linked lists on the farm form.** Choosing a province loads its districts, and so on down. Changing a place empties the ones below it. The street is optional. All five choices are needed, and the server refuses a set that does not belong together.
- **Use my location.** The browser's position is turned into a province, district and sector by the World Bank's sector boundaries. The person then chooses the cell and village by hand, because no boundaries exist for those. The point travels in a request body and is never stored. Outside Rwanda, or when the person says no, the form says so in plain words and nothing changes.
- **The farm line.** A farm's text location is now made from its choices, smallest place first, for example "KG 9 Ave, Kabeza, Akabare, Kageyo, Gatsibo, Eastern Province". Lists and search keep using it.
- `GET /api/locations?parent=<code>` and `POST /api/locations/locate`, for any signed-in person, both rows in the authorization matrix.
- The demo farms now stand in a real village of their district.

### Changed
- Creating a farm no longer takes free text for the location. The API refuses it. Renaming a farm needs no place.
- A farm from before places keeps its old text, shown as "Address on record" in the editor. Choosing a place replaces it, and then all five choices are needed.

### Known limits
- Village names come as the register has them, a few with obvious typos (for example "Umudugudu WaV"). They are not corrected by guessing.
- The list has 14,842 villages against the 14,837 usually quoted. No copy we found matches every official figure.
- The boundaries date from 2012. The Kinyarwanda and French words on the form are drafts for a native speaker to read.

### Before you run this
- Run `python manage.py migrate`.

## Rearing rooms, step 3: alerts by room (Plan 8)

Temperature, humidity and sensor-outage alerts now belong to a room. A problem in a room with three batches is one alert and one email, not three. This finishes the design in `docs/superpowers/specs/2026-10-27-rearing-rooms-design.md`.

### Checked
- Backend: 860 tests pass. Frontend: 725 tests pass and `tsc` is clean.
- Your local database is migrated through `alerts/0005`. The one open air problem it had was given its room.
- Not yet looked at in the browser by me. Please open Alerts and a batch page once.

### Added
- **One alert per room and problem.** A bad reading opens one temperature or humidity alert for the room. More bad readings add nothing. The first good reading resolves it.
- **One range per room.** The room is judged by the range its running batches share. When they share none, the youngest batch's range is used. Batches at harvest and deleted batches do not count.
- **Alerts end when the room empties.** Moving the last running batch out, deleting it, or moving it to harvest resolves the room's open air and sensor alerts. A room with nothing running is not judged.
- **Alerts name the room and its batches.** Each alert in the list shows the room and a link to every batch in it. The live stream carries `roomId`. The email names the room and its batches, and quotes the range that was really used (it used to print a fixed range).
- **Sensor outages belong to the room.** One alert per quiet device, so hearing from one device ends only its own outage.
- **A batch has the alerts of the rooms it stayed in**, for the time it was there. The alert count and the open-problem count on the batch lists follow the same rule.

### Changed
- `check_sensor_alerts` is gone. A batch that was never placed in a room raises no air alerts (none exist after the migration).
- A quiet sensor in a room with nothing running raises no outage alert. The design said it should. It would only be noise, because nobody is rearing there, and it is one line to change.
- The demo's humid spell is stronger, so it is still open at any hour of the day.

### Before you run this
- Run `python manage.py migrate`. The data migration gives each open air or sensor alert the room of its batch, and it is safe to run twice.

## Rearing rooms, step 2: sensors and readings (Plan 8)

Sensors now belong to a room, and a reading belongs to the room it was taken in. Every batch in a room shares what the room's sensors measure. Alerts still run once per batch and move to the room in step 3.

### Checked
- Backend: 801 tests pass. Frontend: 721 tests pass and `tsc` is clean.
- Your local database: migrated through `sensors/0004`, so 3971 readings and 17 devices were placed in rooms, and the demo data was rebuilt with `seed_demo --reset`.
- Not yet looked at in the browser by me, because the sign-in step was blocked. Please open the Devices page, a device's details and a farm page once.

### Added
- **A device lives in a room.** Registering a device on a farm with one room puts it there, a farm with several asks which, and a farm with none still registers it, with a hint to add a room. A manager can move it later from its details ("Move to another room"). `PATCH /api/devices/<id>` with `roomId`, admins and supervisors only, and it is audited.
- **Readings belong to a room.** A device reading is stored on its device's room. A batch sees the readings of the rooms it stayed in, only for the time it was there, so a move does not copy or lose any history. A reading typed by hand goes to the batch's room.
- **A device that cannot be placed.** With several rooms and none chosen, a reading is refused with "This device is not in a room yet." A device in a deleted room is refused like an unknown key.
- **Farm page.** Each room lists its sensors with their status and the last reading the room took, or says there is none yet.
- **Devices page.** A Room column, searchable, and the room in the details.
- **Today card.** A room is judged once, however many batches are in it, and the line names the room. When the batches in a room have different safe ranges, the room is judged by the range they share, or by the youngest batch's range when they share none. Harvest lines stay one per batch.
- `simulate_sensors` sends one reading per room that holds a running batch. New options `--room` and `--batch`.

### Changed
- The dashboard chart counts a room once, not once per batch.
- A room with batches in it still cannot be deleted ("Move the batches out of this room first.").

### Before you run this
- Run `python manage.py migrate`. The data migration moves old readings and devices into the room their batch was in, and it is safe to run twice.

## Rearing rooms, step 1 (Plan 8)

A farm now has rooms, and every batch sits in one. This is the first of three steps in `docs/superpowers/specs/2026-10-27-rearing-rooms-design.md`. Sensors, readings and alerts still work as before and move to rooms in the next two steps.

### Checked
- Backend: 741 tests pass. Frontend: 695 tests pass and `tsc` is clean.
- Your local database: all 18 running batches were placed in "Room 1" of their farm, and the one deleted batch has an ended stay and no room.

### Added
- **Rooms.** A farmer adds, renames and deletes the rooms of a farm. A name can be used once per farm, whatever the capitals. Deleting asks first and hides the room. A room that still has batches in it cannot be deleted. Supervisors can read rooms but not change them. `GET` and `POST /api/farms/<id>/rooms`, `PATCH` and `DELETE /api/rooms/<id>`.
- **A new batch always gets a room.** A farm with no rooms gets "Room 1" made for it, a farm with one room uses it, and a farm with several asks which. The new batch form shows this.
- **Moving a batch.** "Move to another room" on the batch page, to another room of the same farm. The old stay ends and a new one starts, so where a batch has been is kept and shown on the page. `POST /api/batches/<id>/room`. A deleted batch leaves its room.
- **`seed_demo`** gives each demo farm two rooms, with the running batch in the first and the finished one in the second.

### Before you run this
- Run `python manage.py migrate`. The data migration puts every existing batch in "Room 1" of its farm, with a stay that starts on its start date, and it is safe to run twice.

## Invitations, the team list and self-applying filters (Plan 7)

Added on 27 October at the owner's request. Each change started with a failing test.

### Checked
- Backend: 692 tests pass. Frontend: 684 tests pass and `tsc` is clean.
- In the real app, as the demo supervisor: the My farmers page lists the cooperative's farmers, a link can be made, and the link page opens for a signed-out visitor.

### Added
- **Invitation links.** A supervisor makes a link for a farmer, with or without an email address. A link works once and lasts 7 days, and only a hash of it is stored, so it is shown once and cannot be read back. With an address, the link is emailed and only that address can use it, and using it also proves the address. An admin can make links for any cooperative. `POST /api/team/invitations`, `GET /api/team/invitations`, `DELETE /api/team/invitations/<id>` (revoke), and the public `GET /api/invitations/<token>` and `POST /api/invitations/<token>/accept`.
- **Joining.** A farmer registers through the link, or accepts it when already registered (with a question first if that means leaving another cooperative). A link that is unknown, expired, revoked or used always gets the same answer, so it says nothing about which links exist. Making the account and using the link are one step.
- **My farmers.** A supervisor sees the farmers of their cooperative, with their farm counts, and can remove one after a confirmation. The farmer keeps their account and farms. `GET /api/team/farmers`, `DELETE /api/team/farmers/<id>`.
- **The page behind a link** (`/join/<token>`), in three languages. Signing in from it brings the person back to it.
- **Filters apply themselves.** On Detection reports and the Audit log, menus and dates apply at once, typing applies a moment after it stops, and only Reset stays, shown when a filter is set.

### Changed
- The Audit log's Clear button is now Reset, like the other filters.

### Before you run this
- Run `python manage.py migrate` for the new invitations table.

## Alerts, devices, demo data and the farmer pages (Plan 6)

Work from 27 October, in the order agreed. Each change started with a failing test.

### Checked
- Backend: 644 tests pass. Frontend: 643 tests pass, `tsc` is clean and the production build succeeds.
- In the real app: the farm and batch detail pages fit at 1100 and 390 pixels wide, the cooperatives tabs and the Undo toast work, and the new batch sections show.

### Added
- **Cooperative restore.** Admins see Active and Deleted tabs and can restore a deleted cooperative. `POST /api/cooperatives/<id>/restore`, and `?deleted=1` on the list. Deleting and restoring are audited.
- **Undo.** Marking one alert read shows an Undo button. `PATCH /api/alerts/<id>/unread`.
- **Safe range per stage.** Each stage of a batch has its own temperature and humidity range, starting at the range the system always used (22 to 28 °C, 70 to 85 %). Everyone signed in can read it, and an admin can change it (`GET /api/alerts/thresholds`, `PUT /api/alerts/thresholds/<stage>`). The batch page and the dashboard use these numbers.
- **One alert per problem.** A bad reading opens one temperature or humidity alert. More bad readings add nothing, and the first good reading resolves it. A later problem opens a new alert. Alerts now carry `resolvedAt`.
- **Devices send readings with their own key.** `POST /api/devices/ingest` with an `X-Device-Key` header, no user account needed. Readings go to the device's batch, or to the only active batch on its farm. A key is limited to 30 readings a minute.
- **Offline devices.** A device quiet for 30 minutes (`DEVICE_OFFLINE_MINUTES`) shows as offline at once. `python manage.py mark_offline_devices` also opens one system alert per outage on the batch, and the next reading resolves it.
- **`seed_demo`.** `python manage.py seed_demo` builds a demo cooperative with a supervisor, three farmers, running and finished batches, a month of hourly readings, disease checks, harvests and alerts that follow the real rules. It touches only its own rows (`@demo.ssms.rw` accounts, "Demo Silk Cooperative", `ssms-demo-` devices), `--reset` rebuilds them, and the password is printed once or set with `--password`.
- **A better simulator.** `simulate_sensors` now goes through the same path as a real device, and `--scenario cold`, `hot`, `humid` or `dry` stages a problem for a live demo. `--rounds N` runs a fixed number of rounds.
- **Needs attention today.** The farmer dashboard has a card that lists rooms out of range, sensors gone quiet for six hours, and harvests due in three days or late.
- **Batch page.** It says which day of the cycle it is ("Day 12 of 21, harvest expected on 6 June") and the safe range of the stage. The charts can show 24 hours, 7 days or 30 days (`GET /api/sensors/batch/<id>/series?hours=N`).
- **Breed, quantity and deaths.** A batch can have a breed and a quantity counted in egg boxes or worms, which a farmer can correct later. A log records the worms that died each day, with a note. Entries are hidden when deleted, never removed, and the batch page shows the total.

### Changed
- The active batches list also carries each batch's latest reading and its open problems, in the same single query.

### Bugs found on the way and fixed
- Databases made by the old Node backend have a native Postgres enum on `alert_logs.type`, and Django's bulk insert cannot write into one. Opening an alert would have failed there, so alerts are now saved one at a time. Two tests guard it, because a fresh test database does not have the enum.

### Before you run this
- Run `python manage.py migrate`. There are new migrations for alerts and batches. They only add things, and old temperature and humidity alerts are marked resolved so they cannot hide a new problem.
- Set `DEVICE_OFFLINE_MINUTES` if 30 minutes is not right for your sensors, and run `mark_offline_devices` every few minutes from a scheduler when you deploy.

### Left for later
- The admin page for editing the safe ranges (the API is ready).
- The disease photo, report and onboarding items on the list.

## UI round 2 (Plan 5)

A calmer look and safer actions, in the order the owner asked for them. Each change started with a failing test.

### Checked
- Backend: 470 tests pass. Frontend: 581 tests pass, `tsc` is clean and the production build succeeds.
- Real browser checks at 1280, 1100 and 390 pixels wide: no page needs a horizontal slider on any list page.

### Changed
- **Menu.** The wide sidebar is now a narrow icon rail with a name on hover or focus. The choice to open it is remembered, and screens 1600 pixels and wider start open. On phones there is a bottom tab bar with a More button. The profile card is gone from the menu, and Sign out is the last item in the list.
- **Plain labels.** Active, Healthy, stages, roles and counts are plain words. There are no dots and no pills anywhere in the product.
- **Sign in pages.** Kept the split layout, with the green panel on one side and the form on the other. A centred card was tried and put back.
- **Forms.** The new farm, batch and photo check forms stand alone, in one narrow column. The side panels are gone.
- **Tables.** Cells use less padding on laptop screens, so tables fit without a slider.
- **Users.** The table shows name, role, cooperative, status and actions. Role and cooperative change in one Edit access dialog that shows what will change and asks again before saving. "Turn off" is now Delete. It is a soft delete: the account is hidden and cannot sign in, the person's farms and records stay, and a Deleted tab has a Restore button. There is still no way to delete a user for good.
- **Confirmations.** The app now asks before moving a batch to the next stage (stages only move forward), before adding or removing a cooperative member, and before marking every alert or message as read. Cooperatives say Delete instead of Turn off.
- **Wording.** The word administrator appears only on admin screens. Help text for farmers and supervisors points to the SSMS team. This covers the landing page, the no access page, the profile and supervisor notes, the privacy and terms pages, API messages and the invitation email.

### Added
- `POST /api/admin/users/<id>/restore` (admin only, audited).

### Left for later
- Restoring a deleted cooperative has no button yet. The backend only switches it off.
- The French and Kinyarwanda text for the new screens is a draft and needs a native review.

## Baseline and security (Plan 1)

This round closes every stop-ship and serious security finding from the audit. Each fix started with a failing test.

### Checked
- Backend: 454 tests pass, 82% coverage. Frontend: 530 tests pass, `tsc` is clean. AI service: 16 tests pass, 1 skipped (see below).
- `pip-audit`: nothing found. `npm audit --omit=dev`: 2 moderate findings (React Router, see "Left for later").
- `manage.py check --deploy --fail-level WARNING` exits 0 with production settings.
- 38 checks against a live uvicorn server and a scratch database, covering the manual checklist: sign in, token lifetimes, refresh and replay, logout, other people's data, live alert tickets, email verification, password change from two devices, admin invitations, photo checks, bad parameters, login lockout and the contact form limits. All pass.
- A real browser check: sign in through the form, corrupt the stored token, and the app refreshes silently and stays signed in.

### Closed
- **SEC-01** Email verification no longer signs anyone in. A verified account used to receive a live session for any token. Links now work once and a password reset token cannot confirm an email.
- **SEC-02** Authorization. One module (`core/access.py`) decides who may see what. Supervisors can no longer open batches outside their cooperative, farmers can no longer read other farmers' readings, detections, alerts or harvests, a supervisor without a cooperative sees nothing, and deleted farms and batches are hidden from everyone. A matrix test runs every endpoint as ten kinds of caller.
- **SEC-03** Access tokens last 15 minutes and refresh tokens a week. A password change or reset, or turning an account off, ends every session of that account.
- **SEC-04** The live alert stream no longer takes the sign in token in its address. It uses a 30 second, single-use ticket on an async view that follows the same access rules.
- **SEC-05** Forwarded addresses are trusted only to a set proxy depth, and throttle counters are shared through the database cache.
- **SEC-06** Admins can create users with the role they choose, with an invitation email when no password is given.
- **SEC-07, SEC-08** One password policy for registration, change and reset. Recovery and resend emails answer the same for every address and survive a mail failure.
- **SEC-09** (backend) The contact form validates its input, refuses header injection, is limited to five messages an hour, has a honeypot, and replies with fixed text.
- **SEC-10, SEC-18** The AI service needs a shared secret, sends no CORS headers, limits uploads to 5 MB and judges files by their contents. Errors say nothing about the inside.
- **SEC-11, SEC-13** Bad query parameters answer 422, and spreadsheet formulas are defused in every CSV export.
- **SEC-12** Record ids and device keys are cryptographically random.
- **SEC-14** Security headers on every response, secure cookies, HTTPS redirect in production.
- **SEC-15, SEC-16, SEC-17, SEC-19** Login lockout after five failures, equal timing for unknown emails, old Node bcrypt hashes replaced on sign in, and failed logins in the audit log.
- **OPS-02, OPS-03, OPS-04** Loose files moved out of the repo, Django 5.2 LTS with patched dependencies, pytest, factories and ruff.
- **QA-01, ADM-03, AI-06 (part)** Green baseline, synchronous audit log, safe model loading with an optional SHA-256 check.

### Bugs found on the way and fixed
- Creating a device through the API always failed (the view read `farmId`, the parser had renamed it).
- Changing and resetting a password always failed for the same reason, so nobody could do either.
- The supervisor dashboard dropped every live alert, because it expected a list and the server sends one alert per message.
- A line break in a contact form subject or email caused an error instead of a refusal.
- A farm page cost three extra database queries for every batch it showed. It now costs a fixed number.

### Before you run this
- **Rotate the database password.** The old one is in public commit history (`SECURITY.md`). This is still to do.
- Add `AI_SERVICE_SECRET` to the API's `.env` and to the AI service's environment. Without it the AI service will not start. For quick local work only, start it with `AI_ALLOW_INSECURE=1`.
- Run the API with `uvicorn`, not `runserver` (`make dev-api`). Live alerts cannot stream through `runserver`.
- Run `python manage.py createcachetable` once. Replace `JWT_EXPIRES_DAYS` in `.env` with `JWT_ACCESS_MINUTES` and `JWT_REFRESH_DAYS`.
- Keep comments in `.env` on their own lines. `python-decouple` does not read comments after a value.
- On the host set `TRUSTED_PROXY_COUNT=1`, a long random `SECRET_KEY`, and `AI_SERVICE_SECRET`.
- Behaviour changes: `?hours=` above 168 is now a 422 instead of being cut to 168, and a supervisor of another cooperative now gets 404 where they used to see the data.

### Left for later
- A CAPTCHA on the contact form, API documentation, and keeping the access token in memory.
- Same-origin deployment so the refresh cookie works across sites, and an async server worker for production.
- React Router 6 has a moderate advisory and its fix is a major upgrade. Vite and Vitest have dev-only advisories that need major upgrades.
- The AI preprocessing is checked against TensorFlow by a test that is skipped here, because TensorFlow is not installed. Run it where TensorFlow exists.
- The test run ends with a harmless warning that one database session is still open, left by the async tests.
