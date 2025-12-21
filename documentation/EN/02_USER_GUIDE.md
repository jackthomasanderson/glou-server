# 🍷 Glou - User Guide

**Version 1.0** | [Version française](FR_GUIDE_UTILISATEUR.md)

Welcome to Glou! This guide will help you manage your wine collection effortlessly.

---

## 📖 Table of Contents

1. [Installation](#installation)
2. [Getting Started](#getting-started)
3. [Main Features](#main-features)
4. [Managing Your Cellar](#managing-your-cellar)
5. [Wine Tracking](#wine-tracking)
6. [Alerts and Notifications](#alerts-and-notifications)
7. [FAQ](#faq)

---

## Installation

### Requirements
- A computer with Docker installed (recommended) or Go 1.19+
- Internet connection for the first visit

### Option 1: Docker (Recommended)

```bash
docker-compose up -d
```

Then open your browser: **http://localhost:8080/**

### Option 2: Without Docker

```bash
go build -o api ./cmd/api
./api
```

Then open: **http://localhost:8080/**

### Verification
If you see the login screen, everything works! 🎉

---

## Getting Started

### Step 1: Create Your First Cellar
1. Go to the administration interface
2. Click **"New Cellar"**
3. Enter a name (e.g., "Dining Room", "Wine Fridge")
4. Confirm

### Step 2: Add Storage Locations
1. Click on your cellar
2. Click **"Add Location"**
3. Number your shelves and positions (e.g., Shelf 1, Position 1)
4. Confirm

### Step 3: Add Your First Wine
1. Click **"Add Wine"**
2. Scan the barcode or enter the wine name
3. Fill in the information:
   - **Vintage**: The year of the wine
   - **Region**: Where the wine comes from
   - **Location**: Where you stored it
4. Let the system automatically enrich the data
5. Confirm

### Step 4: Set Up Your Alerts
1. Go to **Settings > Notifications**
2. Choose your channel: Email or Gotify
3. Enter your details
4. Confirm

---

## Main Features

### 🍾 Wine Inventory

Each wine is tracked with:
- **Name** of the wine
- **Vintage** (year)
- **Region** and producer
- **Location** in the cellar
- **Peak date** (when to drink it)
- **Quantity** of bottles

### 📅 Peak Tracking

The peak (apogee) is when a wine is at its best. Glou helps you:
- **Calculate** the peak automatically based on wine type
- **Visualize** the drinking window (minimum and maximum dates)
- **Plan** when to drink each wine

**Example:**
- 2015 Bordeaux Red Wine
- Minimum peak: 2025 (after 10 years)
- Maximum peak: 2035 (before 20 years)
- Drink between 2025 and 2035

### 🔔 Smart Alerts

You receive notifications for:
- **6 months before** minimum peak (heads up)
- **At minimum peak** (drink now!)
- **After maximum peak** (time's up!)

### 🌍 Automatic Enrichment

When you add a wine:
1. Scan the barcode (or search by name)
2. Glou searches its databases for information
3. Wine details are automatically filled in
4. You confirm or correct if needed

### 📔 Tasting Journal

Record every bottle you drink:
- **Date** of tasting
- **Rating** from 0 to 5 stars
- **Comments** on taste, aroma, texture
- **Context** (occasion, with whom, etc.)

### 📊 Dashboard

Your overview:
- **Total number** of bottles in cellar
- **Capacity** used in %
- **Next wines** to drink
- **Wines** in peak period
- **Statistics** by region, type, etc.

### 🌙 Dark Mode

Enable dark mode for comfortable reading at night. The setting is saved automatically.

### 🇬🇧 Fully in English

The interface displays in English. All labels, buttons, and messages are in English.

---

## Managing Your Cellar

### View Your Cellar
1. Go to **"My Cellar"**
2. You see all locations with wines stored
3. Click on a wine to see its details

### Edit a Wine
1. Click on the wine
2. Click **"Edit"**
3. Change the information
4. Confirm

### Delete a Wine
1. Click on the wine
2. Click **"Delete"**
3. Confirm

### Move a Wine
1. Click on the wine
2. Change the location
3. Confirm

---

## Wine Tracking

### Record a Tasting
1. Go to **"My Tastings"**
2. Click **"New Tasting"**
3. Select the wine you drank
4. Enter:
   - The date
   - Your rating (0-5 stars)
   - Your observations
5. Confirm

### View History
1. Click on a wine
2. Go to the **"History"** tab
3. You see all tastings of this wine

### Export Your Data
1. Go to **"Settings"**
2. Click **"Export My Data"**
3. A CSV file is downloaded with your inventory

---

## Alerts and Notifications

### Configure Email

1. **Settings > Notifications**
2. Choose **"Email"**
3. Enter your email address
4. Test the send
5. Confirm

Emails will be sent from your server.

### Configure Gotify

1. **Settings > Notifications**
2. Choose **"Gotify"**
3. Enter your Gotify server URL
4. Enter your Gotify application key
5. Test the send
6. Confirm

### Manage Frequencies

1. **Settings > Notifications**
2. Define:
   - **Days before**: how many days before peak you get an alert
   - **Frequency**: daily, weekly, monthly

---

## FAQ

### Q: What if a wine is not found during enrichment?
**A:** This is normal for small producers. You can fill in the information manually. If you know the wine details, enter them yourself.

### Q: How do I access Glou from my phone?
**A:** The web interface works on all mobile browsers. There's also a **native Android app** (link in the README).

### Q: How do I know the peak of a wine if it's unknown?
**A:** Glou tries to calculate it automatically based on type and vintage. You can also consult a wine guide or ask the wine merchant.

### Q: Can I have multiple cellars?
**A:** Yes! Create as many cellars as you want (one at home, one on vacation, etc.). Each cellar is independent.

### Q: Where are my data stored?
**A:** All your data stays on your server. Glou doesn't send anything online. Only enrichment requests leave the server.

### Q: How do I back up my data?
**A:** Use the **"Export My Data"** function to get a CSV file. Keep it safe.

### Q: What if I forget to set up alerts?
**A:** You can do it later. Go to **Settings > Notifications** anytime.

### Q: How does the system calculate the peak?
**A:** The peak is based on wine type and vintage. For example:
- Premium red wines: 10-25 years
- Regular red wines: 3-8 years
- White wines: 2-5 years
- Rosé wines: 1-2 years
- Champagne: 5-15 years

### Q: Can I edit the notifications I receive?
**A:** Yes, go to **Settings > Notifications** to adjust frequency and channels.

---

## Support

Need help?
- 📖 Check the [complete FAQ](.docs/FAQ.md)
- 🔧 Go to **Settings > About** to see your version
- 💬 Contact your server administrator

---

## Best Practices for Using Glou

### 💡 Good Practices

1. **Update your inventory regularly**
2. **Record your tastings** to build a history
3. **Check your alerts** regularly
4. **Test notifications** after configuration
5. **Export your data** regularly

### 🎯 Common Use Cases

**I just received a wine shipment**
→ Add them in batch and set the peak dates

**I'm getting too many alerts**
→ Reduce the frequency in Settings

**I want to share my cellar with a friend**
→ Give them access to the server (URL + credentials)

**I drank a bottle**
→ Record it in "My Tastings"

---

**Cheers! 🍇🍷**

For advanced users, see [Administration Guide](EN_ADMIN.md).
