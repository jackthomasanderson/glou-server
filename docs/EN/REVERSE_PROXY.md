# Reverse Proxy Configuration

Below are minimal examples for Nginx and Caddy to run Glou behind HTTPS and forward client IP headers. Enable `TRUST_PROXY_HEADERS=true` in Glou only when behind this proxy.

## Nginx
```
server {
    listen 443 ssl;
    server_name glou.example.com;

    ssl_certificate     /etc/letsencrypt/live/glou.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/glou.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Caddy
```
https://glou.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

## Glou Environment
```
ENVIRONMENT=production
TRUST_PROXY_HEADERS=true
PUBLIC_PROTOCOL=https
PUBLIC_DOMAIN=glou.example.com
CORS_ALLOWED_ORIGINS=https://glou.example.com
```
