package main

import (
	"encoding/json"
	"net/http"

	"github.com/romain/glou-server/internal/enricher"
)

// EnrichByBarcodeRequest represents a barcode enrichment request
type EnrichByBarcodeRequest struct {
	Barcode string `json:"barcode"`
}

// EnrichByNameRequest represents a name-based enrichment request
type EnrichByNameRequest struct {
	Name     string `json:"name"`
	Producer string `json:"producer,omitempty"`
	Vintage  string `json:"vintage,omitempty"`
}

// EnrichSpiritRequest represents a spirit/cocktail enrichment request
type EnrichSpiritRequest struct {
	Name   string `json:"name"`
	Source string `json:"source,omitempty"` // "cocktail", "beer", or empty for auto-detect
}

// handleEnrichByBarcode enriches wine by barcode (EAN)
func handleEnrichByBarcode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	var req EnrichByBarcodeRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Barcode == "" {
		http.Error(w, "Barcode is required", http.StatusBadRequest)
		return
	}

	// Create enricher
	we := enricher.NewWineEnricher()

	// Try barcode lookup first (Open Food Facts)
	data, err := we.EnrichByBarcode(ctx, req.Barcode)
	if err != nil {
		// If barcode lookup fails, try as a search query
		data, err = we.EnrichByName(ctx, req.Barcode, "", "")
		if err != nil {
			http.Error(w, "No data found for this barcode", http.StatusNotFound)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// handleEnrichByName enriches wine by name
func handleEnrichByName(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	var req EnrichByNameRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Wine name is required", http.StatusBadRequest)
		return
	}

	// Create enricher
	we := enricher.NewWineEnricher()

	// Enrich by name
	data, err := we.EnrichByName(ctx, req.Name, req.Producer, req.Vintage)
	if err != nil {
		http.Error(w, "No data found for this wine", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// handleEnrichSpirit enriches spirits and cocktails
func handleEnrichSpirit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	var req EnrichSpiritRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Spirit/cocktail name is required", http.StatusBadRequest)
		return
	}

	// Create enricher
	we := enricher.NewWineEnricher()

	// Enrich spirit
	data, err := we.EnrichSpirit(ctx, req.Name)
	if err != nil {
		http.Error(w, "No data found for this spirit", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// handleBulkEnrich enriches multiple wines at once
func handleBulkEnrich(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	var requests []EnrichByNameRequest

	if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Create enricher
	we := enricher.NewWineEnricher()

	// Enrich all
	results := make([]*enricher.EnrichedWineData, 0, len(requests))
	for _, req := range requests {
		data, _ := we.EnrichByName(ctx, req.Name, req.Producer, req.Vintage)
		if data != nil {
			results = append(results, data)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":   len(results),
		"results": results,
	})
}

// handleEnrichImageBarcode detects and reads barcode from image
func handleEnrichImageBarcode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	var req EnrichByBarcodeRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Barcode == "" {
		http.Error(w, "Image data is required", http.StatusBadRequest)
		return
	}

	// Create enricher
	we := enricher.NewWineEnricher()

	// Detect barcode in image
	barcodeResult, err := we.DetectBarcodeInImage(ctx, req.Barcode)
	if err != nil || barcodeResult == nil || barcodeResult.Barcode == "" {
		http.Error(w, "No barcode detected in image", http.StatusNotFound)
		return
	}

	// Now enrich using the detected barcode
	data, err := we.EnrichByBarcode(ctx, barcodeResult.Barcode)
	if err != nil {
		http.Error(w, "Could not enrich from detected barcode", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// handleEnrichImageRecognize recognizes wine from bottle label image
func handleEnrichImageRecognize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	var req struct {
		Image string `json:"image"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Image == "" {
		http.Error(w, "Image data is required", http.StatusBadRequest)
		return
	}

	// Create enricher
	we := enricher.NewWineEnricher()

	// Recognize wine from image
	data, err := we.RecognizeWineLabel(ctx, req.Image)
	if err != nil {
		http.Error(w, "Could not recognize wine from image", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
