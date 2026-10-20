# Configure peak maturity alerts

## TL;DR
Enter a start and end year on a wine or sparkling bottle: the dashboard alerts you when it approaches or reaches its optimal drinking window.

## Prerequisites
- At least one bottle of category **Wine** or **Sparkling** in your cellar.
- The peak maturity window applies to these two categories only.

## Action

### 1. Set the drinking window

1. Open a bottle's detail view (**Edit**) or create a new one.
2. In step 2 (category details), expand the optional fields section via **Show optional fields**.
3. Fill in **Optimal window start (year)**, e.g. `2027`.
4. Fill in **Optimal window end (year)**, e.g. `2035`.
5. Save. The status is computed immediately on the server.

> [!TIP]
> Only one field is required: if only the end year is set, the calculation uses it as both start and end.

### 2. Read the badge on the bottle card

Each card displays a colored badge in the metadata area:

| Color | Status | Meaning |
| :--- | :--- | :--- |
| Blue | **Approaching** | The peak window starts in the future |
| Green | **At peak** | The current year is within the window |
| Red | **Past peak** | The window has passed |
| Grey | - | Alert paused or no window defined |

### 3. View the alert center

The **Peak Maturity Alerts** panel appears at the top of the dashboard when a non-paused bottle has status `approaching`, `peak`, or `past`.

- Bottles are sorted by urgency: **past** first, then **peak**, then **approaching**.
- The header color reflects the highest-urgency case (red / green / blue).

### 4. Pause or resume an alert

In the notification bell, click the bell icon on the right side of a bottle's row, or open the bottle and use **Pause alert** under its drinking window.

- The bottle is removed from the bell and the alert center.
- Its card badge switches to grey with an outlined style (reduced opacity).
- To resume, open the bottle and click **Resume alert**.

> [!CAUTION]
> Pausing an alert does not modify the stored drinking window. Resuming restores the computed status with no data loss.

### 5. Notifications

Statuses are recomputed once a day. When bottles enter their drinking window, every member receives **one** notification for the day (email, Gotify, per their preferences): the bottle's name if there is only one, otherwise a summary listing the first ten with a link to the alerts. Since statuses change by calendar year, most bottles enter their window on 1 January.

No notification is sent for a bottle that is added, or whose window is edited, while it is already inside its window: it shows directly as **At peak** in the list and the bell.

## Troubleshooting

| Error / Behavior | Resolution |
| :--- | :--- |
| **Peak maturity fields do not appear** | These fields are only available for **Wine** and **Sparkling** categories. Verify the category selected in step 1. |
| **Badge does not appear after saving** | `alertStatus` is computed server-side on save. Refresh the page if the badge does not appear immediately. |
| **Alert center does not appear** | It only shows when at least one bottle has status `approaching`, `peak`, or `past` **and** its alert is not paused. Check both conditions. |
| **Status looks wrong** | The calculation is based on the server's current year. If the server runs in a different timezone, the reference year may differ by one unit at year boundaries. |
| **Editing the window does not update the badge instantly** | After each bottle update, the backend recomputes `alertStatus`. React Query invalidates the cache on success. A manual refresh is only needed if a network error blocked the update. |
