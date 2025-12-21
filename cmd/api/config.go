package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config encapsule la configuration de sécurité et générale
type Config struct {
	// Server
	Port    string
	DBPath  string
	Timeout time.Duration

	// Security
	AllowedOrigins     []string
	RateLimitRequests  int
	RateLimitWindow    time.Duration
	MaxRequestBodySize int64
	Environment        string

	// Logging
	LogLevel string

	// Notifications
	GotifyURL    string
	GotifyToken  string
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
	SMTPTo       string
	SMTPUseTLS   bool
}

// LoadConfig charge la configuration depuis les variables d'environnement
func LoadConfig() *Config {
	config := &Config{
		Port:               getEnv("PORT", "8080"),
		DBPath:             getEnv("DB_PATH", "./glou.db"),
		AllowedOrigins:     parseOrigins(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:8080")),
		RateLimitRequests:  getEnvInt("RATE_LIMIT_REQUESTS", 100),
		RateLimitWindow:    time.Duration(getEnvInt("RATE_LIMIT_WINDOW_SECONDS", 60)) * time.Second,
		Timeout:            time.Duration(getEnvInt("REQUEST_TIMEOUT_SECONDS", 30)) * time.Second,
		MaxRequestBodySize: int64(getEnvInt("MAX_REQUEST_BODY_SIZE", 1048576)), // 1MB default
		LogLevel:           getEnv("LOG_LEVEL", "info"),
		Environment:        getEnv("ENVIRONMENT", "development"),
		// Notifications
		GotifyURL:    getEnv("GOTIFY_URL", ""),
		GotifyToken:  getEnv("GOTIFY_TOKEN", ""),
		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnvInt("SMTP_PORT", 587),
		SMTPUsername: getEnv("SMTP_USERNAME", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", ""),
		SMTPTo:       getEnv("SMTP_TO", ""),
		SMTPUseTLS:   getEnv("SMTP_USE_TLS", "true") == "true",
	}

	return config
}

// getEnv récupère une variable d'environnement avec une valeur par défaut
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// getEnvInt récupère une variable d'environnement entière
func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// parseOrigins parse la liste des origines CORS
func parseOrigins(originsStr string) []string {
	var origins []string
	for _, origin := range strings.Split(originsStr, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

// IsOriginAllowed vérifie si une origine est autorisée
func (c *Config) IsOriginAllowed(origin string) bool {
	if c.Environment == "development" {
		// En développement, autoriser localhost
		return true
	}

	for _, allowed := range c.AllowedOrigins {
		if allowed == origin {
			return true
		}
	}
	return false
}

// Validate valide la configuration
func (c *Config) Validate() error {
	if c.Port == "" {
		return fmt.Errorf("PORT not configured")
	}
	if c.DBPath == "" {
		return fmt.Errorf("DB_PATH not configured")
	}
	if len(c.AllowedOrigins) == 0 {
		return fmt.Errorf("CORS_ALLOWED_ORIGINS not configured")
	}
	if c.LogLevel != "debug" && c.LogLevel != "info" && c.LogLevel != "warn" && c.LogLevel != "error" {
		return fmt.Errorf("LOG_LEVEL invalide: %s", c.LogLevel)
	}
	return nil
}
