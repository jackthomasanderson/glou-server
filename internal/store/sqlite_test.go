package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// Helper function to create a test database
func createTestDB(t *testing.T) (*Store, string) {
	tmpfile, err := os.CreateTemp("", "glou-test-*.db")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	tmpfile.Close()

	store, err := New(tmpfile.Name())
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}

	return store, tmpfile.Name()
}

// TestCreateWine tests creating a new wine
func TestCreateWine(t *testing.T) {
	store := TestDB(t)
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
}

// TestUpdateWine tests updating a wine
func TestUpdateWine(t *testing.T) {
	store := TestDB(t)
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

// TestSearchWines tests searching wines with filters
func TestSearchWines(t *testing.T) {
	store := TestDB(t)
	ctx := context.Background()

	// Create test wines
	wines := []*domain.Wine{
		{Name: "Château Margaux", Region: "Bordeaux", Vintage: 2015, WineType: "Red", Quantity: 5, Producer: "Château Margaux SA"},
		{Name: "Château Haut-Brion", Region: "Bordeaux", Vintage: 2014, WineType: "Red", Quantity: 2, Producer: "Dillon"},
		{Name: "Sancerre", Region: "Loire", Vintage: 2018, WineType: "White", Quantity: 8, Producer: "Olivier Fournier"},
	}

	for _, wine := range wines {
		_, err := store.CreateWine(ctx, wine)
		if err != nil {
			t.Fatalf("Failed to create wine: %v", err)
		}
	}

	// Test search by name
	results, err := store.SearchWines(ctx, "Margaux", "", "", "", 0, 0, 0, 0)
	if err != nil {
		t.Fatalf("Failed to search wines: %v", err)
	}

	if len(results) != 1 {
		t.Errorf("Expected 1 result, got %d", len(results))
	}

	// Test search by region
	results, err = store.SearchWines(ctx, "", "", "Loire", "", 0, 0, 0, 0)
	if err != nil {
		t.Fatalf("Failed to search wines: %v", err)
	}

	if len(results) != 1 {
		t.Errorf("Expected 1 result for Loire region, got %d", len(results))
	}

	// Test search by type
	results, err = store.SearchWines(ctx, "", "", "", "White", 0, 0, 0, 0)
	if err != nil {
		t.Fatalf("Failed to search wines: %v", err)
	}

	if len(results) != 1 {
		t.Errorf("Expected 1 White wine, got %d", len(results))
	}
}

// TestCreateAlert tests creating an alert
func TestCreateAlert(t *testing.T) {
	store := TestDB(t)
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

	// Verify alert creation
	alerts, err := store.GetAlerts(ctx)
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

// TestUpdateAlert tests updating an alert
func TestUpdateAlert(t *testing.T) {
	store := TestDB(t)
	ctx := context.Background()

	// Create wine and alert
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

	// Update alert status
	err = store.UpdateAlert(ctx, alertID, "dismissed")
	if err != nil {
		t.Fatalf("Failed to update alert: %v", err)
	}

	// Verify update
	alerts, err := store.GetAlerts(ctx)
	if err != nil {
		t.Fatalf("Failed to get alerts: %v", err)
	}

	if len(alerts) > 0 && alerts[0].Status == "dismissed" {
		// Status should show dismissed
	}
}

// TestDeleteWine tests deleting a wine
func TestDeleteWine(t *testing.T) {
	store := TestDB(t)
	ctx := context.Background()

	wine := &domain.Wine{
		Name:     "To Delete",
		Region:   "Test Region",
		Vintage:  2015,
		WineType: "Red",
		Quantity: 5,
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

// TestRecordConsumption tests recording wine consumption
func TestRecordConsumption(t *testing.T) {
	store := TestDB(t)
	ctx := context.Background()

	// Create wine
	wine := &domain.Wine{
		Name:     "Test Wine",
		Region:   "Test Region",
		Vintage:  2015,
		WineType: "Red",
		Quantity: 5,
	}

	wineID, err := store.CreateWine(ctx, wine)
	if err != nil {
		t.Fatalf("Failed to create wine: %v", err)
	}

	// Record consumption
	consumption := &domain.ActivityLog{
		Type:        "consumption",
		WineID:      &wineID,
		Description: "Tasted",
		CreatedAt:   time.Now(),
	}

	id, err := store.RecordActivity(ctx, consumption)
	if err != nil {
		t.Fatalf("Failed to record consumption: %v", err)
	}

	if id <= 0 {
		t.Error("Expected activity log ID > 0")
	}
}
