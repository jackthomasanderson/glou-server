package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/romain/glou-server/internal/crypto"
	"github.com/romain/glou-server/internal/domain"
	"github.com/romain/glou-server/internal/notifier"
	"github.com/romain/glou-server/internal/store"
)

// Valid wine types
var validWineTypes = map[string]bool{
	"Red":       true,
	"White":     true,
	"Rosé":      true,
	"Sparkling": true,
	"Beer":      true,
	"Spirit":    true,
}

// Valid alert types
var validAlertTypes = map[string]bool{
	"low_stock":      true,
	"apogee_reached": true,
	"apogee_ended":   true,
}

// mimeTypeHandler ajoute les bons Content-Type aux fichiers statiques
// en appelant SetHeader AVANT que FileServer écrive le corps
type mimeTypeHandler struct {
	handler http.Handler
}

func (h *mimeTypeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Déterminer le type MIME basé sur l'extension AVANT que FileServer s'exécute
	switch {
	case strings.HasSuffix(r.URL.Path, ".css"):
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case strings.HasSuffix(r.URL.Path, ".js"):
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	case strings.HasSuffix(r.URL.Path, ".json"):
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	case strings.HasSuffix(r.URL.Path, ".html"):
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case strings.HasSuffix(r.URL.Path, ".png"):
		w.Header().Set("Content-Type", "image/png")
	case strings.HasSuffix(r.URL.Path, ".jpg") || strings.HasSuffix(r.URL.Path, ".jpeg"):
		w.Header().Set("Content-Type", "image/jpeg")
	case strings.HasSuffix(r.URL.Path, ".gif"):
		w.Header().Set("Content-Type", "image/gif")
	case strings.HasSuffix(r.URL.Path, ".svg"):
		w.Header().Set("Content-Type", "image/svg+xml")
	case strings.HasSuffix(r.URL.Path, ".ico"):
		w.Header().Set("Content-Type", "image/x-icon")
	case strings.HasSuffix(r.URL.Path, ".woff"):
		w.Header().Set("Content-Type", "font/woff")
	case strings.HasSuffix(r.URL.Path, ".woff2"):
		w.Header().Set("Content-Type", "font/woff2")
	case strings.HasSuffix(r.URL.Path, ".ttf"):
		w.Header().Set("Content-Type", "font/ttf")
	}

	// Servir le fichier - FileServer utilisera maintenant notre Content-Type
	// plutôt que de détecter text/plain
	h.handler.ServeHTTP(w, r)
}

// setContentType fixe le Content-Type sur la réponse si connu
func setContentType(w http.ResponseWriter, path string) {
	switch {
	case strings.HasSuffix(path, ".css"):
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case strings.HasSuffix(path, ".js"):
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	case strings.HasSuffix(path, ".json"):
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	case strings.HasSuffix(path, ".html"):
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case strings.HasSuffix(path, ".png"):
		w.Header().Set("Content-Type", "image/png")
	case strings.HasSuffix(path, ".jpg"), strings.HasSuffix(path, ".jpeg"):
		w.Header().Set("Content-Type", "image/jpeg")
	case strings.HasSuffix(path, ".gif"):
		w.Header().Set("Content-Type", "image/gif")
	case strings.HasSuffix(path, ".svg"):
		w.Header().Set("Content-Type", "image/svg+xml")
	case strings.HasSuffix(path, ".ico"):
		w.Header().Set("Content-Type", "image/x-icon")
	case strings.HasSuffix(path, ".woff"):
		w.Header().Set("Content-Type", "font/woff")
	case strings.HasSuffix(path, ".woff2"):
		w.Header().Set("Content-Type", "font/woff2")
	case strings.HasSuffix(path, ".ttf"):
		w.Header().Set("Content-Type", "font/ttf")
	}
}

// serveFileIfExists répond avec un fichier s'il est présent sur le disque
func serveFileIfExists(w http.ResponseWriter, r *http.Request, path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	http.ServeFile(w, r, path)
	return true
}

