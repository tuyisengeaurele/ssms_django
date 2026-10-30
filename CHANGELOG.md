# Changelog

## Chore: tidy imports

`ruff` reported 21 older findings in files nobody had touched for a while: imports out of order in 17 files and unused imports in 4. They are fixed with `ruff --fix`, which only reorders or removes import lines.

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
