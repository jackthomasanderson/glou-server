# Notifications Configuration

Glou supports multiple notification channels to alert you when wines reach their apogee or other important events occur.

## Supported Channels

### 1. Gotify

Gotify is a lightweight push notification service. Perfect for self-hosted environments.

**Setup:**

1. **Install Gotify:**
   ```bash
   # Docker (recommended)
   docker run -d -p 80:80 -e GOTIFY_PAGESIZE=200 \
     -v /opt/gotify/data:/data \
     gotify/server
   ```

2. **Configure in Glou:**
   ```bash
   GOTIFY_URL=http://localhost:80
   GOTIFY_TOKEN=your_app_token_here
   ```

3. **Get your token:**
   - Go to http://localhost:80
   - Create an app called "Glou"
   - Copy the token

**Advantages:**
- ✅ Self-hosted, no external dependencies
- ✅ Web dashboard to see notifications
- ✅ Simple REST API
- ✅ Mobile app available

---

### 2. SMTP Email

Send notifications directly to your email via SMTP.

**Setup:**

**Option A: Gmail**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your.email@gmail.com
SMTP_PASSWORD=your_app_password  # Use App Password, not account password
SMTP_FROM=glou@example.com
SMTP_TO=recipient@example.com
SMTP_USE_TLS=true
```

Get your app password:
1. Go to https://myaccount.google.com/apppasswords
2. Create app password for "Mail" on "Windows Computer"
3. Use the generated 16-character password

**Option B: Self-hosted (e.g., Postfix)**
```bash
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USERNAME=user@example.com
SMTP_PASSWORD=password
SMTP_FROM=glou@example.com
SMTP_TO=admin@example.com
SMTP_USE_TLS=true
```

**Option C: Mailgun, SendGrid, etc.**
```bash
# Use their SMTP server details
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USERNAME=postmaster@mg.example.com
SMTP_PASSWORD=your_password
SMTP_FROM=noreply@example.com
SMTP_TO=admin@example.com
SMTP_USE_TLS=true
```

**Advantages:**
- ✅ Universal - works everywhere
- ✅ Familiar format - email is ubiquitous
- ✅ No extra infrastructure needed
- ✅ Works with any mail provider

---

## Enable Both Channels

```bash
# Both Gotify and SMTP enabled
GOTIFY_URL=http://localhost:80
GOTIFY_TOKEN=abc123
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=user@gmail.com
SMTP_PASSWORD=password
SMTP_FROM=glou@example.com
SMTP_TO=admin@example.com
```

Notifications will be sent to **both** channels when an alert triggers.

---

## Disable Notifications

Simply leave both empty:
```bash
GOTIFY_URL=
GOTIFY_TOKEN=
SMTP_HOST=
```

---

## Alert Types

Notifications are sent for:
- 📅 **Apogee Ready** - Wine is ready to drink (within apogee window)
- 📅 **Apogee Passed** - Wine has passed its best drinking date
- 📦 **Low Stock** - Cellar is running out of space

---

## Testing Notifications

Test your configuration:

```bash
# Test Gotify (curl)
curl -X POST "http://localhost:80/message?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "message": "Test from Glou",
    "priority": 5
  }'

# Test SMTP
# Send a test email via your SMTP provider
# (Check logs to verify configuration)
```

---

## Troubleshooting

### Gotify not working
- ✅ Check URL is reachable: `curl http://localhost:80`
- ✅ Verify token is correct
- ✅ Check firewall allows connection
- ✅ Look at Gotify server logs

### SMTP not working
- ✅ Verify host/port is correct
- ✅ Check credentials in test email client first
- ✅ Enable "Less secure apps" for Gmail (if applicable)
- ✅ Ensure TLS/SSL settings match
- ✅ Check firewall allows SMTP (port 587)

### Notifications not triggering
- ✅ Check alert thresholds in database
- ✅ Verify notification config is loaded: check server logs
- ✅ Test manually with curl or email client
- ✅ Ensure wine has valid apogee dates set

---

## API Integration

To send custom notifications programmatically:

```go
// Example in Go
notification := &notifier.Notification{
    Title:   "Wine Alert",
    Message: "Your 2015 Bordeaux is ready to drink!",
    WineID:  42,
    Type:    "apogee_ready",
}

err := notifierManager.SendAll(ctx, notification)
```

---

## Docker Compose Example

```yaml
version: '3.8'

services:
  glou-server:
    image: glou:latest
    ports:
      - "8080:8080"
    environment:
      - GOTIFY_URL=http://gotify:80
      - GOTIFY_TOKEN=ABC123
      - SMTP_HOST=mail
      - SMTP_PORT=25
      - SMTP_FROM=glou@glou
      - SMTP_TO=admin@example.com
    depends_on:
      - gotify

  gotify:
    image: gotify/server
    ports:
      - "80:80"
    volumes:
      - gotify_data:/data

volumes:
  gotify_data:
```

---

## Privacy & Security

- 🔒 Notifications are sent only to configured endpoints
- 🔒 No data is sent to external services unless you configure them
- 🔒 Email passwords should use app-specific passwords (not main account)
- 🔒 Use HTTPS URLs for production Gotify instances