// safeJoin empêche les traversées de répertoires en maintenant le chemin sous base
func safeJoin(base, rel string) (string, bool) {
	cleanBase := filepath.Clean(base)
	cleanRel := filepath.Clean(rel)
	full := filepath.Join(cleanBase, cleanRel)

	if !strings.HasPrefix(full, cleanBase) {
		return "", false
	}

	return full, true
}

// ValidateWine validates wine data before storage
func ValidateWine(wine *domain.Wine) error {
	if wine.Name == "" {
		return errors.New("wine name is required")
	}
	if len(wine.Name) > 255 {
		return errors.New("wine name too long (max 255 characters)")
	}
	if wine.Region == "" {
		return errors.New("wine region is required")
	}
	if len(wine.Region) > 255 {
		return errors.New("wine region too long (max 255 characters)")
	}
	if wine.Vintage < 1900 || wine.Vintage > time.Now().Year() {
		return fmt.Errorf("invalid vintage: must be between 1900 and %d", time.Now().Year())
	}
	if !validWineTypes[wine.WineType] {
		return fmt.Errorf("invalid wine type: must be Red, White, Rosé, or Sparkling")
	}
	if wine.Quantity < 0 {
		return errors.New("quantity cannot be negative")
	}
	if wine.Rating != nil && (*wine.Rating < 0 || *wine.Rating > 5) {
		return errors.New("rating must be between 0 and 5")
	}
	if wine.AlcoholLevel != nil && (*wine.AlcoholLevel < 0 || *wine.AlcoholLevel > 20) {
		return errors.New("alcohol level must be between 0 and 20")
	}
	if wine.Price != nil && *wine.Price < 0 {
		return errors.New("price cannot be negative")
	}
	if wine.MinApogeeDate != nil && wine.MaxApogeeDate != nil && wine.MinApogeeDate.After(*wine.MaxApogeeDate) {
		return errors.New("min apogee date must be before max apogee date")
	}
	return nil
}

// ValidateAlert validates alert data before storage
func ValidateAlert(alert *domain.Alert) error {
	if alert.WineID <= 0 {
		return errors.New("wine ID is required")
	}
	if !validAlertTypes[alert.AlertType] {
		return fmt.Errorf("invalid alert type: must be low_stock, apogee_reached, or apogee_ended")
	}
	if alert.Status != "active" && alert.Status != "dismissed" {
		return fmt.Errorf("invalid alert status: must be active or dismissed")
	}
	return nil
}

// checkCellarExists vérifie qu'au moins une cave existe
func (s *Server) checkCellarExists(ctx context.Context) (bool, error) {
	caves, err := s.store.GetCaves(ctx)
	if err != nil {
		return false, err
	}
	return len(caves) > 0, nil
}

// Server encapsule les dépendances du serveur HTTP
type Server struct {
	store           *store.Store
	router          *http.ServeMux
	config          *Config
	limiter         *RateLimiter
	notifierManager *notifier.NotifierManager
}

// corsMiddleware sécurisé avec vérification d'origine
func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return s.secureCorMiddleware(next)
}

