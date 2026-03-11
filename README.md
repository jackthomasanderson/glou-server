<div align="center">
  <h1>🍷 Glou</h1>
  <p><strong>Simply precious.</strong></p>
  <p>Glou is a high-fidelity asset management ecosystem for luxury collections (wines, bubbles, spirits, and cigars). By combining visual recognition, expert data, and predictive indicators, we help collectors preserve the integrity of their assets and master their peak maturity.</p>
</div>

---

## ✨ Top 5 Highlights
1. 📸 **Zero-Effort Intake (Hybrid System)**: Snap a photo of a label! Our OCR/vision system instantly pre-fills the details so your inventory is effortlessly up to date.
2. 🤝 **Shared Inventory**: Designed for collaboration. All users on the instance share a single common inventory, making it perfect for families, roommates, or wine clubs.
3. 🧠 **Smart Data Engine**: Automatic enrichment via APIs (Vivino, Whiskybase) seamlessly integrated with our proprietary local cache.
4. 💎 **High-Fidelity Immersive UX**: A sleek design system offering instant-feel performance.
5. 🛡️ **Built for Scale & Security**: A robust Docker Compose stack running cleanly and safely.

---

## 🚀 Quick Start
Get your own instance of Glou running in under 2 minutes.

**Prerequisites:**
- Docker & Docker Compose installed.

**Commands:**
```bash
# 1. Copy the example environment file
cp .env.example .env

# 2. Launch the entire stack in detached mode
docker-compose up -d
```

**Access:**
Once the containers are up, simply navigate to [http://localhost:3000](http://localhost:3000) to access the Glou web interface. The API runs quietly on port 3001.

*Note: For advanced configurations, environment variables, and troubleshooting, please refer to our comprehensive [Wiki](./docs/wiki/EN/_wiki.md).*

---

## 🗺️ Roadmap & Next Steps
Glou is constantly evolving. Here is a glimpse of what's currently cooking and what's on the horizon.

### 🏗️ In Progress (WIP)
- 🔒 **Enhanced Security (FEAT-02)**: Introducing 2FA (Two-Factor Authentication) for robust account protection.
- 🎨 **User Profiles & Personalization (FEAT-03)**: Total control over your UI theme (dark/light), accent colors, language (FR/EN), and regional formats without reloading.
- ⚡ **Express Label Scanning (FEAT-04)**: Upgrading our OCR intake flow to handle rapid "session mode" scanning for bulk inventory updates.

### ✅ Recently Implemented
- 🏷️ **Contextual Asset CRUD (FEAT-01)**: Adaptive creation workflows tailored perfectly to wines, bubbles, spirits, or boxes of cigars.
- 🔍 **Advanced Search & Faceted Filtering (FEAT-48)**: Quickly find bottles by name, producer, vintage, category or cellar with real-time suggestions and chip filters.

### 🔮 Next Up
- Predictive analytics for asset valuation.
- Advanced IoT integration for live cellar and humidor monitoring.
- Native mobile companion application.
