# Glou — Simply Precious

> Transform the way you cherish your collection. Glou makes managing your finest wines, spirits, and treasures effortless, beautiful, and smart.

## 🎯 What is Glou?

Glou is your personal **digital sommelier and collection curator** for luxury assets—wines, champagnes, spirits, and cigars. It turns tedious inventory management into an elegant, intelligent experience.

Whether you're a casual collector or a serious enthusiast, Glou helps you:
- **Never miss an apogee** – Smart alerts tell you when to drink, so nothing goes to waste
- **Know your collection** – Gorgeous visual inventory with instant insights at your fingertips
- **Decide what to drink** – Intelligent suggestions based on what's optimal, what's open, and what you feel like
- **Stay organized** – Simple, intuitive tracking of your entire collection across any number of cellars

Glou is built for home use and keeps your data yours—no endless cloud subscriptions, no corporate tracking.

---

## ✨ Key Features

| Feature | What It Does |
|---------|------------|
| **📸 Scan & Add Express** | Photograph a label, and Glou auto-fills your bottle details. No tedious typing. |
| **🔐 Secure Access** | Two-factor authentication (2FA) and session management keep your collection safe. |
| **👥 Multi-User Profiles** | Admin and guest roles, plus full personalization (theme, language, notifications). |
| **⏰ Smart Apogee Alerts** | Never miss a window. Intelligent notifications before, during, and after peak drinking dates. |
| **🍷 Open Bottle Tracking** | Mark bottles as open, track remaining level, and get reminders before they degrade. |

---

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** installed on your system
- A `.env` file with your configuration (see below)

### Installation & Launch

#### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd glou-server
```

#### 2. Configure Your `.env` File
Create a `.env` file in the root directory with the following variables:

```env
# Database
POSTGRES_DB=glou
POSTGRES_USER=glou_user
POSTGRES_PASSWORD=your_secure_password_here
DATABASE_URL=postgresql://glou_user:your_secure_password_here@db:5432/glou

# API Server
API_PORT=3001
NODE_ENV=development

# Frontend
WEB_PORT=3000

# Authentication
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRY=7d

# Optional: For OCR/Vision or API enrichment
VIVINO_API_KEY=your_optional_key
```

#### 3. Start with Docker Compose
```bash
docker-compose up -d
```

Your application is now running:
- **Web UI:** http://localhost:3000
- **API:** http://localhost:3001

#### 4. First Login
- Create your admin account on the registration page
- Enable 2FA for security
- Start adding your collection!

---

## 📚 Using Glou

### Add Your First Bottle
1. Go to **Dashboard** → **Add Bottle**
2. Either:
   - **Scan a label** (FEAT-04): Take a photo of the label for instant recognition
   - **Manual entry**: Fill in the details for your bottle
3. Choose the category (Wine, Champagne, Spirit, Cigar) to get relevant fields
4. Save — it appears in your inventory immediately (Optimistic UI)

### Manage Your Collection
- **View all bottles**: See your entire collection with filtering and sorting
- **Edit details**: Update any information anytime
- **Track opened bottles**: Mark as open and set remaining level for consumption planning

### Set Up Smart Alerts
- **Apogee alerts** (FEAT-06): Get notified before peak drinking dates
- **Open bottle reminders** (FEAT-07): Know when to drink or reseal
- **Customize by collection**: Adjust alert frequency and channels (in-app, email)

### Plan Your Consumption
- **Drinking suggestions** (FEAT-08): AI-powered list of what to drink now based on apogee and openness
- **Set consumption goals**: Target a number of bottles per month
- **Weekly plan**: Auto-generated suggestions you can tweak anytime

---

## 🛠️ Development

### Run Locally (Without Docker)

#### Prerequisites
- Node.js 18+ and npm
- PostgreSQL running locally

#### Backend
```bash
cd api
npm install
npm run dev
```
Server runs on http://localhost:3001

#### Frontend
```bash
cd web
npm install
npm run dev -- -p 3000
```
UI runs on http://localhost:3000

### Build for Production
```bash
docker-compose -f docker-compose.yml build
```

---

## 🗺️ Roadmap

Coming soon to Glou:

| Feature | What's Next |
|---------|-----------|
| **Scan & OCR** (FEAT-04) | Automatic label recognition for instant bottle lookup |
| **Smart Apogee** (FEAT-06) | Predictive windows for optimal drinking dates |
| **Open Bottle Tracking** (FEAT-07) | Precisely track open bottles and consumption reminders |
| **Drinking Plan** (FEAT-08) | Intelligent suggestions on what to drink and when |
| **Import & Bulk Add** (FEAT-09) | Upload Excel/CSV to quickly populate your cave |

---

## 🔐 Security & Privacy

- **Your data, your server**: Glou runs on your own hardware. No tracking, no cloud lock-in.
- **Two-factor authentication**: Protect your collection with 2FA (TOTP or WebAuthn)
- **Non-root execution**: Container runs with reduced privileges (PUID/PGID)
- **Environment-based config**: All secrets and ports stored in `.env`, never in code

---

## 🌍 Internationalization

Glou supports:
- **English (EN)** – Full UI and notifications
- **French (FR)** – Interface complète et notifications

Set your language in **Profile → Preferences** or your `.env` configuration.

---

## 📖 Documentation

- **[Feature Specifications](./.vibe/features)**: Detailed design docs for each feature
- **[Vision & Design](./.vibe/vision.md)**: Project philosophy and roadmap

---

## 💬 Support & Feedback

This is a passion project for home use. If you find bugs or have ideas:
1. Check the [Roadmap](#-roadmap) above
2. Review [known features in development](./.vibe/features/wip/)
3. Open an issue with details and screenshots

---

## 📄 License

MIT License — Glou is built with ❤️ for collectors who respect their collections.

---

**Simply precious. Intelligently managed.**