// handleOptions répond aux requêtes OPTIONS
func (s *Server) handleOptions(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// NewServer crée et configure le serveur
func NewServer(s *store.Store, config *Config) *Server {
	server := &Server{
		store:   s,
		router:  http.NewServeMux(),
		config:  config,
		limiter: NewRateLimiter(config),
	}
	server.setupRoutes()
	return server
}

// setupRoutes configure les routes de l'API
func (s *Server) setupRoutes() {
	// Appliquer les middlewares de sécurité globaux
	applySecurityMiddlewares := func(next http.HandlerFunc) http.HandlerFunc {
		return s.loggingMiddleware(
			s.securityHeadersMiddleware(
				s.bodyLimitMiddleware(
					s.rateLimitMiddleware(
						s.corsMiddleware(
							s.csrfMiddleware(next))))))
	}

	// CORS-only middleware for OPTIONS requests (no CSRF check)
	applyCorsOnly := func(next http.HandlerFunc) http.HandlerFunc {
		return s.loggingMiddleware(
			s.corsMiddleware(next))
	}

	// Setup Wizard - Routes sans authentification
	s.router.HandleFunc("GET /setup", s.handleSetupWizard)
	s.router.HandleFunc("GET /api/setup/check", s.handleCheckSetup)
	s.router.HandleFunc("GET /api/setup/smtp-config", s.handleCheckSMTPConfig)
	s.router.HandleFunc("POST /api/setup/complete", s.handleCompleteSetup)

	// Authentication - Routes publiques (servies par le SPA)
	s.router.HandleFunc("POST /api/auth/login", applySecurityMiddlewares(s.handleLogin))
	s.router.HandleFunc("POST /api/auth/logout", applySecurityMiddlewares(s.handleLogout))
	s.router.HandleFunc("POST /api/auth/register", applySecurityMiddlewares(s.handleRegister))
	s.router.HandleFunc("POST /api/auth/forgot-password", applySecurityMiddlewares(s.handleForgotPassword))
	s.router.HandleFunc("POST /api/auth/reset-password", applySecurityMiddlewares(s.handleResetPassword))
	s.router.HandleFunc("GET /api/auth/status", applySecurityMiddlewares(s.handleCheckAuthStatus))

	// Middleware d'authentification pour les routes protégées
	authRequired := func(next http.HandlerFunc) http.HandlerFunc {
		return applySecurityMiddlewares(s.authRequiredMiddleware(next))
	}

	// CSRF Token endpoint - Protégé par authentification
	s.router.HandleFunc("GET /api/csrf", authRequired(s.handleGetCsrf))

	// Raccourci pour les routes réservées aux administrateurs
	adminOnly := func(next http.HandlerFunc) http.HandlerFunc {
		return authRequired(s.setupCheckMiddleware(s.adminRequiredMiddleware(next)))
	}

	// Wines - Protégées par authentification
	s.router.HandleFunc("GET /wines", authRequired(s.handleGetWines))
	s.router.HandleFunc("POST /wines", authRequired(s.handleCreateWine))
	s.router.HandleFunc("GET /wines/search", authRequired(s.handleSearchWines))
	s.router.HandleFunc("GET /wines/drinkable", authRequired(s.handleGetWinesToDrinkNow))
	s.router.HandleFunc("GET /wines/{id}", authRequired(s.handleGetWineByID))
	s.router.HandleFunc("DELETE /wines/{id}", authRequired(s.handleDeleteWine))
	s.router.HandleFunc("PUT /wines/{id}", authRequired(s.handleUpdateWine))

	// Tobacco - Protégées par authentification
	s.router.HandleFunc("GET /tobacco", authRequired(s.handleGetTobacco))
	s.router.HandleFunc("POST /tobacco", authRequired(s.handleCreateTobacco))
	s.router.HandleFunc("GET /tobacco/{id}", authRequired(s.handleGetTobaccoByID))
	s.router.HandleFunc("PUT /tobacco/{id}", authRequired(s.handleUpdateTobacco))
	s.router.HandleFunc("DELETE /tobacco/{id}", authRequired(s.handleDeleteTobacco))

	// Preflight CORS for tobacco endpoints
	s.router.HandleFunc("OPTIONS /tobacco", applyCorsOnly(s.handleOptions))
	s.router.HandleFunc("OPTIONS /tobacco/{id}", applyCorsOnly(s.handleOptions))

	// Caves - Protégées par authentification
	s.router.HandleFunc("GET /caves", authRequired(s.handleGetCaves))
	s.router.HandleFunc("POST /caves", authRequired(s.handleCreateCave))
	s.router.HandleFunc("PUT /caves/{id}", authRequired(s.handleUpdateCave))

	// Bottles - Protégées par authentification
	s.router.HandleFunc("GET /bottles", authRequired(s.handleGetAllBottles))
	s.router.HandleFunc("GET /caves/{caveID}/bottles", authRequired(s.handleGetCaveBottles))

	// Cells - Protégées par authentification
	s.router.HandleFunc("GET /caves/{caveID}/cells", authRequired(s.handleGetCells))
	s.router.HandleFunc("POST /cells", authRequired(s.handleCreateCell))

	// Preflight CORS for cells
	s.router.HandleFunc("OPTIONS /cells", applyCorsOnly(s.handleOptions))

	// Alertes - Protégées par authentification
	s.router.HandleFunc("GET /alerts", authRequired(s.handleGetAlerts))
	s.router.HandleFunc("POST /alerts", authRequired(s.handleCreateAlert))
	s.router.HandleFunc("DELETE /alerts/{id}", authRequired(s.handleDismissAlert))

	// Tobacco Alerts - Protégées par authentification
	s.router.HandleFunc("GET /tobacco-alerts", authRequired(s.handleGetTobaccoAlerts))
	s.router.HandleFunc("POST /tobacco-alerts/generate", authRequired(s.handleGenerateTobaccoAlerts))
	s.router.HandleFunc("DELETE /tobacco-alerts/{id}/dismiss", authRequired(s.handleDismissTobaccoAlert))

	// Preflight CORS for tobacco alerts
	s.router.HandleFunc("OPTIONS /tobacco-alerts", applyCorsOnly(s.handleOptions))
	s.router.HandleFunc("OPTIONS /tobacco-alerts/{id}/dismiss", applyCorsOnly(s.handleOptions))

	// Historique dégustation - Protégé par authentification
	s.router.HandleFunc("GET /wines/{id}/history", authRequired(s.handleGetConsumptionHistory))
	s.router.HandleFunc("POST /consumption", authRequired(s.handleRecordConsumption))

	// Data Export/Import - Réservé aux administrateurs
	s.router.HandleFunc("GET /api/export/json", adminOnly(s.handleExportJSON))
	s.router.HandleFunc("GET /api/export/wines-csv", adminOnly(s.handleExportWinesCSV))
	s.router.HandleFunc("GET /api/export/caves-csv", adminOnly(s.handleExportCavesCSV))
	s.router.HandleFunc("GET /api/export/tasting-history-csv", adminOnly(s.handleExportTastingHistoryCSV))
	s.router.HandleFunc("POST /api/import/json", adminOnly(s.handleImportJSON))

	// Activity Log - Protégé par authentification
	s.router.HandleFunc("GET /api/admin/activity-log", authRequired(s.handleGetActivityLog))
	s.router.HandleFunc("GET /api/admin/activity-log/{type}/{id}", authRequired(s.handleGetEntityActivityLog))

	// Admin Panel - Protégé par authentification + rôle admin
	s.router.HandleFunc("GET /admin", adminOnly(s.handleAdminDashboard))
	s.router.HandleFunc("GET /api/admin/settings", adminOnly(s.handleGetSettings))
	s.router.HandleFunc("PUT /api/admin/settings", adminOnly(s.handleUpdateSettings))
	s.router.HandleFunc("POST /api/admin/upload-logo", adminOnly(s.handleUploadLogo))
	s.router.HandleFunc("GET /api/admin/stats", adminOnly(s.handleAdminStats))
	s.router.HandleFunc("GET /api/admin/users", adminOnly(s.handleGetUsers))

	// Enrichment - Protégé par authentification
	s.router.HandleFunc("POST /api/enrich/barcode", authRequired(handleEnrichByBarcode))
	s.router.HandleFunc("POST /api/enrich/name", authRequired(handleEnrichByName))
	s.router.HandleFunc("POST /api/enrich/spirit", authRequired(handleEnrichSpirit))
	s.router.HandleFunc("POST /api/enrich/bulk", authRequired(handleBulkEnrich))

	// Enrichment - Image recognition (mobile camera) - Protégé par authentification
	s.router.HandleFunc("POST /api/enrich/image-barcode", authRequired(handleEnrichImageBarcode))
	s.router.HandleFunc("POST /api/enrich/image-recognize", authRequired(handleEnrichImageRecognize))

	// OPTIONS
	s.router.HandleFunc("OPTIONS /wines", applyCorsOnly(s.handleOptions))
	s.router.HandleFunc("OPTIONS /wines/{id}", applyCorsOnly(s.handleOptions))
	s.router.HandleFunc("OPTIONS /caves", applyCorsOnly(s.handleOptions))
	s.router.HandleFunc("OPTIONS /alerts", applyCorsOnly(s.handleOptions))
	s.router.HandleFunc("OPTIONS /api/admin/settings", applyCorsOnly(s.handleOptions))

	// Health check
	s.router.HandleFunc("GET /health", applySecurityMiddlewares(s.handleHealth))

	// Servir le bundle React buildé (même port que l'API) sans utiliser /assets/
	distDir := "web/dist"
	distIndex := filepath.Join(distDir, "index.html")

	serveSPA := func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(distIndex); err != nil {
			s.respondError(w, http.StatusInternalServerError, "Frontend build missing. Run npm run build.", err)
			return
		}

		relPath := strings.TrimPrefix(r.URL.Path, "/")
		if relPath == "" || relPath == "/" {
			relPath = "index.html"
		}

		if distPath, ok := safeJoin(distDir, relPath); ok {
			if info, err := os.Stat(distPath); err == nil && !info.IsDir() {
				setContentType(w, distPath)
				http.ServeFile(w, r, distPath)
				return
			}
		}

		setContentType(w, distIndex)
		http.ServeFile(w, r, distIndex)
	}

	// Catch-all SPA only in production; in development the frontend runs on a separate dev server
	if s.config.Environment == "production" {
		s.router.HandleFunc("GET /{path...}", s.setupCheckMiddleware(serveSPA))
	} else {
		s.router.HandleFunc("GET /{path...}", http.NotFound)
	}
}

