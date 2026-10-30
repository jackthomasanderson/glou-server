# Changelog

All notable changes to Glou. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Glou uses Calendar Versioning (`YYYY.MM[.PATCH]`, see [CONTRIBUTING.md](CONTRIBUTING.md#versioning)).
Container images are published as `latest` (stable, from `main`), `beta` (from `dev`),
and, on `main`, as the matching `vYYYY.MM[.PATCH]` tag. Changes accumulate under
*Unreleased* until the next promotion of `dev` to `main` cuts a numbered release.
Entries start with the pull request that introduced them where there is one.

## Unreleased

### Fixed
- Offline changes sync reliably. Two changes to the same bottle made without network (opened at 50 %, then finished) no longer end in a conflict with yourself; each is still sent on its own. Changes sent while the server restarts stay pending and go through on their own a few seconds later instead of being marked refused. The conflict window lists only the fields that differ, with their names and the cellar name, and *Decide later* is remembered when you change page. In the list view, the pending-sync clock, the cellar name and the category follow edits, cellar renames and language switches without a reload (#585, #738).

## v2026.10.3 - 2026-10-30

### Added
- Advanced setting `API_RATE_LIMIT_MAX` in `.env`: how many requests one address may send every 15 minutes (1000 by default), to raise if many devices share one address and get *Too many requests*. The sign-in and password-reset limits do not change (#746).

### Security
- Another app hosted under the same domain (for example `photos.home.example` next to `glou.home.example`) can no longer send requests to Glou on behalf of a signed-in member. Its address must be listed in `APP_URL`, `CORS_ORIGIN` or `CSRF_TRUSTED_ORIGINS` (#740, #600).
- Guest share links no longer appear in clear text in the error and rejected-request lines of the `api` log (#740, #612).
- A crafted sign-in link can no longer send you to another website once signed in; the page you asked for, query string and anchor included, is still restored after sign-in and after the two-factor step (#740, #602).

### Fixed
- Running the web app from a source checkout (`npm run dev` or a local build) showed it with two thirds of the interface library's styles missing: fields without borders, square buttons with dark text, no keyboard focus ring, dialogs not full-screen on a phone. Published images were not affected (#722, #721).
- Select menus no longer flash about a third of a second after opening (#723, #709).
- Form windows no longer jump while you fill them in. Opening a section, a field that appears, a password strength gauge or an error message used to re-centre the whole window and move every field, sometimes under the pointer. Forms that change height as you fill them (bottle, cellar, tasting, wish, collection, share link, bulk action, maturity reference, password and PIN) now stay anchored at the top on a computer, and the longer ones scroll inside their window (#723, #709).
- A tasting without stars can now be saved. Saving one, removing the stars of a rated tasting, or saving with the date field cleared failed with "Failed to save the tasting" (#724, #704).
- Emptying a field of an existing bottle now clears it. Emptying the vintage (to make it non-vintage), a price, the alcohol degree or the colour saved without error and kept the old value; emptying the opening or reminder date made the save fail. A disgorging or cask date typed then cleared when adding a bottle was saved as 1 January 1970 (#727, #726).
- The bottle form no longer rewrites what you type. A price such as 24.05 used to turn into 245, because a 0 right after the decimal separator was dropped, and 24.90 into 24.9. Grape varieties typed as "Pinot Noir, Gamay" lost their spaces and commas. Prices and degrees take a comma or a dot whatever the browser language: a browser set to English silently dropped the comma, turning 24,05 into 2405. The same fix applies to the wish form, whose quantity also could not be emptied to type over it. The cellar field shows *No cellar* instead of a blank when no cellar is chosen, and the service temperature field shows an example (#725, #706).
- A peak window that ends before it starts (2035 to 2028) is refused, under the field and by the server, instead of being saved and skewing the peak alerts (#725, #706).
- The automatic bottle photo now follows the name you end up typing. A pause while typing used to attach the photo found for a half-typed name for good. A photo you choose yourself is never replaced (#725, #706).
- With every section open, the tasting window spilled out of its panel and its Cancel and Save buttons were drawn below it, on the dark backdrop. It now scrolls inside its panel and keeps its buttons in view (#723, #704).
- On a phone, the last six windows that still opened as a small box now open full-screen like the others: wish price, conversion and deletion, the stock question after a tasting, cellar deletion and the list of changes waiting to be sent (#723, #654).
- Food pairing now suggests the red and white wines in your cellar: "Viande" or "agneau" used to find nothing, and only rosé and orange wines ever came up. A white wine now gets white-wine serving advice instead of a red's (16–18 °C, aeration, lamb), and a wine without a colour gets none rather than a wrong one (#731, #703).
- On a phone, the first-run wizard scrolls and fills the screen. When a step was taller than the screen, such as the preview of a cellar file, its top and bottom were cut off with no way to reach them: *Confirm import*, *Back*, *Skip this step* or *Later* could not be pressed. Each step now opens at its top. On a narrow phone, the cellar step's buttons ran past the edge of the card and cut *Create cellar* off; they now wrap onto two lines. On a computer, a window too short for the wizard now scrolls too (#730, #686).
- Editing a tasting now shows its perceived maturity and, in expert mode, its tasting grid (appearance, nose, palate, tannin, acidity, finish), which used to appear empty. Saving a tasting without touching it no longer erases its perceived maturity, and what you type in the tasting window is no longer wiped when the page refreshes its data in the background (#736, #642).
- After a tasting, the stock question no longer puts an already opened bottle back to 50 % with today as its opening date: for an opened bottle it only offers to mark it empty (#736, #595).
- After a cigar tasting, the stock question offers to remove one cigar from the box instead of marking the whole box empty (#736, #586).
- Backups restore again with the disaster-recovery and rollback procedures of the wiki: every backup stopped them near its start, on a setting the PostgreSQL 15 database Glou ships rejects, and nothing was restored. New backups no longer contain that setting, and the documented command now also restores older ones. The disaster-recovery page now sends you to the `./backups` folder instead of an old Docker volume that only holds backups from before 2026.10 (#737, #665).
- A backup is recorded as successful only once its file is completely written. A disk that filled up during the last moments of a backup left a truncated file marked successful, and older good backups could then be deleted by the retention (#737, #670).
- The Backups tab now warns when Glou cannot write to its backups folder. If the check itself fails, the tab says so instead of staying silent (#737, #669).
- Peak and humidor alerts are no longer lost in night-time quiet hours. They were sent at 3 a.m. and a message that falls in your quiet hours is dropped, not delayed, so a 22:00 → 07:00 range swallowed every one of them. They are now sent at 10:00. Quiet hours, and the times of the daily jobs, are now read in the instance's time zone instead of UTC. It is `Europe/Paris` unless you set another one with `TZ` in `.env`; an existing `docker-compose.yml` also needs the `TZ` line of the new one for that setting to apply. The setting now says what happens to a message during quiet hours (#741, #575).
- Turning off one notification category no longer turns off all the others. From the default (every category on), unticking one used to leave it as the only one on, peak alerts included. Lists saved that way are left as they are: check your categories in your profile (#741, #583).
- A deactivated or deleted account no longer receives the household's humidor alerts, nor any other notification (#741, #591).
- Saving a bottle no longer overwrites what someone else changed while your form was open: it now says the bottle was changed in the meantime and saves nothing, so you can reopen it and start from the latest version. Saving also only touches the fields you changed, so correcting a price no longer removes the scan and import badges of the other fields or marks them as set by hand (#735, #572).
- A bottle's name can be corrected when editing it. The field was greyed out, so a typo or a misread label could only be fixed by deleting and recreating the bottle (#735, #643).
- Bottles can be selected in list view: selection mode showed no checkboxes there and a click on a row selected nothing. Cancelling a bulk action and then leaving selection mode no longer replaces the page with an error, and the bulk action window now opens with no field ticked each time (#732, #705).
- Glou no longer crashes in a browser set to block site data (Chrome "Sites can't save data", Firefox "block all cookies"): even the sign-in page used to fail with a bare "Application error". Preferences such as the language or the quick lock are simply not remembered there (#734, #584).
- When the database restarts (after an update, for instance), members are no longer sent back to the sign-in screen as if their session had expired; opening the app meanwhile shows "Cannot reach the server" with a retry button (#734, #581).
- Restoring a backup from the Backups tab now first takes a backup of the current data, which stays in the history so a wrong restore can be undone; if that backup fails, nothing is restored. After a restore, the history still lists every backup, including those newer than the restored one, and a backup file copied by hand into the `./backups` folder appears in it after a restart (#745, #666).
- On the lock screen, a wrong password or PIN now says "Incorrect password or PIN code." and empties the field, ready for another try. It used to show nothing, so the app looked frozen. Too many attempts, a server that cannot be reached and a session that has ended get their own message. Only wrong codes count towards the limit of attempts: a tablet unlocked often during the day is no longer blocked (#744, #582).
- After too many sign-in, two-factor, password-reset or unlock attempts, the screen now says how many minutes to wait instead of "An unexpected error occurred" or "An error occurred. Try again.", which only prolonged the block. A password-reset link checked while the server cannot be reached offers to try again instead of calling the link invalid or expired (#744, #640).
- Turning two-factor sign-in on or off in the profile shows a sentence in your language, such as "Incorrect verification code.", instead of codes like "INVALID_TOTP_CODE". The code fields there, and in "Trust this device", open the number keypad on a phone; a button switches to the full keyboard for a backup code (#744, #652).
- Deleting a cellar no longer says it failed when it worked: the confirmation closes and the cellar leaves the list. A deleted bulk-action preset now leaves the list straight away instead of staying until the page is reloaded, and a preset that cannot be deleted says so. Removing a bottle from a collection, or adding it to one, now says when it fails instead of passing it off as done; a save touching several collections shows a single message (#743, #580).
- A bottle photo that cannot be sent now says why: too large (5 MB at most), unsupported format, image address that cannot be downloaded, or a connection problem. An upload that hangs gives up after a minute, so the loading spinner no longer stays on the photo forever, and the previous photo is kept. AVIF photos can be chosen from the device too (#743, #645).

## v2026.10.2 - 2026-10-23

### Added
- The first-run wizard has a *Later* button. It closes the wizard until your next sign-in, reloads and other tabs included, and the wizard then resumes where you left it. *Don't show the wizard again* finishes it for good and says it can be restarted from your profile (#694, #689).
- A member who joins an instance already filled by someone else gets a short version of the wizard: the welcome and language, then what the household holds (cellars, bottles in stock), with *Explore the cellar* or *Add bottles*. They are no longer asked to create a first cellar (#694, #687).

### Fixed
- The first-run wizard remembers the cellar it had you create. After an interruption, the add form and the file import use it, the summary names it, and going back to the cellar step no longer creates a second one (#694, #685).
- Leaving the first-run wizard can no longer get you stuck in front of it when the server does not answer (#694, #689).
- After a single click on *Reference* in the add form, no bottle could be added any more, even after switching back to *In the cellar*: the server refused the empty fill level and the form only said "Could not add the asset". Saving works again either way, and a value the server refuses is now named (#693, #683).
- Importing a cellar file no longer loses bottles. A case of 6 written as one row with a quantity of 6, or as six identical rows, now gives 6 bottles instead of 1 and "5 rows skipped (already in your inventory)". A row is only skipped when that bottle was in stock before the import, and the summary says so; a bottle already drunk or a non-owned reference no longer blocks a new purchase. The preview shows how many assets the file stands for, and a file over the 500-asset limit is refused with a message instead of being cut short without a word. A refused file or a failed import now says why, the screen waits for a slow server to finish instead of giving up after 30 s, and trying again never imports the same bottles twice (#697, #577, #641).

## v2026.10.1 - 2026-10-23

### Changed
- The API image now starts `dist/api/src/index.js` instead of `dist/index.js`: the API and the web app now read one shared folder of contracts (`shared/`), so a field or a value list can no longer differ between them. This only matters if you override the API container's command. Building an image by hand now needs `--build-context shared=./shared` (#679, #466).

### Fixed
- With two-factor authentication on, the profile showed it as off, offered no way to turn it off, and *Trust this device* failed because it never asked for the code. The 2FA status is now shown correctly (#677, #576).
- A bottle you have finished (opened, nothing left) no longer counts as stock. It leaves the peak alerts and the bell, the peak e-mails, the *To drink* suggestions, the expected list of inventory counts (so *Mark as consumed* finally takes a missing bottle off it), the cellar map and the analytics maturity figures. The sidebar badge and the cellar cards count only what you hold, like the inventory list. A finished bottle gives its cellar-map slot back; an update frees the slots of bottles already finished (#678, #573).
- Label scanning is only offered when it can work. On an install without the optional recognition service (`docker compose --profile scan up -d`), the scan buttons of the first-run wizard, the inventory and the add form are hidden, and *Admin → System Configuration → Integrations* says how to enable it. A failed scan now gives its real cause (service unavailable, too many scans, photo too large or in an unsupported format, analysis too long) instead of always asking for a sharper photo, and offers *Enter manually* (#681, #639).
- The first-run wizard could stay on its loading spinner forever, over an app that could not be reached: this happened whenever your cellars had loaded before it opened, as with *Review the getting started guide* on the profile page, and sometimes on first sign-in. It now opens at the right step every time (#682, #574).
- In the first-run wizard, *Manual Entry* and *Quick Scan* opened their window behind the wizard: nothing seemed to happen, and the only way out was to skip the wizard. Error messages raised in the wizard, such as a failed cellar creation, were hidden too. Both windows and the messages now show on top. The scan step also gets a *Back* button: closing the scanner returns to the step instead of jumping to the summary (#682, #574).
- In the first-run wizard's *Manual Entry*, saving a second bottle of the same wine did nothing, with no message. It now offers the same choice as the inventory page (*Increment quantity*, *Create anyway*, *Back to form*), and collections picked in the form are kept (#688, #684).

### Removed
- The *OCR service URL* admin setting: it was saved but never used, since label scanning always uses the built-in recognition service (#681, #639).

## v2026.10.0 - 2026-10-20

### Security
- Guests with write access no longer erase notes hidden from them, the response to their edit honours *hide prices* and *hide notes*, and their edits show in the item history under the guest's name (#541, #547; #472, #483).
- Notification emails escape every member-entered value (#547, #488). Guest-link and password-reset tokens are masked in the access log (#547, #490). Guest links stop working when their creator's account is deactivated (#547, #486).
- The full data purge, restoring a backup and downloading one ask for the admin's password; a backup is taken before a purge, and the purge is written to the audit log afterwards. **Downloading a backup is now `POST /api/admin/backups/:id/download`** (#556, #489).
- The quick lock is shared by every tab and survives reopening the installed app (#552, #487).
- 12-character minimum password everywhere: sign-up, change and reset (#535, #484).
- Registration is closed by default. Once the first account (the admin) exists, `POST /api/auth/register` returns `REGISTRATION_CLOSED` until an admin turns on **Allow new accounts to register** in Administration → System Configuration → Network. Instances that relied on open sign-up must enable it (#304, #73).
- The seed script and its hardcoded admin password were removed (#322, #147).
- The CSRF guard accepts the host a request was addressed to, so Glou works when opened by IP over plain HTTP (a NAS) without setting `APP_URL`; a rejected request now logs why (#266, #247).
- `next` updated to 16.3.8 (security release).
- **Action required on instances deployed before `docker-compose.yml` started requiring `DB_PASSWORD`:** an old fallback database password (`glou_secret`) is readable in this repository's git history and must be treated as compromised. Rotate `DB_PASSWORD` on any such instance — see [Rotate the Secrets](docs/wiki/EN/29-Secret-Rotation.md#rotate-db_password) / [Changer les secrets](docs/wiki/FR/29-Rotation-Des-Secrets.md#changer-db_password) (#129).

### Added
- Images are also published for `linux/arm64` (Raspberry Pi, ARM NAS) (#551, #538).
- A *System* theme that follows the OS light/dark setting; it is the default for new accounts (#567, #513).
- Pause or resume a peak alert from the bottle's detail panel (#557, #506). Edit button on budget envelopes (#554). Section shortcuts at the top of the profile (#562).
- CSV import accepts French headers and category names, and imports price, region, quantity and ABV (#561, #510).
- Administrators are notified when a member requests account deletion and when it is carried out (#553, #509).
- Administration → Backups warns when the API cannot write to the backups folder (#551, #537).
- Bottles you don't own: an item can be recorded as a *reference* — a wine tasted elsewhere, or a producer's whole range tracked without buying it. A reference is left out of the collection's value, the counters, the peak-maturity alerts, the consumption suggestions, the inventory counts and the guest showcase; it stays a valid tasting target, and one click stocks it when you buy it. References are hidden in the inventory until the "show references" filter is on (#432).
- Immutable image tags named after the full commit SHA, published next to `latest`/`beta`, to roll back without hunting for a digest (#310, #78).
- `OLLAMA_TIMEOUT_MS` (default 10 minutes) for the label scan, with an explicit `OLLAMA_TIMEOUT_AFTER_<n>MS` error (#320, #319).
- A **Pending changes** panel behind the offline sync badge: refused edits show their reason and can be retried or discarded (#354, #337).
- Sign-out buttons in the sidebar footer and on the profile page (#355, #334).
- Keyboard access to the cellar grid: Space picks up and drops a bottle, arrows move it cell by cell, Escape cancels, Enter opens details; localized screen-reader announcements (#262).
- `GET /api/stats/counts`: the sidebar badges come from one light call instead of five list queries (#260).
- Startup check for the secrets the API cannot work without (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`), with a clear `FATAL` message.
- Backups: a missed run is caught up, a failing run notifies administrators, and an admin-only notification category exists for it.
- Wiki: rotating the secrets, disaster recovery, upgrading and rolling back (FR + EN).
- `THIRD_PARTY_NOTICES.md`, generated by `scripts/generate-notices.mjs`.
- `CSRF_TRUSTED_ORIGINS` is passed through `docker-compose.yml`.

### Changed
- **Action required on Linux:** create the backups folder for the API user before starting the stack: `mkdir -p backups && sudo chown 1001:1001 backups` (README, wiki 01). Without it Docker creates the folder as root and every backup fails (#551, #537).
- `latest` and `beta` images are published only after the end-to-end tests pass (#551, #539). Compose: Ollama pinned to `0.40.6`, web healthcheck, unused `api_logs` volume removed (#551, #540).
- Peak-maturity notifications: one digest per member instead of one message per bottle (#560, #478). The bell counts only what calls for action and opens the bottle (#557, #506).
- Photos and avatars are downscaled in the browser before upload (#559, #494). Signing in again returns to the page you asked for, such as a bottle's QR code (#552, #507). Only the active language's translation file is downloaded (#550, #495).
- Tablets: filters behind a toggle below 1024 px, cards fill the width, the sidebar starts collapsed below 1280 px (#555, #497). Spirits use a glass icon (#548, #496).
- Browser storage keys are prefixed `glou:`; saved preferences are migrated (#565, #139).
- **Action required on existing instances:** `docker-compose.yml`'s `api_backups` named volume was replaced with a host bind mount (`./backups:/app/backups`), so your own backup tooling can see and collect the dumps. Backups made before this change live in the old named volume and won't appear under `./backups` automatically — copy them out with `docker run --rm -v api_backups:/from -v "$PWD/backups":/to alpine cp -a /from/. /to/` (adjust the volume name if your project/compose name differs) before running `docker volume rm api_backups`, or just let the volume sit unused (#92).
- The complete GDPR export now includes wishlist, budgets, goals, sessions, trusted devices, stock counts and configuration history (#283, #224).
- A deactivated account is reported as `INVALID_CREDENTIALS` at login (#373, #352).
- Wiki and READMEs (FR + EN) refreshed: environment variable reference, registration, offline pending changes, keyboard cellar grid, label scan timeout.
- Restoring a backup resets the `public` schema and replays the dump in one transaction.
- Plurals are real i18next plural forms instead of "(s)"; amounts use `Intl` currency formatting; dates and numbers follow the language chosen in the app.
- Page titles and the PWA manifest no longer claim a single language.
- The `PUID`/`PGID` variables were removed from the compose files (the API always runs as `1001:1001`).
- `.dockerignore` for `api/` and `web/`; log rotation on every service of the dev compose.

### Fixed
- Global search opens the chosen item or cellar (#524, #473); filters passed in the URL apply when arriving from another page (#480, #470).
- *Add* from Sparkling or Spirits presets the category; cigar cards show the number of cigars left (#548; #477, #479). Autocomplete keeps producers such as "Alfred Gratien" (#481); "today" is the local date (#482). The bulk dialog no longer writes to fields no screen shows (#474).
- Two-factor backup codes were rejected at sign-in (#549). English-speaking admins could not run the full purge (#556).
- The counters above the list follow the chosen section and leave finished bottles out (#553, #504); readable item history (#508); account-deletion copy matches what happens (#509); Humidor cellars no longer need expert mode (#515); admin confirmations in app dialogs and a member table that fits phones (#499).
- Plural forms, the sign-up language, translated tab titles and the last hard-coded French strings (#550; #528, #529, #530).
- Accessibility: keyboard-operable category and level selectors, link-based bottom bar, scrollable sidebar on short screens, numeric keypad for 2FA codes, cards no longer nest buttons, details readable in dark mode (#549, #564, #548; #516, #523, #525, #527, #517, #519).
- iPhone: the + button, bulk bar and undo toast sit above the bottom bar; the cellar map scrolls with a finger (#555; #526, #512).
- A banner says when the list is capped at 2,000 items (#558, #475).
- Docs: current navigation, `/cellar-journal` paths, map credits (#563, #493); third-party notices refreshed and checked in CI (#551, #534).
- An empty bottle no longer counts towards the value of the collection or of its cellar: a bottle recorded as opened and finished holds no remaining value, while still being counted in the inventory and in what was spent (#433).
- First account creation failing on a NAS reached by IP (#247).
- A failed `pg_dump` no longer leaves a truncated `.sql.gz` that looks like a valid backup.
- Retention deletes scan photos only after its transaction has committed.
- Restoring a trashed bottle whose grid slot was taken restores it unplaced.
- SMTP connections time out after 15 s and the transporter is reused.
- Several silent failures now report an error (stock update after a tasting, copy-link on HTTP, offline sync identifiers on HTTP).
- Accessibility: announced error banners, labelled and required form fields, keyboard-operable search, wizard progress for screen readers, `Space` no longer scrolls the map list, header hidden when printing.
- A visible placeholder is shown while the app starts instead of a blank screen; images load lazily.
