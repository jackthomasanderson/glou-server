# Complete the first-login setup wizard

## TL;DR
The setup wizard walks a new account through creating a first cellar and loading initial bottles. It appears automatically once, and you can reopen it from your profile.

## Prerequisites
* A logged-in account with no cellar yet (or you just want to re-run it manually).

## Action

### First run
1. Log in for the first time. If your account has not completed onboarding, the wizard opens automatically as a full-screen overlay.
2. **Welcome**: pick your language (FR/EN).
3. **Cellar**: create your first cellar (name, storage type).
4. **Ingestion method**: choose one:
   - **Quick scan**: label OCR.
   - **File import**: upload a CSV of your inventory (see limits below).
   - **Manual entry**: add a few bottles by hand.
5. **Summary**: see how many items were added and which cellar they landed in, then jump to the dashboard.

You can skip any step. To leave the wizard:

- **Later** (top right) closes it until your next sign-in, reloads and other tabs included. It resumes where you left it, with the cellar it had you create.
- **Don't show the wizard again** (bottom) finishes it for good. You can still restart it from your profile.

A member who joins an instance already filled by someone else (at least one cellar, none created by them) gets a short version: the welcome and language, then a screen showing the household's cellars and bottles in stock. They are never asked to create a first cellar.

### Re-run the wizard manually
1. Go to **Profile**.
2. Click **Review onboarding**.
3. This opens `/profile?onboarding=1`, which forces the wizard to display without touching your completion flag. Running it again does not erase your existing cellar or bottles.

### CSV import limits
The file import step accepts **CSV only**: there is no `.xlsx`/Excel support. The server also accepts files with the `application/vnd.ms-excel` MIME type (some Windows setups label a plain `.csv` that way), but parses them as CSV, not as an Excel workbook.

| Limit | Value |
| :--- | :--- |
| File type | `.csv` (`text/csv`, or `application/vnd.ms-excel` sent by some Windows exports for a `.csv` file) |
| Max file size | 2 MB |
| Max rows | 500 (extra rows are silently ignored; only the first 500 are read) |
| Required columns | `name` (≤200 chars), `producer` (≤200 chars), `category` (`wine`, `sparkling`, `spirit`, or `cigar`; French `vin`, `bulles`/`champagne`, `spiritueux`, `cigare` and plurals also work) |
| Optional columns | `vintage` (whole number between 1800 and the current year), `price` (`12.50`, `12,50 €`), `region`, `quantity` (cigars, whole number ≥ 1, default 1), `abv` (0 to 100) |
| Header names | Case, accents and spaces are ignored; French headers work: `nom`, `producteur`/`domaine`, `catégorie`, `millésime`, `prix`, `région`, `quantité`, `degré` |

A spirit imported without an `abv` column has no ABV (it is not set to 0 %); fill it in later from the item's form.

The import runs in two steps: a **preview** validates every row and reports errors without writing anything, then **confirm** persists all valid rows in a single all-or-nothing transaction. Fields populated from the CSV are tagged with source `import_csv`, visible later on the item's detail view (see [18-Field-Source-Transparency-History.md](./18-Field-Source-Transparency-History.md)).

> [!TIP]
> For more than 500 rows or other columns (format, cellar slot…), use **Manual entry** for the first batch through the wizard, then bulk-add the rest from the main inventory screen once onboarding is done. That screen is not limited to 500 rows.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The wizard keeps reopening on every login** | You chose **Later**, which only lasts for one sign-in. Finish it, or click **Don't show the wizard again**. |
| **My `.xlsx` file was rejected** | Excel workbooks are not supported. Export or save the file as `.csv` first. |
| **Only some of my rows were imported** | You went over the 500-row cap: only the first 500 rows of the file are read. Split the file and import the rest afterward from the main inventory screen. |
| **Preview shows errors on rows that look fine** | Check `category` is exactly one of `wine`, `sparkling`, `spirit`, `cigar` (case-sensitive), and that `name`/`producer` aren't empty or over 200 characters. |
| **I want to run the wizard again just to test something** | Visit `/profile?onboarding=1` or click **Review the getting started guide** in your profile. It does not touch your existing data, and finishing or skipping it again does not create duplicates on its own (duplicate detection still applies on add, see [Deduplication](./07-Global-Search.md) if relevant). |