// Start lance le serveur HTTP avec graceful shutdown
func (s *Server) Start(addr string) error {
	// Créer le serveur HTTP avec timeouts de sécurité
	httpServer := &http.Server{
		Addr:           addr,
		Handler:        s.router,
		ReadTimeout:    s.config.Timeout,
		WriteTimeout:   s.config.Timeout,
		IdleTimeout:    60 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB
	}

	// Canal pour les erreurs du serveur
	serverErrors := make(chan error, 1)

	// Démarrer le serveur dans une goroutine
	go func() {
		log.Printf("Server listening on %s", addr)
		serverErrors <- httpServer.ListenAndServe()
	}()

	// Canal pour les signaux d'arrêt
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	// Attendre un signal d'arrêt ou une erreur
	select {
	case err := <-serverErrors:
		return fmt.Errorf("server error: %w", err)
	case sig := <-shutdown:
		log.Printf("Received signal %v, starting graceful shutdown", sig)

		// Créer un contexte avec timeout pour le shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Arrêter le serveur gracieusement
		if err := httpServer.Shutdown(ctx); err != nil {
			return fmt.Errorf("graceful shutdown failed: %w", err)
		}
	}

	return nil
}

// handleGetWines retourne la liste de tous les vins
func (s *Server) handleGetWines(w http.ResponseWriter, r *http.Request) {
	wines, err := s.store.GetWines(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch wines", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wines)
}

// handleCreateWine ajoute un nouveau vin
func (s *Server) handleCreateWine(w http.ResponseWriter, r *http.Request) {
	// Vérifier qu'au moins une cave existe
	hasCellar, err := s.checkCellarExists(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check cellars", err)
		return
	}
	if !hasCellar {
		s.respondError(w, http.StatusBadRequest, "You must create at least one cellar before adding wines", nil)
		return
	}

	var wine domain.Wine
	if err := json.NewDecoder(r.Body).Decode(&wine); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Validation complète
	if err := ValidateWine(&wine); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	if wine.Quantity <= 0 {
		wine.Quantity = 1
	}

	id, err := s.store.CreateWine(r.Context(), &wine)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to create wine", err)
		return
	}

	wine.ID = id
	wine.CreatedAt = time.Now()

	// Audit
	s.store.LogActivity(r.Context(), "wine", wine.ID, "wine_created", map[string]interface{}{"name": wine.Name, "region": wine.Region, "vintage": wine.Vintage}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(wine)
}

// handleDeleteWine supprime ou décrémente la quantité d'un vin
func (s *Server) handleDeleteWine(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid wine ID", err)
		return
	}

	if err := s.store.DeleteWine(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			s.respondError(w, http.StatusNotFound, "Wine not found", err)
		} else {
			s.respondError(w, http.StatusInternalServerError, "Failed to delete wine", err)
		}
		return
	}

	// Audit
	s.store.LogActivity(r.Context(), "wine", id, "wine_deleted_or_decremented", map[string]string{"id": idStr}, s.getClientIP(r))

	w.WriteHeader(http.StatusNoContent)
}

