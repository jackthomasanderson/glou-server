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
| Max assets per import | 500 (a bottle, or a box for cigars). The preview of a file standing for more says so and the import cannot go ahead: split the file. |
| Required columns | `name` (≤200 chars), `producer` (≤200 chars), `category` (`wine`, `sparkling`, `spirit`, or `cigar`; French `vin`, `bulles`/`champagne`, `spiritueux`, `cigare` and plurals also work) |
| Optional columns | `vintage` (whole number between 1800 and the current year), `price` (`12.50`, `12,50 €`), `region`, `quantity` (whole number ≥ 1, default 1: the number of bottles for a wine, sparkling or spirit, which creates that many assets; the number of cigars in the box for a cigar, which creates a single box), `abv` (0 to 100) |
| Header names | Case, accents and spaces are ignored; French headers work: `nom`, `producteur`/`domaine`, `catégorie`, `millésime`, `prix`, `région`, `quantité`, `degré` |

A spirit imported without an `abv` column has no ABV (it is not set to 0 %); fill it in later from the item's form.

A case of 6 can be written either as one row with `quantity` 6 or as six identical rows: both give 6 bottles. A row is **not imported** when the same bottle was **in stock before the import** (same producer, name and format; same vintage, or no vintage on one side); the summary says so ("already in stock before the import"). Rows of the same file are never compared with each other, and a finished bottle, a non-owned reference or a bottle in the trash does not stop a new purchase of the same wine from being imported.

The import runs in two steps: a **preview** validates every row, states how many assets will be imported and reports errors without writing anything, then **confirm** persists all valid rows in a single all-or-nothing transaction. Fields populated from the CSV are tagged with source `import_csv` (only those actually saved: a wine's quantity, which becomes a number of bottles, is not), visible later on the item's detail view (see [18-Field-Source-Transparency-History.md](./18-Field-Source-Transparency-History.md)).

> [!TIP]
> Beyond 500 assets, split the file: import the first part, then reopen the wizard with **Review the getting started guide** (Profile) to import the next ones. For other columns (format, cellar slot…), complete the items after the import.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The wizard keeps reopening on every login** | You chose **Later**, which only lasts for one sign-in. Finish it, or click **Don't show the wizard again**. |
| **My `.xlsx` file was rejected** | Excel workbooks are not supported. Export or save the file as `.csv` first. |
| **The preview refuses my file: too many assets** | The file stands for more than 500 assets (a row with quantity 6 counts 6). Split it, then import the parts one after the other (see the tip above). |
| **Rows "already in stock before the import" were not imported** | The same bottle was already in stock before the import. If it is a new purchase, add it from the inventory. |
| **Preview shows errors on rows that look fine** | Each row in error gives its reason. Check the category is one of those in the table above, and that the name and producer aren't empty or over 200 characters. |
| **I want to run the wizard again just to test something** | Visit `/profile?onboarding=1` or click **Review the getting started guide** in your profile. It does not touch your existing data, and finishing or skipping it again does not create duplicates on its own (duplicate detection still applies on add, see [Deduplication](./07-Global-Search.md) if relevant). |
