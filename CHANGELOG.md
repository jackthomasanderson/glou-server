# Changelog

All notable changes to Glou. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Glou uses Calendar Versioning (`YYYY.MM[.PATCH]`, see [CONTRIBUTING.md](CONTRIBUTING.md#versioning)).
Container images are published as `latest` (stable, from `main`), `beta` (from `dev`),
and, on `main`, as the matching `vYYYY.MM[.PATCH]` tag. Changes accumulate under
*Unreleased* until the next promotion of `dev` to `main` cuts a numbered release.
Entries start with the pull request that introduced them where there is one.

## Unreleased

### Added
- The first-run wizard has a *Later* button. It closes the wizard until your next sign-in, reloads and other tabs included, and the wizard then resumes where you left it. *Don't show the wizard again* finishes it for good and says it can be restarted from your profile (#694, #689).
- A member who joins an instance already filled by someone else gets a short version of the wizard: the welcome and language, then what the household holds (cellars, bottles in stock), with *Explore the cellar* or *Add bottles*. They are no longer asked to create a first cellar (#694, #687).

### Fixed
- The first-run wizard remembers the cellar it had you create. After an interruption, the add form and the file import use it, the summary names it, and going back to the cellar step no longer creates a second one (#694, #685).
- Leaving the first-run wizard can no longer get you stuck in front of it when the server does not answer (#694, #689).
- Importing a cellar file no longer loses bottles. A case of 6 written as one row with a quantity of 6, or as six identical rows, now gives 6 bottles instead of 1 and "5 rows skipped (already in your inventory)". A row is only skipped when that bottle was in stock before the import, and the summary says so; a bottle already drunk or a non-owned reference no longer blocks a new purchase. The preview shows how many assets will be imported, and a file over the 500-asset limit is refused with a message instead of being cut short without a word. A refused file or a failed import now says why, and the screen waits for a slow server to finish (#577, #641).

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
