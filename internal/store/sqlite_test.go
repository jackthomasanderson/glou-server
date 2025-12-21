package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// TestCreateWine tests creating a new wine
func TestCreateWine(t *testing.T) {
	tmpfile, err := os.CreateTemp("", "glou-test-*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	tmpfile.Close()
	defer os.Remove(tmpfile.Name())

	store, err := New(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	wine := &domain.Wine{
		Name:     "Château Margaux",
		Region:   "Bordeaux",
		Vintage:  2015,
		WineType: "Red",
		Quantity: 5,
	}

	id, err := store.CreateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to create wine: %v", err)
	}

	if id <= 0 {
		t.Error("Expected wine ID > 0")
	}

	// Retrieve the wine
	created, err := store.GetWineByID(ctx, id)
	if err != nil {
		t.Fatalf("Failed to get wine: %v", err)
	}

	if created.Name != wine.Name {
		t.Errorf("Expected name %s, got %s", wine.Name, created.Name)
	}
	if created.Quantity != wine.Quantity {
		t.Errorf("Expected quantity %d, got %d", wine.Quantity, created.Quantity)
	}
}

// TestUpdateWine tests updating a wine
func TestUpdateWine(t *testing.T) {
	tmpfile, err := os.CreateTemp("", "glou-test-*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	tmpfile.Close()
	defer os.Remove(tmpfile.Name())

	store, err := New(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// Create initial wine
	wine := &domain.Wine{
		Name:     "Château Lafite",
		Region:   "Bordeaux",
		Vintage:  2010,
		WineType: "Red",
		Quantity: 3,
	}

	id, err := store.CreateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to create wine: %v", err)
	}

	// Update the wine
	wine.ID = id
	wine.Quantity = 2
	wine.Comments = "Excellent condition"

	err = store.UpdateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to update wine: %v", err)
	}

	// Verify update
	updated, err := store.GetWineByID(ctx, id)
	if err != nil {
		t.Fatalf("Failed to get wine: %v", err)
	}

	if updated.Quantity != 2 {
		t.Errorf("Expected quantity 2, got %d", updated.Quantity)
	}

	if updated.Comments != "Excellent condition" {
		t.Errorf("Expected comments 'Excellent condition', got '%s'", updated.Comments)
	}
}

// TestGetWines tests retrieving all wines with all fields
func TestGetWines(t *testing.T) {
	tmpfile, err := os.CreateTemp("", "glou-test-*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	tmpfile.Close()
	defer os.Remove(tmpfile.Name())

	store, err := New(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// Create wine with extended fields
	price := float32(45.50)
	rating := float32(4.5)
	alcohol := float32(13.5)
	wine := &domain.Wine{
		Name:         "Test Wine",
		Region:       "Bordeaux",
		Vintage:      2015,
		WineType:     "Red",
		Quantity:     5,
		Producer:     "Test Producer",
		AlcoholLevel: &alcohol,
		Price:        &price,
		Rating:       &rating,
		Comments:     "Great wine",
	}

	_, err = store.CreateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to create wine: %v", err)
	}

	// Get all wines
	wines, err := store.GetWines(ctx)
	if err != nil {
		t.Fatalf("Failed to get wines: %v", err)
	}

	if len(wines) != 1 {
		t.Errorf("Expected 1 wine, got %d", len(wines))
	}

	// Verify extended fields are populated
	w := wines[0]
	if w.Producer != "Test Producer" {
		t.Errorf("Expected producer 'Test Producer', got '%s'", w.Producer)
	}
	if w.Rating == nil || *w.Rating != rating {
		t.Error("Rating not properly retrieved")
	}
	if w.AlcoholLevel == nil || *w.AlcoholLevel != alcohol {
		t.Error("AlcoholLevel not properly retrieved")
	}
	if w.Price == nil || *w.Price != price {
		t.Error("Price not properly retrieved")
	}
}

// TestDeleteWine tests deleting a wine
func TestDeleteWine(t *testing.T) {
	tmpfile, err := os.CreateTemp("", "glou-test-*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	tmpfile.Close()
	defer os.Remove(tmpfile.Name())

	store, err := New(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	wine := &domain.Wine{
		Name:     "To Delete",
		Region:   "Test Region",
		Vintage:  2015,
		WineType: "Red",
		Quantity: 1,
	}

	id, err := store.CreateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to create wine: %v", err)
	}

	// Delete wine
	err = store.DeleteWine(ctx, id)
	if err != nil {
		t.Fatalf("Failed to delete wine: %v", err)
	}

	// Verify deletion
	_, err = store.GetWineByID(ctx, id)
	if err == nil {
		t.Error("Expected error when getting deleted wine")
	}
}

// TestCreateAlert tests creating an alert
func TestCreateAlert(t *testing.T) {
	tmpfile, err := os.CreateTemp("", "glou-test-*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	tmpfile.Close()
	defer os.Remove(tmpfile.Name())

	store, err := New(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// Create a wine first
	wine := &domain.Wine{
		Name:     "Test Wine",
		Region:   "Test Region",
		Vintage:  2015,
		WineType: "Red",
		Quantity: 1,
	}

	wineID, err := store.CreateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to create wine: %v", err)
	}

	// Create alert
	alert := &domain.Alert{
		WineID:    wineID,
		AlertType: "low_stock",
		Status:    "active",
		CreatedAt: time.Now(),
	}

	alertID, err := store.CreateAlert(ctx, alert)
	if err != nil {
		t.Fatalf("Failed to create alert: %v", err)
	}

	if alertID <= 0 {
		t.Error("Expected alert ID > 0")
	}

	// Verify alert creation with GetAlertsByWineID
	alerts, err := store.GetAlertsByWineID(ctx, wineID)
	if err != nil {
		t.Fatalf("Failed to get alerts: %v", err)
	}

	if len(alerts) != 1 {
		t.Errorf("Expected 1 alert, got %d", len(alerts))
	}

	if alerts[0].AlertType != "low_stock" {
		t.Errorf("Expected alert type 'low_stock', got '%s'", alerts[0].AlertType)
	}
}
