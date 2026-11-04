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
   - **Manual entry**: add a few bottles by hand, with their number. If the wine is already in your cellar, the wizard also shows "You already have this wine".
5. **Summary**: see how many bottles (or cigars) were added and which cellar they landed in, then jump to the dashboard.

You can skip any step. To leave the wizard:

- **Later** (top right) closes it until your next sign-in, reloads and other tabs included. It resumes where you left it, with the cellar it had you create.
- **Don't show the wizard again** (bottom) finishes it for good. You can still restart it from your profile.

A member who joins an instance already filled by someone else (at least one cellar, none created by them) gets a short version: the welcome and language, then a screen showing the household's cellars and bottles in stock. They are never asked to create a first cellar.

### Re-run the wizard manually
1. Go to **Profile**.
2. Click **Review onboarding**.
3. This opens `/profile?onboarding=1`, which forces the wizard to display without touching your completion flag. Running it again does not erase your existing cellar or bottles.

### Importing a CSV file
The file import step accepts **CSV only**: there is no `.xlsx`/Excel support. The server also accepts files with the `application/vnd.ms-excel` MIME type (some Windows exports label a plain `.csv` that way) but treats them as CSV, not as an Excel workbook. The file can be the one from the [CSV export of your cellar](./19-Backups-Export-Data-Portability.md#export-your-cellar-as-csv): it re-imports as is.

| Limit | Value |
| :--- | :--- |
| File type | `.csv` (`text/csv`, or `application/vnd.ms-excel` sent by some Windows exports for a `.csv` file) |
| Max size | 2 MB |
| Max rows per import | **500 rows** (whatever number of bottles they stand for: a row "quantity 200" counts as one). The preview of a longer file says so and nothing is imported: split the file. |
| Required columns | `name` (≤200 chars), `producer` (≤200 chars), `category` (`wine`, `sparkling`/`champagne`, `spirit` or `cigar`, singular or plural; the French `vin`, `bulles`, `spiritueux`, `cigare` work too) |
| Optional columns | `vintage` (whole number between 1800 and the current year), `price` (`12.50`, `12,50 €`: the price of **one** bottle, **one** box or **one** cigar), `region`, `quantity` (whole number ≥ 1, default 1), `abv` (0 to 100), `cellar`, `purchase date`, `bottle size`, `vitola` and `cigars per box` (or `single`) for a cigar, `opened` / `fill level` / `cigars left` / `opened on`, `purchase place`, `location`, `estimated value`, `to check`, and the wine's description (colour, appellation, grapes…) |
| Column names | Case, accents and spaces are ignored; French headers work too: `nom`, `producteur`, `catégorie`, `millésime`, `prix`, `région`, `quantité`, `degré`, `cave`, `date d'achat`… |
| Dates | **Day first**: `15/03/2024`, `15-03-2024`, `15.03.2024` or `2024-03-15` (years 1900 to 2100). An empty date is read as today. |

What the import does:
* **One row = one line of bottles**: `quantity` 6 creates a line "×6". **Identical** rows of the file (same wine, cellar, price, bottle size and purchase date) add up into a single line. Two different purchase dates make two lines.
* For a cigar, `quantity` is the number of boxes (or of single cigars if `cigars per box` is `single`); with no `cigars per box` column it is the number of cigars of **one** box, as in older files.
* **Unknown cellar**: a cellar named in the file that does not exist is **created** and announced in the summary.
* **Wine already in the cellar**: the preview marks the row "Wine already in the cellar (6 bottles)" and lets you choose **Add these N bottles** or **Ignore (already counted)** — **Ignore by default**, so importing the same file twice adds nothing. A wine with no bottle left, or in the trash, does not prevent importing a new purchase.
* If the wine's stock changed between the preview and the confirmation (another import, another member), the row is not imported and the summary says so: check the stock before trying again.
* A spirit imported without an `abv` column has no alcohol degree (it is not set to 0 %); fill it in afterwards from the wine's form.
* An unreadable description cell (an aeration "1 h", a window "2025-2030") is ignored without refusing the row. A wine's description is applied only when the wine is **created**: an already-known wine is never changed by the import.

The import runs in two steps: a **preview** validates every row, states how many bottles and rows the file stands for and reports errors without writing anything, then **confirm** persists all valid rows in a single all-or-nothing transaction. Fields populated from the CSV are tagged with source `import_csv` (only those actually saved), visible later in the wine's history (see [18-Field-Source-Transparency-History.md](./18-Field-Source-Transparency-History.md)).

> [!TIP]
> Beyond 500 rows, split the file, keeping all the rows of a given wine in the same part: import the first part, then reopen the wizard with **Review the getting started guide** (Profile) to import the next ones. From the second part on, wines already imported ask for a choice: **Add these N bottles** for the rest of the same wine, **Ignore** otherwise.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The wizard keeps reopening on every login** | You chose **Later**, which only lasts for one sign-in. Finish it, or click **Don't show the wizard again**. |
| **My `.xlsx` file was rejected** | Excel workbooks are not supported. Export or save the file as `.csv` first. |
| **The preview refuses my file: too many rows** | The file has more than 500 rows (rows are counted, not bottles: a row with quantity 6 counts as one). Split it, then import the parts one after the other (see the tip above). |
| **Rows "Wine already in the cellar" were not imported** | That is the default choice, **Ignore (already counted)**, which avoids counting the same bottles twice. For a new purchase, choose **Add these N bottles** in the preview, or add them from the wine (**Add bottles**). |
| **Preview shows errors on rows that look fine** | Each row in error gives its reason. Check the category is one of those in the table above, and that the name and producer aren't empty or over 200 characters. |
| **I want to run the wizard again just to test something** | Visit `/profile?onboarding=1` or click **Review the getting started guide** in your profile. It does not touch your existing data, and finishing or skipping it again does not create duplicates on its own (a wine you already have is recognized on add: "You already have this wine", see [05-Bottle-Addition.md](./05-Bottle-Addition.md)). |
