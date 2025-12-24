package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// handleAdminDashboard affiche le dashboard admin
func (s *Server) handleAdminDashboard(w http.ResponseWriter, r *http.Request) {
	// TODO: Vérifier que l'utilisateur est admin
	// Pour maintenant, servir la page HTML
	http.ServeFile(w, r, "assets/admin.html")
}

// handleGetSettings récupère les paramètres actuels
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to get settings: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// handleUpdateSettings met à jour les paramètres
func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Récupérer les settings existants pour obtenir l'ID
	existingSettings, err := s.store.GetSettings(ctx)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to get existing settings: " + err.Error(),
		})
		return
	}

	// Décoder les nouveaux paramètres partiels
	var partialSettings map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&partialSettings); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid request body: " + err.Error(),
		})
		return
	}

	// Mettre à jour seulement les champs fournis
	if val, ok := partialSettings["app_title"].(string); ok {
		existingSettings.AppTitle = val
	}
	if val, ok := partialSettings["app_slogan"].(string); ok {
		existingSettings.AppSlogan = val
	}
	if val, ok := partialSettings["support_email"].(string); ok {
		existingSettings.SupportEmail = val
	}
	if val, ok := partialSettings["logo_url"].(string); ok {
		existingSettings.LogoURL = val
	}
	if val, ok := partialSettings["favicon_url"].(string); ok {
		existingSettings.FaviconURL = val
	}
	if val, ok := partialSettings["language"].(string); ok {
		existingSettings.Language = val
	}
	if val, ok := partialSettings["theme_color"].(string); ok {
		existingSettings.ThemeColor = val
	}
	if val, ok := partialSettings["secondary_color"].(string); ok {
		existingSettings.SecondaryColor = val
	}
	if val, ok := partialSettings["accent_color"].(string); ok {
		existingSettings.AccentColor = val
	}
	if val, ok := partialSettings["dark_mode_default"].(bool); ok {
		existingSettings.DarkModeDefault = val
	}
	if val, ok := partialSettings["public_domain"].(string); ok {
		existingSettings.PublicDomain = val
	}
	if val, ok := partialSettings["public_protocol"].(string); ok {
		existingSettings.PublicProtocol = val
	}
	if val, ok := partialSettings["proxy_mode"].(bool); ok {
		existingSettings.ProxyMode = val
	}
	if val, ok := partialSettings["proxy_headers"].(bool); ok {
		existingSettings.ProxyHeaders = val
	}
	if val, ok := partialSettings["enable_notifications"].(bool); ok {
		existingSettings.EnableNotifications = val
	}
	if val, ok := partialSettings["maintenance_mode"].(bool); ok {
		existingSettings.MaintenanceMode = val
	}
	if val, ok := partialSettings["allow_registration"].(bool); ok {
		existingSettings.AllowRegistration = val
	}
	if val, ok := partialSettings["require_approval"].(bool); ok {
		existingSettings.RequireApproval = val
	}
	if val, ok := partialSettings["rows_per_page"].(float64); ok {
		existingSettings.RowsPerPage = int(val)
	}
	if val, ok := partialSettings["date_format"].(string); ok {
		existingSettings.DateFormat = val
	}
	if val, ok := partialSettings["max_request_body_size"].(float64); ok {
		existingSettings.MaxRequestBodySize = int64(val)
	}
	if val, ok := partialSettings["session_timeout"].(float64); ok {
		existingSettings.SessionTimeout = int(val)
	}

	if err := s.store.UpdateSettings(ctx, existingSettings); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to update settings: " + err.Error(),
		})
		return
	}

	// Audit
	s.store.LogActivity(ctx, "settings", existingSettings.ID, "settings_updated", map[string]string{"by": "admin"}, s.getClientIP(r))

	// Audit
	s.store.LogActivity(ctx, "admin", 0, "update_settings", map[string]string{"by": r.Context().Value(SessionUserKey).(string)}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleUploadLogo gère l'upload du logo
func (s *Server) handleUploadLogo(w http.ResponseWriter, r *http.Request) {
	log.Printf("[UPLOAD] Starting logo upload handler")

	// Parser le formulaire multipart avec limite de 10MB
	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		log.Printf("[UPLOAD] Failed to parse form: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to parse form: " + err.Error(),
		})
		return
	}

	file, handler, err := r.FormFile("logo")
	if err != nil {
		log.Printf("[UPLOAD] Failed to get file: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to get file: " + err.Error(),
		})
		return
	}
	defer file.Close()

	log.Printf("[UPLOAD] File received: %s (size: %d bytes)", handler.Filename, handler.Size)

	// Valider le type MIME et l'extension
	validExtensions := map[string]bool{
		".png":  true,
		".jpg":  true,
		".jpeg": true,
		".gif":  true,
		".svg":  true,
		".webp": true,
	}

	ext := strings.ToLower(filepath.Ext(handler.Filename))
	if !validExtensions[ext] {
		log.Printf("[UPLOAD] Invalid extension: %s", ext)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid file type. Allowed: png, jpg, jpeg, gif, svg, webp",
		})
		return
	}

	// Créer le dossier uploads s'il n'existe pas
	uploadsDir := "assets/uploads"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("[UPLOAD] Failed to create directory: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to create uploads directory: " + err.Error(),
		})
		return
	}

	// Générer un nom de fichier unique pour éviter les collisions
	// Format: logo_<timestamp>_<original_name>
	uniqueName := fmt.Sprintf("logo_%d_%s", time.Now().UnixNano(), handler.Filename)
	filePath := filepath.Join(uploadsDir, uniqueName)
	log.Printf("[UPLOAD] Saving to: %s", filePath)

	// Créer le fichier de destination
	dst, err := os.Create(filePath)
	if err != nil {
		log.Printf("[UPLOAD] Failed to create destination file: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to create file: " + err.Error(),
		})
		return
	}
	defer dst.Close()

	// Copier le fichier avec limite de taille (10MB max)
	limitedReader := io.LimitReader(file, 10*1024*1024)
	bytesWritten, err := io.Copy(dst, limitedReader)
	if err != nil {
		log.Printf("[UPLOAD] Failed to copy file (wrote %d bytes): %v", bytesWritten, err)
		os.Remove(filePath) // Nettoyer le fichier en cas d'erreur
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to save file: " + err.Error(),
		})
		return
	}

	log.Printf("[UPLOAD] File saved successfully: %d bytes written", bytesWritten)

	// URL relative du fichier téléchargé
	logoURL := "/assets/uploads/" + uniqueName

	// Audit - Get user safely
	userId := "unknown"
	if userVal := r.Context().Value(SessionUserKey); userVal != nil {
		if userStr, ok := userVal.(string); ok {
			userId = userStr
		}
	}

	s.store.LogActivity(r.Context(), "branding", 0, "logo_uploaded", map[string]string{"filename": handler.Filename, "saved_as": uniqueName}, s.getClientIP(r))
	s.store.LogActivity(r.Context(), "admin", 0, "upload_logo", map[string]string{"file": handler.Filename, "by": userId}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"logo_url": logoURL})
	log.Printf("[UPLOAD] Response sent: %s", logoURL)
}

// handleGetUsers récupère la liste des utilisateurs (pour futur)
func (s *Server) handleGetUsers(w http.ResponseWriter, r *http.Request) {
	// TODO: Implémenter la gestion des utilisateurs
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]domain.User{})
}

// handleAdminStats retourne les statistiques pour le dashboard admin
func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Récupérer les statistiques de base
	wines, _ := s.store.GetWines(ctx)
	caves, _ := s.store.GetCaves(ctx)
	alerts, _ := s.store.GetAlerts(ctx)

	stats := map[string]interface{}{
		"total_wines":   len(wines),
		"total_caves":   len(caves),
		"active_alerts": len(alerts),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
