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
- 🔒 **Two-Factor Authentication (FEAT-02)**: TOTP-based 2FA for account protection.
- ⚡ **Express Label Scanning (FEAT-04)**: Session mode for scanning dozens of bottles in one go.

### ✅ Recently Implemented
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
