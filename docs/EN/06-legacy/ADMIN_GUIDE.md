# Admin Panel Guide

## Overview

The Admin Panel is your command center for configuring Glou. It's organized into 7 main sections, each handling different aspects of your installation.

**Access:** http://localhost:8080/admin

---

## 1. Dashboard 📊

Quick overview of your Glou instance:
- **Total Wines** - Count of all wines in inventory
- **Cellars** - Number of wine storage areas
- **Active Alerts** - Wines ready to drink or past apogee
- **System Status** - Overall health

---

## 2. Branding 🎨

Customize the appearance and identity of your Glou instance.

### Application Title
The name displayed in the header and browser tab.
- Example: "My Wine Cellar" or "Château Margaux Collection"

### Slogan
Short tagline displayed below the title.
- Example: "Winery Management for Wine Enthusiasts"

### Support Email
Contact email for user support inquiries.

### Logo
Upload your custom logo (JPG, PNG).
- Recommended size: 200x50px
- Supports transparent PNG
- Click "Upload Logo" to select from computer

### Favicon
The small icon displayed in browser tab.
- Recommended size: 32x32px or 64x64px

---

## 3. Appearance 🎭

Control the visual design of your interface.

### Color Scheme
**Primary Color:** Main UI elements, buttons, links  
**Secondary Color:** Secondary elements, backgrounds  
**Accent Color:** Highlights, success messages, alerts

Pro tip: Use a web-based color palette generator like Coolors.co

### Dark Mode
Toggle dark mode as the default for all new users.

### Date Format
Choose how dates appear throughout the app:
- `YYYY-MM-DD` - ISO 8601 (recommended for international use)
- `DD/MM/YYYY` - European format
- `MM/DD/YYYY` - American format

### Rows Per Page
How many wine entries display per page in lists.
- Recommended: 10-25
- Higher values = less scrolling but slower loading

---

## 4. Network & Reverse Proxy 🌐

Configure domain and reverse proxy settings.

### Public Domain
The domain users will access your Glou instance from.
- Example: `glou.example.com`
- Leave empty for IP-based access

### Public Protocol
- **HTTP** - For development/local use
- **HTTPS** - For production (recommended)

### Behind Reverse Proxy?
Enable if Glou runs behind Nginx, Apache, Traefik, or HAProxy.

**When enabled:**
- Glou trusts headers from your proxy
- Important for correct IP addresses in logs

### Trust X-* Headers
When enabled, Glou respects these headers from your proxy:
- `X-Forwarded-For` - Client IP
- `X-Forwarded-Proto` - Original protocol (http/https)
- `X-Forwarded-Host` - Original hostname

**Only enable if you trust your proxy!**

### Common Proxy Configurations

**Nginx:**
```nginx
location /glou {
    proxy_pass http://localhost:8080;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
}
```

**Apache:**
```apache
<VirtualHost *:443>
    ProxyPass / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/
    ProxyPreserveHost On
</VirtualHost>
```

**Docker Compose with Traefik:**
```yaml
services:
  glou:
    labels:
      - "traefik.http.routers.glou.rule=Host(`glou.example.com`)"
      - "traefik.http.routers.glou.entrypoints=websecure"
      - "traefik.http.services.glou.loadbalancer.server.port=8080"
```

---

## 5. Features ⚙️

Enable/disable functionality.

### Enable Notifications
Turn on/off Gotify and SMTP alerts.
- Notifications still require configuration in `.env`

### Maintenance Mode
Display maintenance page instead of the app.
- Useful during updates or backups
- Users see a "Service Unavailable" message

### Allow Registration
Future feature: allow new users to self-register.

### Require Admin Approval
If registration enabled, require approval for new accounts.

---

## 6. Advanced 🔧

Low-level configuration for power users.

### Session Timeout
How long before inactive sessions expire (in minutes).
- Default: 1440 (24 hours)
- Minimum: 5 minutes
- Maximum: 7 days (10,080 minutes)

### Max Request Body Size
Limit file upload size (in bytes).
- Default: 1,048,576 (1 MB)
- Increase for larger logo/image uploads

### Default Language
Language shown to new users.
- English or Français

---

## 7. Users 👥

User management (Phase 2 feature).
- Currently running single-user mode
- Multi-user support with JWT auth coming soon

---

## Best Practices

### 🔒 Security
1. Change default theme colors to something unique
2. Upload your organization's logo
3. Set a custom support email
4. If using reverse proxy: **always** verify X-* headers are from a trusted source
5. Use HTTPS in production

### 🎨 Branding
1. Use high-contrast colors for accessibility
2. Logo should work in both light and dark modes
3. Keep title short (< 20 characters)
4. Use consistent branding across your organization

### ⚙️ Performance
1. Set `Rows Per Page` to 10-15 for optimal performance
2. Use HTTP/2 if possible
3. Enable caching on your reverse proxy
4. Monitor session timeout to balance security vs. user experience

### 🌐 Networking
1. Always use HTTPS in production
2. If behind a proxy, verify proxy headers are trusted
3. Test connectivity after changing domain settings
4. Update firewall rules if needed

---

## Troubleshooting

### Settings not saving?
- Check browser console for errors (F12)
- Verify server is running
- Check permissions on database file

### Reverse proxy showing errors?
- Verify proxy headers configuration
- Check reverse proxy logs
- Ensure domain/protocol match proxy settings

### Colors not applying?
- Try a different browser (cache issue)
- Use `Ctrl+Shift+R` to hard refresh
- Check if dark mode is forcing different colors

### Logo not showing?
- Verify file is JPG or PNG
- Check image size (< 2MB recommended)
- Ensure path is correct if using external URL

---

## Environment Variables

Most admin settings are configurable via `.env` on startup:

```bash
# Startup defaults (overridden by admin settings)
APP_TITLE=Glou
PUBLIC_DOMAIN=localhost
LANGUAGE=en
DARK_MODE_DEFAULT=false
THEME_COLOR=#007bff
```

Admin panel values override these defaults.

---

## API Endpoints

Admin operations use these REST endpoints:

```bash
# Get current settings
GET /api/admin/settings

# Update settings
PUT /api/admin/settings
Content-Type: application/json
{ "app_title": "New Title", ... }

# Upload logo
POST /api/admin/upload-logo
Content-Type: multipart/form-data
file: [binary]

# Get statistics
GET /api/admin/stats

# Get users list
GET /api/admin/users
```

---

## Coming Soon

- **Phase 2:** Multi-user management with JWT
- **Phase 3:** Database backups and restore
- **Phase 4:** Usage analytics and audit logs
- **Phase 5:** Custom CSS injection
