# Add a bottle by photographing its label

## TL;DR
The "Scan a label" button opens the camera, sends the photo to a lightweight self-hosted vision model (Ollama + moondream) that pre-fills name, producer, category, and vintage, to confirm in 3 actions max.

## Prerequisites
* Label scan is **optional and off by default** (it needs ~9 GB of disk and ~3 GB of RAM). Enable it with `docker compose --profile scan up -d`: this starts the `ollama` service and the one-shot `ollama-pull`, which downloads the `moondream` model (~1.7 GB) on first start. Without the `scan` profile, the rest of the app works normally and every scan button is hidden (first-run wizard, inventory, add form). They appear once the service answers and the model is pulled. **Admin → System Configuration → Integrations** shows whether scanning is active.
* No client-side setup: scanning uses the device's camera or photo gallery.

## Action

1. From the inventory screen, click **Scan a label**.
2. Photograph the label on the bottle, spirit, or cigar box, with sharp framing and decent lighting.
3. Wait during analysis ("Analyzing label…"). Processing is asynchronous and can take tens of seconds on a server without a GPU, since the model runs on CPU by default.
4. Review and correct the detected fields (name, producer, vintage, category, size). Every field stays editable before you confirm.
5. If the product looks like something already in stock, a duplicate warning appears (universal deduplication): choose to increment the existing stock or create a new entry.
6. Click **Confirm and add**. The item is created immediately (no pending draft) and added to the session's "To Shelve" cart.
7. Click **Scan next item** to keep going without leaving the camera view, for a whole batch of bottles.
8. Click **Finish** to close the session. The "To Shelve" cart keeps the scan order to ease physical shelving.

> [!TIP]
> Set a default location per category ("Always shelve scanned [category] here") so every scanned bottle is assigned to the right cellar automatically.

## Recognition limits

| Factor | Impact |
| :--- | :--- |
| Photo sharpness / lighting | A blurry, poorly lit, or partially torn label significantly degrades recognition. |
| Model used | `moondream` is a lightweight self-hosted vision model (~1.8 billion parameters), not a wine/spirits-specialized cloud service. It reads text and general layout but can get rare appellations or hard-to-read vintages wrong. Always check fields before confirming. |
| Server hardware | Processing runs on CPU by default (no GPU configuration provided). Tens of seconds per photo is normal on typical home-lab hardware. |

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **No "Scan a label" button** | The `scan` profile isn't running, or the model is still downloading: start it with `docker compose --profile scan up -d` and wait for `ollama-pull` to finish. **Admin → System Configuration → Integrations** says whether scanning is active. |
| **"The label recognition service is not available"** | The service stopped after the page was loaded. Restart the `scan` profile. Meanwhile, **Enter manually** opens the add form without leaving the scan session. |
| **Scan stays stuck on "Analyzing…" for a long time** | On the instance's very first startup, the `moondream` model (~1.7 GB) must be pulled by the `ollama-pull` service before scanning works. Wait a few minutes and retry. On modest hardware, a scan can legitimately take several minutes. |
| **"The analysis took too long"** | The model did not answer in time (`OLLAMA_TIMEOUT_AFTER_<n>MS` in the API log). The wait is 10 minutes by default; raise it with `OLLAMA_TIMEOUT_MS` (milliseconds) in `.env`, then `docker compose up -d`. |
| **"Too many scans in a short time"** | Each member can send 10 photos per 10 minutes. Wait a few minutes. |
| **"This photo could not be sent"** | The photo is over 10 MB or not a JPEG, PNG, WebP or GIF. |
| **"The label analysis failed for a technical reason"** | Any other failure. The API log (`[scan] Job … failed`) gives the cause. |
| **Detected info is wrong or incomplete** | Expected with a lightweight vision model: manually correct the fields before clicking "Confirm and add". Nothing is ever saved without your explicit confirmation. |
| **Duplicate flagged but it's not actually the same product** | Duplicate detection compares name/producer/vintage. If two different bottles have very similar labels, choose to create a new entry instead of incrementing existing stock. |
