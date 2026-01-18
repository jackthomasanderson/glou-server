# Glou — Simply Precious

Your private cellar concierge that keeps bottles, bubbles, spirits, and cigars perfectly organized while staying fully in your hands.

---

## ✨ What can it do for you?

- 🍷 **Add and tidy bottles fast** (FEAT-01): Create, edit, trash, or restore any bottle with category-smart fields, optimistic saves, and a gentle undo before anything is gone.
- 💾 **Your collection, always there** (FEAT-55): Every bottle persists in PostgreSQL.
- 👤 **Profile & personalization** (FEAT-03): Dedicated profile with persistent preferences.
- 🔐 **TOTP 2FA** (FEAT-02): Secure sign-ins with codes and backup keys.
- 🏠 **Cellars management** (FEAT-24): Create and manage cellars before adding bottles.
- ⏰ **Apogee alerts** (FEAT-06): Gentle nudges for perfect drinking windows.
- 🥤 **Level tracking** (FEAT-07): Keep track of opened bottles and remaining levels.
- 🧠 **Smart Consumption** (FEAT-08): Intelligent suggestions on what to drink next.
- 👀 **View your way** (FEAT-57): Toggle between grid and list views to browse your collection your style.

---

## 🛠 Get Started in Seconds

1) **Prepare the secret sauce** — create a `.env` at the root:
```env
API_PORT=3001
WEB_PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=glou
DB_USER=glou
DB_PASSWORD=glou
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

2) **Launch the essentials**
```bash
docker compose up -d db
cd api && npm install && npm run dev
cd ../web && npm install && npm run dev -- -p 3000
```

3) **Enjoy** — open your browser at http://localhost:3000

Prefer a single command?
```bash
docker run -d --env-file .env -p 3000:3000 -p 3001:3001 glou:latest
```

---

## 🗺 On the Horizon

- 📸 **Label scan express** (FEAT-04): Snap a label, get a ready-to-save bottle card.
- 🪶 **Source transparency** (FEAT-05): See where every detail comes from.

---

Made with care for collectors who like to keep things precious and simple.
