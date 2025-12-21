# 🚀 Glou - Quick Start

**Version 1.0** | [Démarrage Rapide (Français)](FR_DEMARRAGE_RAPIDE.md)

Get Glou running in 5 minutes!

---

## ⚡ Before You Start

✅ Docker installed?  
✅ 512 MB of RAM?  
✅ 1 GB of disk space?  

If yes, let's go!

---

## 1. Clone and Start (2 min)

```bash
git clone <repo-url>
cd glou-server
docker-compose up -d
```

That's it! 🎉

---

## 2. Access Glou (1 min)

Open your browser:
```
http://localhost:8080/
```

You should see the home interface.

---

## 3. First Wine (2 min)

1. **Create a cellar**: "My Cellar"
2. **Add a location**: "Shelf 1"
3. **Add a wine**: Type "Bordeaux 2015"
4. **See the result** in the dashboard

---

## 🔔 Configure Alerts (optional)

### Email

1. Go to **Settings > Notifications**
2. Choose **Email**
3. Enter your email
4. Test

### Gotify

1. Go to **Settings > Notifications**
2. Choose **Gotify**
3. Enter your URL and key
4. Test

---

## 📱 On Your Phone

The web interface works on mobile.  
Or install the [native Android app](https://github.com/jackthomasanderson/glou-android).

---

## 🆘 Something's Wrong?

### Port 8080 Already in Use

```bash
# Change the port in docker-compose.yml
ports:
  - "8081:8080"

# Then restart
docker-compose restart
```

### Error "database is locked"

```bash
docker-compose restart
```

### View Logs

```bash
docker-compose logs -f api
```

---

## 📖 Next Steps

- **User** ? Read [User Guide](EN_USER_GUIDE.md)
- **Admin** ? Read [Administration Guide](EN_ADMIN.md)
- **FAQ** ? See [Frequently Asked Questions](FAQ.md)

---

**Cheers! 🍷**
