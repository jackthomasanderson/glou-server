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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/romain/glou-server/internal/domain"
	"github.com/romain/glou-server/internal/store"
)

// Valid wine types
var validWineTypes = map[string]bool{
	"Red":       true,
	"White":     true,
	"Rosé":      true,
	"Sparkling": true,
}

// Valid alert types
var validAlertTypes = map[string]bool{
	"low_stock":      true,
	"apogee_reached": true,
	"apogee_ended":   true,
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
	store   *store.Store
	router  *http.ServeMux
	config  *Config
	limiter *RateLimiter
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
						s.corsMiddleware(next)))))
	}

	// Setup Wizard - Routes sans authentification
	s.router.HandleFunc("GET /setup", s.handleSetupWizard)
	s.router.HandleFunc("GET /api/setup/check", s.handleCheckSetup)
	s.router.HandleFunc("POST /api/setup/complete", s.handleCompleteSetup)

	// Wines
	s.router.HandleFunc("GET /wines", applySecurityMiddlewares(s.handleGetWines))
	s.router.HandleFunc("POST /wines", applySecurityMiddlewares(s.handleCreateWine))
	s.router.HandleFunc("GET /wines/search", applySecurityMiddlewares(s.handleSearchWines))
	s.router.HandleFunc("GET /wines/{id}", applySecurityMiddlewares(s.handleGetWineByID))
	s.router.HandleFunc("DELETE /wines/{id}", applySecurityMiddlewares(s.handleDeleteWine))
	s.router.HandleFunc("PUT /wines/{id}", applySecurityMiddlewares(s.handleUpdateWine))

	// Caves
	s.router.HandleFunc("GET /caves", applySecurityMiddlewares(s.handleGetCaves))
	s.router.HandleFunc("POST /caves", applySecurityMiddlewares(s.handleCreateCave))

	// Cells
	s.router.HandleFunc("GET /caves/{caveID}/cells", applySecurityMiddlewares(s.handleGetCells))
	s.router.HandleFunc("POST /cells", applySecurityMiddlewares(s.handleCreateCell))

	// Alertes
	s.router.HandleFunc("GET /alerts", applySecurityMiddlewares(s.handleGetAlerts))
	s.router.HandleFunc("POST /alerts", applySecurityMiddlewares(s.handleCreateAlert))
	s.router.HandleFunc("DELETE /alerts/{id}", applySecurityMiddlewares(s.handleDismissAlert))

	// Historique dégustation
	s.router.HandleFunc("GET /wines/{id}/history", applySecurityMiddlewares(s.handleGetConsumptionHistory))
	s.router.HandleFunc("POST /consumption", applySecurityMiddlewares(s.handleRecordConsumption))

	// Data Export/Import
	s.router.HandleFunc("GET /api/export/json", applySecurityMiddlewares(s.handleExportJSON))
	s.router.HandleFunc("GET /api/export/wines-csv", applySecurityMiddlewares(s.handleExportWinesCSV))
	s.router.HandleFunc("GET /api/export/caves-csv", applySecurityMiddlewares(s.handleExportCavesCSV))
	s.router.HandleFunc("GET /api/export/tasting-history-csv", applySecurityMiddlewares(s.handleExportTastingHistoryCSV))
	s.router.HandleFunc("POST /api/import/json", applySecurityMiddlewares(s.handleImportJSON))

	// Activity Log
	s.router.HandleFunc("GET /api/admin/activity-log", applySecurityMiddlewares(s.handleGetActivityLog))
	s.router.HandleFunc("GET /api/admin/activity-log/{type}/{id}", applySecurityMiddlewares(s.handleGetEntityActivityLog))

	// Admin Panel
	s.router.HandleFunc("GET /admin", applySecurityMiddlewares(s.handleAdminDashboard))
	s.router.HandleFunc("GET /api/admin/settings", applySecurityMiddlewares(s.handleGetSettings))
	s.router.HandleFunc("PUT /api/admin/settings", applySecurityMiddlewares(s.handleUpdateSettings))
	s.router.HandleFunc("POST /api/admin/upload-logo", applySecurityMiddlewares(s.handleUploadLogo))
	s.router.HandleFunc("GET /api/admin/stats", applySecurityMiddlewares(s.handleAdminStats))
	s.router.HandleFunc("GET /api/admin/users", applySecurityMiddlewares(s.handleGetUsers))

	// Enrichment - Wine data enrichment from external APIs
	s.router.HandleFunc("POST /api/enrich/barcode", applySecurityMiddlewares(handleEnrichByBarcode))
	s.router.HandleFunc("POST /api/enrich/name", applySecurityMiddlewares(handleEnrichByName))
	s.router.HandleFunc("POST /api/enrich/spirit", applySecurityMiddlewares(handleEnrichSpirit))
	s.router.HandleFunc("POST /api/enrich/bulk", applySecurityMiddlewares(handleBulkEnrich))

	// Enrichment - Image recognition (mobile camera)
	s.router.HandleFunc("POST /api/enrich/image-barcode", applySecurityMiddlewares(handleEnrichImageBarcode))
	s.router.HandleFunc("POST /api/enrich/image-recognize", applySecurityMiddlewares(handleEnrichImageRecognize))

	// OPTIONS
	s.router.HandleFunc("OPTIONS /wines", applySecurityMiddlewares(s.handleOptions))
	s.router.HandleFunc("OPTIONS /wines/{id}", applySecurityMiddlewares(s.handleOptions))
	s.router.HandleFunc("OPTIONS /caves", applySecurityMiddlewares(s.handleOptions))
	s.router.HandleFunc("OPTIONS /alerts", applySecurityMiddlewares(s.handleOptions))

	// Health check
	s.router.HandleFunc("GET /health", applySecurityMiddlewares(s.handleHealth))

	// Servir les assets statiques de l'application React
	// Les fichiers buildés sont dans web/dist/assets
	s.router.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("web/dist/assets"))))

	// Servir l'interface web React pour toutes les routes non-API
	// Cela permet à React Router d'avoir des URLs propres comme /dashboard, /wines, etc.
	s.router.HandleFunc("GET /{path...}", s.setupCheckMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Servir index.html pour toutes les routes frontend
		http.ServeFile(w, r, "web/dist/index.html")
	}))
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

	// Validation basique
	if wine.Name == "" || wine.Region == "" || wine.Vintage == 0 || wine.WineType == "" {
		s.respondError(w, http.StatusBadRequest, "Missing required fields: name, region, vintage, type", nil)
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

// Start démarre le serveur HTTP avec configurations de sécurité
func (s *Server) Start(addr string) error {
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      s.router,
		ReadTimeout:  s.config.Timeout,
		WriteTimeout: s.config.Timeout,
		IdleTimeout:  120 * time.Second,
	}

	// Channel pour capturer les erreurs
	errCh := make(chan error, 1)

	// Démarrer le serveur dans une goroutine
	go func() {
		log.Printf("Server started on %s (Environment: %s)", addr, s.config.Environment)
		errCh <- httpServer.ListenAndServe()
	}()

	// Attendre un signal de shutdown ou une erreur
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case sig := <-sigCh:
		log.Printf("Shutdown signal received: %v", sig)

		// Graceful shutdown avec timeout
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := httpServer.Shutdown(ctx); err != nil {
			return fmt.Errorf("failed to gracefully shutdown server: %w", err)
		}
	}

	return nil
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

	// Validation basique
	if wine.Name == "" || wine.Region == "" || wine.Vintage == 0 || wine.WineType == "" {
		s.respondError(w, http.StatusBadRequest, "Missing required fields: name, region, vintage, type", nil)
		return
	}

	// Validation des dates d'apogée
	if wine.MinApogeeDate != nil && wine.MaxApogeeDate != nil {
		if wine.MinApogeeDate.After(*wine.MaxApogeeDate) {
			s.respondError(w, http.StatusBadRequest, "min_apogee_date must be before max_apogee_date", nil)
			return
		}
	}

	// Validation du rating
	if wine.Rating != nil && (*wine.Rating < 0 || *wine.Rating > 5) {
		s.respondError(w, http.StatusBadRequest, "rating must be between 0 and 5", nil)
		return
	}

	// Validation de l'alcool
	if wine.AlcoholLevel != nil && (*wine.AlcoholLevel < 0 || *wine.AlcoholLevel > 20) {
		s.respondError(w, http.StatusBadRequest, "alcohol_level must be between 0 and 20", nil)
		return
	}

	if err := s.store.UpdateWine(r.Context(), &wine); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to update wine", err)
		return
	}

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

