<div align="center">
  <h1>🍷 Glou</h1>
  <p><strong>Simply precious.</strong></p>
  <p>Glou is a self-hosted asset manager for luxury collections — wines, spirits, bubbles, and cigars. Visual recognition, expert data, and peak maturity indicators in one stack you fully own.</p>
</div>

---

## ✨ Top 5 Highlights
1. 📸 **Zero-Effort Intake**: Snap a label photo. OCR pre-fills the details instantly.
2. 🤝 **Shared Inventory**: Every user on the instance shares one collective cellar — built for families, roommates, and wine clubs.
3. 🧠 **Smart Data Engine**: Auto-enrichment via Vivino and Whiskybase, backed by a local cache.
4. 🔔 **Peak Maturity Alerts**: Get notified when a bottle enters its drinking window before it's too late.
5. 🛡️ **Fully Self-Hosted**: A Docker Compose stack (Node.js · Next.js · PostgreSQL) you run on your own machine.

---

## 🚀 Quick Start

**Prerequisites:**
- Docker installed and running.

**Step 1 — Configure**
```bash
cp .env.example .env
```
Open `.env` and set a strong `JWT_SECRET`.

> [!CAUTION]
> `JWT_SECRET` has no safe default. Running with the placeholder value makes all user sessions trivially forgeable. Generate one with: `openssl rand -hex 32`

**Step 2 — Launch**
```bash
docker compose up -d
```
Docker pulls the pre-built images and starts the stack. No compilation required.

**Step 3 — Create your account**

