package enricher

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// EnrichedWineData represents all enriched data about a wine from external APIs
type EnrichedWineData struct {
	Name         string    `json:"name"`
	Producer     string    `json:"producer"`
	Region       string    `json:"region"`
	Vintage      int       `json:"vintage,omitempty"`
	Type         string    `json:"type"`
	AlcoholLevel float32   `json:"alcohol_level,omitempty"`
	Description  string    `json:"description,omitempty"`
	Rating       float32   `json:"rating,omitempty"`
	Price        float32   `json:"price,omitempty"`
	ImageURL     string    `json:"image_url,omitempty"`
	SourceAPIs   []string  `json:"source_apis"` // Which APIs provided the data
	LastUpdated  time.Time `json:"last_updated"`
}

// WineEnricher manages wine data enrichment from multiple APIs
type WineEnricher struct {
	httpClient *http.Client
}

// NewWineEnricher creates a new enricher
func NewWineEnricher() *WineEnricher {
	return &WineEnricher{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// EnrichByBarcode searches for wine by EAN barcode
func (we *WineEnricher) EnrichByBarcode(ctx context.Context, barcode string) (*EnrichedWineData, error) {
	// Try Open Food Facts first (supports barcode)
	data, err := we.searchOpenFoodFacts(ctx, barcode)
	if err == nil && data != nil {
		data.SourceAPIs = append(data.SourceAPIs, "OpenFoodFacts")
		return data, nil
	}

	return nil, fmt.Errorf("barcode %s not found in any database", barcode)
}

// EnrichByName searches for wine by name
func (we *WineEnricher) EnrichByName(ctx context.Context, name, producer, vintage string) (*EnrichedWineData, error) {
	// Combine results from multiple sources
	data := &EnrichedWineData{
		Name:        name,
		Producer:    producer,
		LastUpdated: time.Now(),
	}

	// Try Snooth API
	snooth, _ := we.searchSnooth(ctx, name, producer, vintage)
	if snooth != nil {
		data.merge(snooth)
		data.SourceAPIs = append(data.SourceAPIs, "Snooth")
	}

	// Try Open Food Facts
	off, _ := we.searchOpenFoodFacts(ctx, name)
	if off != nil {
		data.merge(off)
		if !contains(data.SourceAPIs, "OpenFoodFacts") {
			data.SourceAPIs = append(data.SourceAPIs, "OpenFoodFacts")
		}
	}

	// Try Global Wine Score for ratings
	gws, _ := we.searchGlobalWineScore(ctx, name, producer, vintage)
	if gws != nil {
		if gws.Rating > 0 {
			data.Rating = gws.Rating
		}
		if !contains(data.SourceAPIs, "GlobalWineScore") {
			data.SourceAPIs = append(data.SourceAPIs, "GlobalWineScore")
		}
	}

	if len(data.SourceAPIs) == 0 {
		return nil, fmt.Errorf("wine '%s' not found", name)
	}

	return data, nil
}

// EnrichSpirit searches for spirits/cocktails by name
func (we *WineEnricher) EnrichSpirit(ctx context.Context, name string) (*EnrichedWineData, error) {
	// Try TheCocktailDB
	data, err := we.searchTheCocktailDB(ctx, name)
	if err == nil && data != nil {
		data.SourceAPIs = append(data.SourceAPIs, "TheCocktailDB")
		return data, nil
	}

	return nil, fmt.Errorf("spirit '%s' not found", name)
}

// merge combines enriched data, preferring non-empty values
func (e *EnrichedWineData) merge(other *EnrichedWineData) {
	if other == nil {
		return
	}
	if other.Name != "" && e.Name == "" {
		e.Name = other.Name
	}
	if other.Producer != "" && e.Producer == "" {
		e.Producer = other.Producer
	}
	if other.Region != "" && e.Region == "" {
		e.Region = other.Region
	}
	if other.Vintage > 0 && e.Vintage == 0 {
		e.Vintage = other.Vintage
	}
	if other.Type != "" && e.Type == "" {
		e.Type = other.Type
	}
	if other.AlcoholLevel > 0 && e.AlcoholLevel == 0 {
		e.AlcoholLevel = other.AlcoholLevel
	}
	if other.Description != "" && e.Description == "" {
		e.Description = other.Description
	}
	if other.Rating > 0 && e.Rating == 0 {
		e.Rating = other.Rating
	}
	if other.Price > 0 && e.Price == 0 {
		e.Price = other.Price
	}
	if other.ImageURL != "" && e.ImageURL == "" {
		e.ImageURL = other.ImageURL
	}
}

// Helper function to check if string is in slice
func contains(slice []string, item string) bool {
	for _, v := range slice {
		if v == item {
			return true
		}
	}
	return false
}

// makeRequest is a helper to make HTTP requests
func (we *WineEnricher) makeRequest(ctx context.Context, method, endpoint string, headers map[string]string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return nil, err
	}

	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := we.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return body, nil
}

// urlEncode safely encodes URL parameters
func urlEncode(value string) string {
	return url.QueryEscape(value)
}

// parseFloat safely parses float values
func parseFloat(v interface{}) float32 {
	switch val := v.(type) {
	case float64:
		return float32(val)
	case float32:
		return val
	case string:
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return float32(f)
	}
	return 0
}

// parseInt safely parses integer values
func parseInt(v interface{}) int {
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	case string:
		var i int
		fmt.Sscanf(val, "%d", &i)
		return i
	}
	return 0
}

// unmarshalJSON safely unmarshals JSON with error handling
func unmarshalJSON(data []byte, v interface{}) error {
	if len(data) == 0 {
		return fmt.Errorf("empty response")
	}
	return json.Unmarshal(data, v)
}