// handleHealth retourne le statut du serveur
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"healthy"}`)
}

// respondError écrit une réponse d'erreur JSON
func (s *Server) respondError(w http.ResponseWriter, statusCode int, message string, err error) {
	logMessage := message
	if err != nil {
		logMessage = fmt.Sprintf("%s: %v", message, err)
	}
	log.Printf("[ERROR] %s", logMessage)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	response := map[string]interface{}{
		"error": message,
	}
	json.NewEncoder(w).Encode(response)
}

// handleGetWineByID retourne un vin par son ID
func (s *Server) handleGetWineByID(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid wine ID", err)
		return
	}

	wine, err := s.store.GetWineByID(r.Context(), id)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "Wine not found", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wine)
}

// handleUpdateWine met à jour un vin
func (s *Server) handleUpdateWine(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid wine ID", err)
		return
	}

	var wine domain.Wine
	if err := json.NewDecoder(r.Body).Decode(&wine); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	wine.ID = id

	// Validation complète
	if err := ValidateWine(&wine); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	if err := s.store.UpdateWine(r.Context(), &wine); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to update wine", err)
		return
	}

	// Audit
	s.store.LogActivity(r.Context(), "wine", wine.ID, "wine_updated", map[string]interface{}{"name": wine.Name, "region": wine.Region, "vintage": wine.Vintage}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wine)
}

// handleSearchWines recherche des vins
func (s *Server) handleSearchWines(w http.ResponseWriter, r *http.Request) {
	filters := map[string]interface{}{
		"name":   r.URL.Query().Get("name"),
		"region": r.URL.Query().Get("region"),
		"type":   r.URL.Query().Get("type"),
	}

	if vintage := r.URL.Query().Get("vintage"); vintage != "" {
		if v, err := strconv.Atoi(vintage); err == nil {
			filters["vintage"] = v
		}
	}

	wines, err := s.store.SearchWines(r.Context(), filters)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to search wines", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wines)
}

// handleGetAlerts retourne les alertes actives
func (s *Server) handleGetAlerts(w http.ResponseWriter, r *http.Request) {
	// Vérifier qu'au moins une cave existe
	hasCellar, err := s.checkCellarExists(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check cellars", err)
		return
	}
	if !hasCellar {
		// Return empty array instead of error when no cellar exists
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]domain.Alert{})
		return
	}

	alerts, err := s.store.GetAlerts(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch alerts", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

// handleCreateAlert crée une alerte
func (s *Server) handleCreateAlert(w http.ResponseWriter, r *http.Request) {
	// Vérifier qu'au moins une cave existe
	hasCellar, err := s.checkCellarExists(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check cellars", err)
		return
	}
	if !hasCellar {
		s.respondError(w, http.StatusBadRequest, "You must create at least one cellar before creating alerts", nil)
		return
	}

	var alert domain.Alert
	if err := json.NewDecoder(r.Body).Decode(&alert); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if alert.WineID == 0 || alert.AlertType == "" {
		s.respondError(w, http.StatusBadRequest, "Missing required fields: wine_id, alert_type", nil)
		return
	}

	// Valider le type d'alerte
	validTypes := map[string]bool{"low_stock": true, "apogee_reached": true, "apogee_ended": true}
	if !validTypes[alert.AlertType] {
		s.respondError(w, http.StatusBadRequest, "Invalid alert_type", nil)
		return
	}

	if alert.Status == "" {
		alert.Status = "active"
	}

	id, err := s.store.CreateAlert(r.Context(), &alert)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to create alert", err)
		return
	}

	alert.ID = id
	alert.CreatedAt = time.Now()

	// Audit
	s.store.LogActivity(r.Context(), "alert", alert.ID, "alert_created", map[string]interface{}{"wine_id": alert.WineID, "type": alert.AlertType}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(alert)
}

// handleDismissAlert marque une alerte comme dismissée
func (s *Server) handleDismissAlert(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid alert ID", err)
		return
	}

	if err := s.store.DismissAlert(r.Context(), id); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to dismiss alert", err)
		return
	}

	// Audit
	s.store.LogActivity(r.Context(), "alert", id, "alert_dismissed", map[string]string{"id": idStr}, s.getClientIP(r))

	w.WriteHeader(http.StatusNoContent)
}

// handleGetConsumptionHistory retourne l'historique de dégustation
func (s *Server) handleGetConsumptionHistory(w http.ResponseWriter, r *http.Request) {
	// Vérifier qu'au moins une cave existe
	hasCellar, err := s.checkCellarExists(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check cellars", err)
		return
	}
	if !hasCellar {
		s.respondError(w, http.StatusBadRequest, "You must create at least one cellar before viewing history", nil)
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid wine ID", err)
		return
	}

	history, err := s.store.GetConsumptionHistory(r.Context(), id)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch history", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

// handleRecordConsumption enregistre une dégustation
func (s *Server) handleRecordConsumption(w http.ResponseWriter, r *http.Request) {
	// Vérifier qu'au moins une cave existe
	hasCellar, err := s.checkCellarExists(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check cellars", err)
		return
	}
	if !hasCellar {
		s.respondError(w, http.StatusBadRequest, "You must create at least one cellar before recording consumption", nil)
		return
	}

	var consumption domain.ConsumptionHistory
	if err := json.NewDecoder(r.Body).Decode(&consumption); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	id, err := s.store.RecordConsumption(r.Context(), &consumption)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to record consumption", err)
		return
	}

	consumption.ID = id
	consumption.CreatedAt = time.Now()

	// Audit
	s.store.LogActivity(r.Context(), "consumption", consumption.ID, "consumption_recorded", map[string]interface{}{"wine_id": consumption.WineID, "qty": consumption.Quantity}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(consumption)
}

func main() {
	// Charger la configuration
	config := LoadConfig()

	// Valider la configuration
	if err := config.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	log.Printf("Starting Glou Server (%s)", config.Environment)
	log.Printf("Database: %s", config.DBPath)
	log.Printf("Allowed origins: %v", config.AllowedOrigins)

	// Initialiser la base de données
	s, err := store.New(config.DBPath)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}
	defer s.Close()

	// Initialiser le service de chiffrement conforme ANSSI
	if config.EncryptionPassphrase != "" {
		encService, err := crypto.NewEncryptionService(config.EncryptionPassphrase, config.EncryptionSalt)
		if err != nil {
			log.Fatalf("Failed to initialize encryption service: %v", err)
		}
		s.SetEncryptionService(encService)
		log.Println("Encryption service initialized (ANSSI AES-256-GCM)")
	} else if config.Environment == "production" {
		log.Fatalf("Encryption passphrase required in production (ANSSI requirement)")
	} else {
		log.Println("WARNING: Encryption disabled (only for development)")
	}

	// Configurer le manager de notifications (Gotify/SMTP)
	nm := notifier.NewNotifierManager()
	if config.GotifyURL != "" && config.GotifyToken != "" {
		nm.AddNotifier(notifier.NewGotifyNotifier(config.GotifyURL, config.GotifyToken))
	}
	if config.SMTPHost != "" && config.SMTPFrom != "" {
		nm.AddNotifier(notifier.NewSMTPNotifier(config.SMTPHost, config.SMTPPort, config.SMTPUsername, config.SMTPPassword, config.SMTPFrom, config.SMTPTo, config.SMTPUseTLS))
	}

	// Démarrer la génération automatique d'alertes (toutes les heures)
	alertGenerator := store.NewAlertGenerator(s)
	alertGenerator.Start(1 * time.Hour)
	defer alertGenerator.Stop()

	log.Println("Alert generator started (interval: 1 hour)")

	// Créer et démarrer le serveur avec configuration de sécurité
	server := NewServer(s, config)
	server.notifierManager = nm
	addr := ":" + config.Port
	if err := server.Start(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("Server stopped gracefully")
}
