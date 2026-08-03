# Add a Bottle by Photographing Its Label

## TL;DR
The "Scan a label" button opens the camera, sends the photo to a lightweight self-hosted vision model (Ollama + moondream) that pre-fills name, producer, category, and vintage, ready to confirm in 3 actions max.

## Prerequisites
* The `ollama` service must be running via Docker Compose, with the `moondream` model pulled — this happens automatically on first startup via the `ollama-pull` service (~1.7 GB, see Troubleshooting if the first scan fails).
* No client-side setup needed: scanning uses the device's camera or photo gallery.

## Action

1. From the inventory screen, click **Scan a label**.
2. Photograph the label on the bottle, spirit, or cigar box — sharp framing, decent lighting.
3. Wait during analysis ("Analyzing label…"): processing is asynchronous and can take tens of seconds on a server without a GPU, since the model runs on CPU by default.
4. Review and correct the detected fields (name, producer, vintage, category, size) — every field stays editable before you confirm.
5. If the product looks like something already in stock, a duplicate warning appears (universal deduplication): choose to increment the existing stock or create a new entry.
6. Click **Confirm and add** — the item is created immediately (no pending draft) and added to the session's "To Shelve" cart.
7. Click **Scan next item** to keep going without leaving the camera view — repeat for a whole batch of bottles.
8. Click **Finish** to close the session; the "To Shelve" cart keeps the scan order to make physical shelving easier.

> [!TIP]
> Set a default location per category ("Always shelve scanned [category] here") so every scanned bottle is automatically assigned to the right cellar, with no extra click.

## Recognition Limits

| Factor | Impact |
| :--- | :--- |
| Photo sharpness / lighting | Directly determines quality: a blurry, poorly lit, or partially torn label significantly degrades recognition. |
| Model used | `moondream` is a lightweight self-hosted vision model (~1.8 billion parameters), not a wine/spirits-specialized cloud service — it reads text and general layout but can get rare appellations or hard-to-read vintages wrong. Always double-check fields before confirming. |
| Server hardware | Processing runs on CPU by default (no GPU configuration provided) — tens of seconds per photo is normal on typical home-lab hardware. |

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Scan stays stuck on "Analyzing…" for a long time** | On the instance's very first startup, the `moondream` model (~1.7 GB) needs to be pulled by the `ollama-pull` service before scanning works — wait a few minutes and retry. On modest hardware, a scan can legitimately take up to 2 minutes (server timeout is 120s). |
| **"Label analysis failed"** | Retry with a sharper or better-lit photo — this is the generic message returned on model failure or timeout. |
| **Detected info is wrong or incomplete** | Expected with a lightweight vision model: manually correct the fields before clicking "Confirm and add". Nothing is ever saved without your explicit confirmation. |
| **Duplicate flagged but it's not actually the same product** | Duplicate detection compares name/producer/vintage — if two different bottles have very similar labels, choose to create a new entry instead of incrementing existing stock. |
