# Manage My Wine Cellars

**TL;DR**: Organize your bottles by storage zones (aging, service, display) for a precise and localized inventory.

## Prerequisites
- An active user account.
- Being logged into the application.

## Management Steps

1. **Access the Cellars Tab**: Click on "Wine Cellars" (or "Caves") in the top navigation bar.
2. **Create a Cellar**:
   - Click the "Add cellar" button.
   - Enter a name (e.g., "Main Cellar").
   - Select the type (Aging, Wine Cooler, or Shelf).
   - Validate with "Add".
3. **Assign Bottles**:
   - Go to the "Bottles" page.
   - Add or edit a bottle.
   - Select the target cellar from the "Wine Cellars" dropdown menu.
4. **Edit or Delete**: Use the pencil icon (edit) or trash icon (delete) on each cellar card.

## Humidor Hygrometry Monitoring

**TL;DR**: For a "Humidor"-type cellar, manually log your humidity readings to track history and get alerted when the latest measurement drifts outside your target range.

### Prerequisites
- [Expert Mode](./27-Expert-Mode.md) enabled on your profile — the "Humidor" cellar type and its monitoring panel are only visible under this condition.

### Action

1. **Create or edit a cellar as type "Humidor (cigars)"**: in the cellar form, select this type (only visible in expert mode).
2. **Set the target hygrometry range** (optional but recommended): fill in `Min. humidity (%)` and `Max. humidity (%)` (e.g. 68-72%). Without this range, no drift can be detected (status "Not configured").
3. **Open the cellar's page**: the "Hygrometric monitoring" panel appears below the cellar's details.
4. **Add a reading**: at the bottom of the panel, enter the measured `Humidity (%)` (required) and, optionally, `Temperature (°C)` (informational only — it does not factor into the drift calculation). Click the add button.
5. **Read the status**: a badge shows `In range`, `Out of range`, or `Not configured`, computed solely from **your latest reading** (no drift history, no averaging).
6. **Check the history**: recent readings (up to 100, 30 by default) are listed and plotted on a small chart, oldest to newest.

> [!TIP]
> If the latest reading falls outside the target range, a notification is sent under the "Temperature/humidity variations" category (configurable in Profile > Notifications), in addition to the "Out of range" badge on the panel.

> [!CAUTION]
> **No physical sensor is supported.** There is currently no MQTT integration, webhook, or connected probe: every reading must be entered manually, one at a time, by a user. A reading's technical `source` field can be `manual` (every reading created from the UI today) or `sensor` (reserved for a future hardware bridge — not built). If you're looking to wire up a humidor probe for automatic readings, this feature does not exist in the application.

## Troubleshooting

| Issue | Probable Cause | Resolution |
| :--- | :--- | :--- |
| My cellar does not appear in the bottle list | Session sync | Refresh the page (F5). |
| I cannot delete a cellar | Connection error | Verify you are still logged in. Deleting a cellar does not delete bottles (they become "orphans"). |
| Impossible to save name | Validation | Name must be between 1 and 200 characters. |
| The "Humidor" type does not appear in the cellar type list | Expert Mode is off | Enable [Expert Mode](./27-Expert-Mode.md) from your profile. |
| The hygrometric monitoring panel does not show on my Humidor cellar's page | Expert Mode is off, or the cellar is not (or no longer) of type Humidor | Check the cellar's type and that expert mode is enabled. |
| The status shows "Not configured" even though I recorded readings | No target range set on the cellar | Edit the cellar and fill in `Min. humidity` and `Max. humidity`. |
| My reading is rejected (`VALIDATION_ERROR` error) | Humidity outside 0-100%, or temperature outside -20°C to 60°C | Correct the entered value; these are the only bounds accepted by the API. |
| I'm waiting for a connected probe to send readings automatically, nothing happens | No physical sensor/MQTT support exists in the application | Enter readings manually. See the notice above. |

> [!TIP]
> Use explicit names for your cellars (e.g., "Cooler - Bottom Shelf") to find your bottles faster on mobile devices.
