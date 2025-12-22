package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
)

// handleExportJSON exporte toutes les données en JSON
func (s *Server) handleExportJSON(w http.ResponseWriter, r *http.Request) {
	// Audit log
	if _, ok := getUserFromContext(r.Context()); ok {
		s.store.LogActivity(r.Context(), "export", 0, "export_json", map[string]string{"path": "/api/export/json"}, s.getClientIP(r))
	}
	data, err := s.store.ExportJSON(r.Context())
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to export data", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=glou-export.json")
	w.Write(data)
}

// handleExportWinesCSV exporte les vins en CSV
func (s *Server) handleExportWinesCSV(w http.ResponseWriter, r *http.Request) {
	if _, ok := getUserFromContext(r.Context()); ok {
		s.store.LogActivity(r.Context(), "export", 0, "export_wines_csv", map[string]string{"path": "/api/export/wines-csv"}, s.getClientIP(r))
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=glou-wines.csv")

	if err := s.store.ExportWinesCSV(r.Context(), w); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to export wines", err)
	}
}

// handleExportCavesCSV exporte les caves en CSV
func (s *Server) handleExportCavesCSV(w http.ResponseWriter, r *http.Request) {
	if _, ok := getUserFromContext(r.Context()); ok {
		s.store.LogActivity(r.Context(), "export", 0, "export_caves_csv", map[string]string{"path": "/api/export/caves-csv"}, s.getClientIP(r))
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=glou-caves.csv")

	if err := s.store.ExportCavesCSV(r.Context(), w); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to export caves", err)
	}
}

// handleExportTastingHistoryCSV exporte l'historique en CSV
func (s *Server) handleExportTastingHistoryCSV(w http.ResponseWriter, r *http.Request) {
	if _, ok := getUserFromContext(r.Context()); ok {
		s.store.LogActivity(r.Context(), "export", 0, "export_tasting_history_csv", map[string]string{"path": "/api/export/tasting-history-csv"}, s.getClientIP(r))
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=glou-tasting-history.csv")

	if err := s.store.ExportTastingHistoryCSV(r.Context(), w); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to export tasting history", err)
	}
}

// handleImportJSON importe les données depuis un JSON
func (s *Server) handleImportJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.respondError(w, http.StatusMethodNotAllowed, "Only POST allowed", nil)
		return
	}

	// Limiter la taille de l'upload à 50MB
	r.Body = http.MaxBytesReader(w, r.Body, 50*1024*1024)
	defer r.Body.Close()

	data, err := io.ReadAll(r.Body)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Failed to read file", err)
		return
	}

	if err := s.store.ImportJSON(r.Context(), data); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to import data", err)
		return
	}

	if _, ok := getUserFromContext(r.Context()); ok {
		s.store.LogActivity(r.Context(), "import", 0, "import_json", map[string]int{"bytes": len(data)}, s.getClientIP(r))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Data imported successfully",
	})
}

// handleGetActivityLog récupère le journal d'activités
func (s *Server) handleGetActivityLog(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	entityType := r.URL.Query().Get("entity_type")

	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}

	offset := 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	var entityTypePtr *string
	if entityType != "" {
		entityTypePtr = &entityType
	}

	entries, err := s.store.GetActivityLog(r.Context(), entityTypePtr, limit, offset)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch activity log", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(entries)
}

// handleGetEntityActivityLog récupère l'historique d'une entité
func (s *Server) handleGetEntityActivityLog(w http.ResponseWriter, r *http.Request) {
	entityType := r.PathValue("type")
	idStr := r.PathValue("id")

	if entityType == "" || idStr == "" {
		s.respondError(w, http.StatusBadRequest, "Missing entity_type or id", nil)
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	entries, err := s.store.GetActivityLogForEntity(r.Context(), entityType, id)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to fetch activity log", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(entries)
}
