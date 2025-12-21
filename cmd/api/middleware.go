package main

import (
	"log"
	"net/http"
	"sync"
	"time"
)

// RateLimiter implémente un rate limiter par IP
type RateLimiter struct {
	config *Config
	mu     sync.RWMutex
	ips    map[string]*ipLimit
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
		ip := getClientIP(r)

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

		// Permissions Policy
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		next(w, r)
	}
}

// bodyLimitMiddleware limite la taille du corps de la requête
func (s *Server) bodyLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, s.config.MaxRequestBodySize)

		if err := r.ParseForm(); err != nil {
			log.Printf("[SECURITY] Request body too large from IP: %s", getClientIP(r))
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
		ip := getClientIP(r)

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

// getClientIP extrait l'adresse IP du client
func getClientIP(r *http.Request) string {
	// X-Forwarded-For (si derrière un proxy)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}

	// X-Real-IP
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// RemoteAddr
	return r.RemoteAddr
}
