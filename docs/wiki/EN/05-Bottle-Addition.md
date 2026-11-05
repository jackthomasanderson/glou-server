# Add one or several bottles

## TL;DR
Add a wine, spirit or cigar to a cellar, with the number of bottles you bought. A wine you already have is recognized: only how many, where and at what price remain to enter.

## Prerequisites
* Having created at least one **Cellar**.
* Logged into your account.

## Action

### Add a new wine
1. Open **Wines**, **Sparkling**, **Spirits** or **Cigars** in the navigation, then click **+ Add** (on a phone, the round **+** button). The form opens on that category.
2. **Step 1 (Common section)**: Check or change the category: Wine, Sparkling, Spirit or Cigar.
3. Select the destination cellar.
4. Enter the name and producer. Both fields offer **Google-powered autocomplete** after 2 characters. If a suggestion includes a vintage year, it is auto-extracted into the Vintage field. See [08-Autocomplete-Image.md](./08-Autocomplete-Image.md).
5. Enter the **Number of bottles** (1 by default). The purchase price and the estimated value are those of **one** bottle: Glou multiplies. Bottles bought together make a single line, "6 · Garage · €20".
6. **Step 2 (Specific options)**: Fields adapt to the chosen category (e.g. grape variety for wine, age for spirits). A **Search image** icon lets you attach a photo from Wikimedia Commons.
7. Click **Save**. The wine appears on a single card, whatever the number of bottles.

### Cigars
For a cigar, choose the **Storage**: **Closed boxes** ("3 boxes of 25 cigars", with the price of **one box**) or **Single cigars** ("4 cigars", with the price of **one cigar**). For a box that is already opened, tick **Opened box** and enter the **Cigars left in the box**.

### You already have this wine
As soon as the name (and producer, vintage) matches a wine you already have, Glou shows **You already have this wine** (or spirit, cigar) with what you hold, per cellar. Two choices:
* **Add bottles to this wine**: the form shrinks to the number, the bottle size (taken from your latest line), the cellar and the price (for a cigar: the number, and "boxes of how many" or "single"). The bottles join the wine.
* **It's another wine**: a new wine is created and Glou will no longer suggest grouping it with the other one. **Back to the entry** returns to the form.

The same reminder appears when you scan a label, convert a wish into a purchase, or add bottles with the first-run wizard. The former duplicate warning with its "Increment quantity" button no longer exists.

### Add bottles to a wine you already have
Open the wine, then **Add bottles** (**Add cigars** for a cigar): enter the number, cellar, price and purchase date. A line is completed only if the cellar, price, bottle size **and purchase date** are the same: a purchase on another day makes a separate line ("6 · Garage · €20 · Jan" and "2 · Garage · €20 · Jun"), so that your budget stays right. A line holds at most 1,000 bottles.

### Correct the number
In a line's menu, **Correct the number** only **lowers** the number, and asks why: **Input error** (the bottles never existed: they disappear, spending included) or **Broken, given away or lost** (they leave the cellar and its value but stay in your spending). To add some, use **Add bottles**. For a bottle you drank, use **I'm drinking one** (see [04-Cellar-Management.md](./04-Cellar-Management.md)). If the line keeps fewer bottles than it takes slots on the cellar plan, Glou asks **Which slots to free?** and you touch them on a small plan; unplaced bottles leave first, without a question.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The "+" button doesn't appear or is deactivated** | You must first create at least one cellar. Navigate to "Cellars" and add one. |
| **Wrong suggestions (ex: cigars instead of wines)** | Check that the category selected in Step 1 is "Wine" or "Sparkling" and not an unrelated category. |
| **Missing essential fields (appellation, etc.)** | Unfold the optional section with the "Show more" arrow to access the advanced details. |
| **No autocomplete suggestions appear** | Internet connection required. See the troubleshooting section of [08-Autocomplete-Image.md](./08-Autocomplete-Image.md). |
| **"You already have this wine" but it is not the same one** | Choose **It's another wine**: Glou remembers it and will not suggest grouping them again. The comparison uses the category, producer, name and vintage, ignoring case and spaces. |
| **My purchase made a second line instead of joining the first** | A line is completed only if the cellar, price, bottle size and purchase date are identical. Change them to match, or keep both lines. |
| **"Correct the number" will not let me raise it** | Expected: use **Add bottles**. |
| **Add bottles is greyed out without a connection** | Adding needs the network (see [25-Offline-Mode.md](./25-Offline-Mode.md)). |
