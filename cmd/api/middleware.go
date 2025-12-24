package main

import (
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// RateLimiter implémente un rate limiter par IP
type RateLimiter struct {
	config      *Config
	mu          sync.RWMutex
	ips         map[string]*ipLimit
	lastCleanup time.Time
}

type ipLimit struct {
	count      int
	resetTime  time.Time
	lastAccess time.Time
}

// NewRateLimiter crée un nouveau rate limiter
func NewRateLimiter(config *Config) *RateLimiter {
	return &RateLimiter{
		config: config,
		ips:    make(map[string]*ipLimit),
	}
}

// Allow vérifie si une requête est autorisée
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	// Periodic cleanup of stale entries
	if rl.lastCleanup.IsZero() || now.Sub(rl.lastCleanup) > rl.config.RateLimitWindow {
		for k, v := range rl.ips {
			if now.After(v.resetTime) && now.Sub(v.lastAccess) > rl.config.RateLimitWindow {
				delete(rl.ips, k)
			}
		}
		rl.lastCleanup = now
	}
	limit, exists := rl.ips[ip]

	if !exists || now.After(limit.resetTime) {
		// Nouvelle fenêtre
		rl.ips[ip] = &ipLimit{
			count:      1,
			resetTime:  now.Add(rl.config.RateLimitWindow),
			lastAccess: now,
		}
		return true
	}

	if limit.count < rl.config.RateLimitRequests {
		limit.count++
		limit.lastAccess = now
		return true
	}

	return false
}

// rateLimitMiddleware applique le rate limiting
func (s *Server) rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := s.getClientIP(r)

		if !s.limiter.Allow(ip) {
			log.Printf("[SECURITY] Rate limit exceeded for IP: %s", ip)
			s.respondError(w, http.StatusTooManyRequests, "Rate limit exceeded", nil)
			return
		}

		next(w, r)
	}
}

// corsMiddleware sécurisé
func (s *Server) secureCorMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Vérifier l'origine
		if origin != "" && s.config.IsOriginAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "3600")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		} else if origin != "" {
			log.Printf("[SECURITY] Rejected CORS request from unauthorized origin: %s", origin)
		}

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// securityHeadersMiddleware ajoute les headers de sécurité
func (s *Server) securityHeadersMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Prevent clickjacking
		w.Header().Set("X-Frame-Options", "DENY")

		// Prevent MIME type sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// XSS Protection
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Referrer Policy
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Content Security Policy (strict)
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")

		// Permissions Policy
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		next(w, r)
	}
}

// bodyLimitMiddleware limite la taille du corps de la requête
func (s *Server) bodyLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		maxBody := s.config.MaxRequestBodySize

		// Allow slightly larger body for logo uploads (5MB payload + form overhead)
		const uploadLogoMax = int64(6 * 1024 * 1024) // ~6MB cap for multipart envelope
		if r.URL.Path == "/api/admin/upload-logo" && maxBody < uploadLogoMax {
			maxBody = uploadLogoMax
		}

		// Quick reject when Content-Length is provided and already exceeds the limit
		if r.ContentLength > maxBody && r.ContentLength != -1 {
			log.Printf("[SECURITY] Request body too large (%d > %d) from IP: %s", r.ContentLength, maxBody, s.getClientIP(r))
			s.respondError(w, http.StatusRequestEntityTooLarge, "Request body too large", nil)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxBody)

		// Defer multipart parsing to handlers that set their own limits (e.g., logo upload)
		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			next(w, r)
			return
		}

		if err := r.ParseForm(); err != nil {
			log.Printf("[SECURITY] Request body too large from IP: %s", s.getClientIP(r))
			s.respondError(w, http.StatusRequestEntityTooLarge, "Request body too large", err)
			return
		}

		next(w, r)
	}
}

// loggingMiddleware logue les requêtes
func (s *Server) loggingMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ip := s.getClientIP(r)

		// Log la requête
		if s.config.LogLevel == "debug" {
			log.Printf("[%s] %s %s %s", ip, r.Method, r.RequestURI, r.UserAgent())
		}

		next(w, r)

		// Log la réponse
		duration := time.Since(start)
		log.Printf("[%s] %s %s completed in %v", ip, r.Method, r.RequestURI, duration)
	}
}

// getClientIP extrait l'adresse IP du client avec prise en compte du proxy si autorisé
func (s *Server) getClientIP(r *http.Request) string {
	if s.config.TrustProxyHeaders {
		// X-Forwarded-For (si derrière un proxy)
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			return xff
		}

		// X-Real-IP
		if xri := r.Header.Get("X-Real-IP"); xri != "" {
			return xri
		}
	}

	// RemoteAddr
	return r.RemoteAddr
}

// setupCheckMiddleware vérifie si le setup initial est complété
// et redirige vers /setup si nécessaire
func (s *Server) setupCheckMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Ignorer les routes de setup et assets
		path := r.URL.Path
		if path == "/setup" || path == "/api/setup/check" || path == "/api/setup/complete" {
			next(w, r)
			return
		}

		// Vérifier si le setup est complété
		isComplete, err := s.store.IsSetupComplete(r.Context())
		if err != nil {
			log.Printf("Error checking setup status: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		if !isComplete {
			// Rediriger vers le wizard
			http.Redirect(w, r, "/setup", http.StatusSeeOther)
			return
		}

		next(w, r)
	}
}

// csrfMiddleware vérifie le token CSRF pour les requêtes mutantes
func (s *Server) csrfMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Méthodes sûres ignorées
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next(w, r)
			return
		}

		// Exempter les endpoints d'authentification publique pour permettre la connexion/inscription
		if strings.HasPrefix(r.URL.Path, "/api/auth/") {
			next(w, r)
			return
		}

		// Récupérer token header et cookie
		headerToken := r.Header.Get("X-CSRF-Token")
		csrfCookie, err := r.Cookie("glou_csrf")
		if err != nil || csrfCookie.Value == "" || headerToken == "" || headerToken != csrfCookie.Value {
			s.respondError(w, http.StatusForbidden, "CSRF token missing or invalid", nil)
			return
		}

		next(w, r)
	}
}
