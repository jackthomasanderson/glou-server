# Complete the First-Login Setup Wizard

## TL;DR
The setup wizard walks a new account through creating a first cellar and loading initial bottles — it appears automatically once, and you can bring it back any time from your profile.

## Prerequisites
* A logged-in account with no cellar yet (or you just want to re-run it manually).

## Action

### First run
1. Log in for the first time. If your account has not completed onboarding, the wizard opens automatically as a full-screen overlay.
2. **Welcome** — pick your language (FR/EN).
3. **Cellar** — create your first cellar (name, storage type).
4. **Ingestion method** — choose one:
   - **Quick scan** — label OCR.
   - **File import** — upload a CSV of your inventory (see limits below).
   - **Manual entry** — add a few bottles by hand.
5. **Summary** — see how many items were added and which cellar they landed in, then jump to the dashboard.

You can skip any step, or close the wizard and come back to it later — closing it before completion does not mark it as done, so it reopens on your next login.

### Re-run the wizard manually
1. Go to **Profile**.
2. Click **Review onboarding**.
3. This opens `/profile?onboarding=1`, which forces the wizard to display without touching your completion flag — running it again does not erase your existing cellar or bottles.

### CSV import limits
The file import step accepts **CSV only** — there is no `.xlsx`/Excel support, even though the server also accepts files with the `application/vnd.ms-excel` MIME type (some Windows setups label a plain `.csv` that way; it's still parsed as CSV, not as a real Excel workbook).

| Limit | Value |
| :--- | :--- |
| File type | `.csv` (`text/csv`, or `application/vnd.ms-excel` sent by some Windows exports for a `.csv` file) |
| Max file size | 2 MB |
| Max rows | 500 (extra rows are silently ignored — only the first 500 are read) |
| Required columns | `name` (≤200 chars), `producer` (≤200 chars), `category` (`wine`, `sparkling`, `spirit`, or `cigar`) |
| Optional column | `vintage` (whole number between 1800 and the current year) |

The import runs in two steps: a **preview** validates every row and reports errors without writing anything, then **confirm** persists all valid rows in a single all-or-nothing transaction. Fields populated from the CSV are tagged with source `import_csv`, visible later on the item's detail view (see [18-Field-Source-Transparency-History.md](./18-Field-Source-Transparency-History.md)).

> [!TIP]
> Need more than 500 rows or richer columns (region, price, quantity, format...)? Use **Manual entry** for the first batch through the wizard, then bulk-add the rest from the main inventory screen once onboarding is done — it isn't limited to 500 rows.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The wizard keeps reopening on every login** | You closed it without finishing or without clicking Skip. Complete a step or explicitly skip to set the completion flag — simply closing the browser tab does not count. |
| **My `.xlsx` file was rejected** | Excel workbooks are not supported. Export/save the file as `.csv` first. |
| **Only some of my rows were imported** | You went over the 500-row cap — only the first 500 rows of the file are read. Split the file and import the rest afterward from the main inventory screen. |
| **Preview shows errors on rows that look fine** | Check `category` is exactly one of `wine`, `sparkling`, `spirit`, `cigar` (case-sensitive), and that `name`/`producer` aren't empty or over 200 characters. |
| **I want to run the wizard again just to test something** | Visit `/profile?onboarding=1` or click **Review onboarding** in your profile — it won't touch your existing data, and finishing/skipping it again won't cause duplicates on its own (duplicate detection still applies on add, see [Deduplication](./07-Global-Search.md) if relevant). |
