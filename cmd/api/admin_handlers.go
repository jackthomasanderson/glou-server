package main

import (
	"encoding/json"
	"net/http"

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
		http.Error(w, "Failed to get settings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// handleUpdateSettings met à jour les paramètres
func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var settings *domain.Settings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.UpdateSettings(ctx, settings); err != nil {
		http.Error(w, "Failed to update settings", http.StatusInternalServerError)
		return
	}

	// Audit
	s.store.LogActivity(ctx, "admin", 0, "update_settings", map[string]string{"by": r.Context().Value(SessionUserKey).(string)}, s.getClientIP(r))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleUploadLogo gère l'upload du logo
func (s *Server) handleUploadLogo(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(5 * 1024 * 1024); err != nil { // 5MB max
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("logo")
	if err != nil {
		http.Error(w, "Failed to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// TODO: Sauvegarder le fichier dans assets/uploads/
	// Pour maintenant, retourner un chemin fictif
	logoURL := "/assets/uploads/" + handler.Filename

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"logo_url": logoURL})

	// Audit
	s.store.LogActivity(r.Context(), "admin", 0, "upload_logo", map[string]string{"file": handler.Filename, "by": r.Context().Value(SessionUserKey).(string)}, s.getClientIP(r))
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