// handleGetCaves retourne toutes les caves
func (s *Server) handleGetCaves(w http.ResponseWriter, r *http.Request) {
	caves, err := s.store.GetCaves(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch caves", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(caves)
}

// handleCreateCave crée une nouvelle cave
func (s *Server) handleCreateCave(w http.ResponseWriter, r *http.Request) {
	var cave domain.Cave
	if err := json.NewDecoder(r.Body).Decode(&cave); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if cave.Name == "" {
		s.respondError(w, http.StatusBadRequest, "Missing required fields: name", nil)
		return
	}

	// Définir une localisation par défaut si non fournie
	if cave.Location == "" {
		cave.Location = "Principale"
	}

	id, err := s.store.CreateCave(r.Context(), &cave)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to create cave", err)
		return
	}

	cave.ID = id
	cave.CreatedAt = time.Now()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cave)
}

// handleGetCells récupère les emplacements d'une cave
func (s *Server) handleGetCells(w http.ResponseWriter, r *http.Request) {
	caveIDStr := r.PathValue("caveID")
	caveID, err := strconv.ParseInt(caveIDStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid cave ID", err)
		return
	}

	cells, err := s.store.GetCellsByCave(r.Context(), caveID)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch cells", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cells)
}

// handleCreateCell crée un nouvel emplacement
func (s *Server) handleCreateCell(w http.ResponseWriter, r *http.Request) {
	var cell domain.Cell
	if err := json.NewDecoder(r.Body).Decode(&cell); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	id, err := s.store.CreateCell(r.Context(), &cell)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to create cell", err)
		return
	}

	cell.ID = id
	cell.CreatedAt = time.Now()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cell)
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
		s.respondError(w, http.StatusBadRequest, "You must create at least one cellar before viewing alerts", nil)
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

	// Démarrer la génération automatique d'alertes (toutes les heures)
	alertGenerator := store.NewAlertGenerator(s)
	alertGenerator.Start(1 * time.Hour)
	defer alertGenerator.Stop()

	log.Println("Alert generator started (interval: 1 hour)")

	// Créer et démarrer le serveur avec configuration de sécurité
	server := NewServer(s, config)
	addr := ":" + config.Port
	if err := server.Start(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("Server stopped gracefully")
}
