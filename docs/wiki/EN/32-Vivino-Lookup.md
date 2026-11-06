# Look a wine up on Vivino

## TL;DR
An optional lookup finds a wine on Vivino from its producer, name and vintage, and proposes values for the item's fields: drinking window, grapes, alcohol and colour. It also returns Vivino's rating, region and price, to show as Vivino's. It is off by default, and for now only reachable through the API: no screen uses it yet.

## Prerequisites
* `VIVINO_ENABLED=true` in `.env`, then `docker compose up -d`.
* The server can reach `https://www.vivino.com`.

> [!WARNING]
> Vivino has no public API. The lookup reads the public web pages a browser gets, which Vivino's terms of use do not allow, and their markup can change without notice: lookups then find nothing until the parser is updated. When the lookup is on, the producer, name, vintage and appellation of each wine you look up are sent to vivino.com.

## How it works
1. A signed-in member calls `GET /api/vivino/lookup` with the item's fields: `producer` (required), `name`, `vintage`, `color`, `category` (`wine` or `sparkling`), `appellation`, `region`, `sugarLevel`. `GET /api/vivino/status` says whether the lookup is on.
2. Glou searches Vivino, scores each result on the producer, the wine's name, the appellation, the colour and the sweetness, then opens the best ones (three at most) until one agrees with the bottle. A wine of another colour from the same producer is refused rather than returned.
3. The answer holds `match` (Vivino's wine: link, rating, region, price, image) and `suggestions`, under the item's own field names: `color`, `grapeVarieties`, `alcoholDegree`, `peakMaturityFrom`, `peakMaturityTo`. Only values the item form accepts are proposed.

The lookup writes nothing. Applying a suggestion, and leaving alone the fields listed in `lockedFields`, is up to the caller.

## Limits
* Requests to Vivino leave one at a time, 2 to 3 seconds apart: a lookup takes a few seconds, up to about 20 for a hard one.
* Answers are kept in memory for 30 days (a wine not found, for one day) and are lost when the API restarts.
* Each member can run 30 lookups every 10 minutes.
* If Vivino answers *too many requests* (403 or 429), no request leaves for 15 minutes.

## Errors

| Code | Status | Meaning |
| :--- | :--- | :--- |
| `VIVINO_DISABLED` | 503 | `VIVINO_ENABLED` is not `true`. |
| `VIVINO_NO_MATCH` | 404 | Nothing close enough. `details.reason`: `NO_CANDIDATE`, `COLOR_MISMATCH` (Vivino only has another colour from that producer), `UNREADABLE_PAGE` (Vivino's pages have changed). |
| `VIVINO_UNAVAILABLE` | 503 | Vivino cannot be reached, or lookups are paused after a block (`details.blocked`). |
| `VIVINO_RATE_LIMITED` | 429 | The member has used up their lookups for now. |
| `VALIDATION_ERROR` | 400 | No producer, a spirit or a cigar, or a value outside the item's limits. |

**Troubleshooting**:
* *Every lookup answers `VIVINO_NO_MATCH` with `UNREADABLE_PAGE`*: Vivino has changed its pages. Everything that reads them is in `api/src/services/vivino/parsing.ts`.
* *Every lookup answers `VIVINO_UNAVAILABLE`*: check that the API container can reach `www.vivino.com`, and the `[vivino]` lines of `docker compose logs api`.