Open [http://localhost:3000](http://localhost:3000) and click **Register**. The first account you create is automatically granted admin privileges.

> [!TIP]
> To update to a new version: `docker compose pull && docker compose up -d`

*For advanced configuration, environment variables, and troubleshooting, see the [Wiki](./docs/wiki/EN/_wiki.md).*

---

## 🗺️ Roadmap & Next Steps

### 🏗️ In Progress (WIP)
- 🌡️ **Humidity/Temperature Monitoring & Drift Alerts (FEAT-15)**: IoT sensor integration for live cellar conditions.

### ✅ Recently Implemented
- 📸 **Express Label Scanning (FEAT-04)**: Snap a label and a self-hosted vision model (Ollama running `moondream`, no cloud, CPU-only) pre-fills name, producer, category, and vintage in seconds — review and confirm in three taps, chain scans for a whole case without leaving the camera view. Recognition quality depends on photo sharpness and lighting; it's a lightweight local model, not a wine-specific service, so always double-check before saving.
- 🍽️ **Guided Food Pairing (FEAT-09)**: Type a dish and get a ranked shortlist of bottles from your own cellar, with a one-click "drink it now" that logs the tasting and updates stock.
- 📅 **Smart Consumption Plan & Stock Rotation (FEAT-08)**: A personal "drink now / drink soon" list built from peak windows, opened bottles, and rotation priority — plus a monthly goal you can track as you go.
- 🧮 **Assisted Physical Inventory & Reconciliation (FEAT-12)**: Run a guided stock count by cellar or custom zone, pause and resume anytime, and clear every discrepancy (missing, unexpected, misplaced) with one-click corrections at the end.
- 🎁 **Wishlist & Budget Tracking (FEAT-20)**: Plan future purchases with a price cap, log observed prices to catch good deals, and track a personal spending envelope by period — convert a wish straight into inventory once it's bought.
- 📴 **Trusted Offline Mode (FEAT-16/23)**: Browse your inventory and edit items you've already loaded even without a connection — changes queue locally and sync automatically once you're back online, with a clear conflict-resolution screen if the same item changed elsewhere meanwhile. Creating or deleting items still requires a connection.
- 🧹 **Automatic Data Retention & Maintenance (FEAT-39)**: Set how long audit logs, sessions, and unused invitations are kept, and let Glou clean them up every night on its own — or trigger a cleanup on demand and see exactly what ran.
- 🌐 **Public URL & Network Access Configuration (FEAT-54)**: Tell Glou how it's reached from the outside (direct or behind a reverse proxy) so every generated link and share stays correct, with a one-click consistency check.
- 🧭 **Guided Onboarding Wizard (FEAT-56)**: A step-by-step walkthrough on first login — create your first cellar and load your first bottles by label scan, CSV import, or manual entry, no setup guesswork required.
- 🔎 **Source Transparency & Change History (FEAT-05)**: See exactly where every field on an item came from and roll it back to any earlier value in one click — your manual edits always win over automatic suggestions.
- 💾 **Scheduled Backups & Data Portability (FEAT-18)**: Automatic nightly database backups you can restore in one click, plus full or category-filtered exports of your entire collection whenever you want.
- 🗺️ **World Map with Geolocation (FEAT-40)**: Explore your entire collection on an interactive world map grouped by country and region, with a category filter to focus on wines, spirits, or cigars.
- 🔥 **Heatmap by Asset Type (FEAT-41)**: Switch the world map to a heatmap that reveals which regions dominate your collection for a chosen type — wine, whisky, cigars, and more.
- 🧮 **Advanced Map Filters & Asset List (FEAT-42)**: Narrow the world map by price, vintage, rating, or opened state, then click straight from the filtered list into any item's detail card.
- 🔐 **Session & Trusted Device Management (FEAT-25)**: See every device logged into your account, disconnect any of them remotely, and skip repeated 2FA prompts on devices you trust.
- 🚨 **Security Notifications (FEAT-29)**: Get alerted instantly by email or in-app when a new device logs in, your password changes, or 2FA is toggled — with a direct link to your security settings.
- 🔒 **Quick Lock & Auto-Lock (FEAT-30)**: Lock the app in one click or let it lock itself after inactivity, then unlock with your password or a short PIN — no need to log back in.
- ✍️ **Guest Sharing with Write Access (FEAT-37)**: Let friends log tastings and update fill levels on specific cellars you share with them, without giving them a full account.
- 📸 **Graphical Item Visualization (FEAT-69)**: Auto image search as soon as name and producer are filled (DuckDuckGo, local storage). Photo displayed at the top of inventory cards and in the detail view, Vivino-style. Replace via manual search, URL paste, or file upload.
- 🗺️ **Visual Cellar Map (FEAT-68)**: Grid-based occupancy view of cellar slots, drag & drop bottle placement, color-coded by product category.
- ✨ **Smart Autocomplete (FEAT-66)**: Google-powered suggestions for name and producer when adding a bottle — vintage auto-extracted from suggestions.
- 🔍 **Global Search (FEAT-64)**: Instant navbar search across your entire inventory by name, producer, vintage, or category.
- 🔗 **Duplicate Detection (FEAT-65)**: Automatic duplicate warning before saving a bottle that already exists in your cellar.
- 📡 **Connectivity Indicator (FEAT-67)**: Live internet status in the navbar — external features (autocomplete, images) degrade gracefully when offline.
- 👥 **Member Roles & Access Control (FEAT-61)**: Admins can activate/deactivate user accounts with immediate effect (live JWT invalidation) and browse a paginated audit log.
- 🔔 **Peak Maturity Alerts (FEAT-06)**: Automated alerts when a bottle enters its optimal drinking window.
- 🎨 **User Profiles & Personalization (FEAT-03)**: Theme, accent color, language (FR/EN), and date format — applied instantly.
- 🏷️ **Contextual Asset CRUD (FEAT-01)**: Adaptive creation workflows for wines, bubbles, spirits, and cigars.
- 🔍 **Advanced Search & Faceted Filtering (FEAT-48)**: Find any bottle by name, producer, vintage, category, or cellar in real time.
- 📦 **Bulk Actions & Presets (FEAT-11)**: Update your collection in bulk and save action presets to automate routine tasks.

### 🔮 Next Up
- Predictive analytics for collection valuation.
- Advanced IoT integration for live cellar temperature and humidity monitoring.
- Native mobile companion application.
