package store

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// ExportData représente l'export complet des données
type ExportData struct {
	ExportedAt string                       `json:"exported_at"`
	Version    string                       `json:"version"`
	Caves      []*domain.Cave               `json:"caves"`
	Cells      []*domain.Cell               `json:"cells"`
	Wines      []*domain.Wine               `json:"wines"`
	Alerts     []*domain.Alert              `json:"alerts"`
	History    []*domain.ConsumptionHistory `json:"consumption_history"`
}

// ExportJSON exporte toutes les données en JSON
func (s *Store) ExportJSON(ctx context.Context) ([]byte, error) {
	caves, err := s.GetCaves(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch caves: %w", err)
	}

	cells, err := s.GetAllCells(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch cells: %w", err)
	}

	wines, err := s.GetWines(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch wines: %w", err)
	}

	alerts, err := s.GetAlerts(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch alerts: %w", err)
	}

	history, err := s.GetAllConsumptionHistory(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch consumption history: %w", err)
	}

	exportData := ExportData{
		ExportedAt: time.Now().Format(time.RFC3339),
		Version:    "1.0",
		Caves:      caves,
		Cells:      cells,
		Wines:      wines,
		Alerts:     alerts,
		History:    history,
	}

	data, err := json.MarshalIndent(exportData, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return data, nil
}

// ExportWinesCSV exporte les vins en CSV
func (s *Store) ExportWinesCSV(ctx context.Context, w io.Writer) error {
	wines, err := s.GetWines(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch wines: %w", err)
	}

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// En-têtes
	headers := []string{
		"ID", "Name", "Region", "Vintage", "Type", "Quantity", "Producer",
		"Alcohol Level", "Price", "Rating", "Comments", "Consumed",
		"Min Apogee Date", "Max Apogee Date", "Cell ID", "Created At",
	}
	if err := writer.Write(headers); err != nil {
		return fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Données
	for _, wine := range wines {
		row := []string{
			fmt.Sprintf("%d", wine.ID),
			wine.Name,
			wine.Region,
			fmt.Sprintf("%d", wine.Vintage),
			wine.WineType,
			fmt.Sprintf("%d", wine.Quantity),
			wine.Producer,
			fmt.Sprintf("%v", wine.AlcoholLevel),
			fmt.Sprintf("%v", wine.Price),
			fmt.Sprintf("%v", wine.Rating),
			wine.Comments,
			fmt.Sprintf("%d", wine.Consumed),
			formatDate(wine.MinApogeeDate),
			formatDate(wine.MaxApogeeDate),
			formatInt64Ptr(wine.CellID),
			wine.CreatedAt.Format(time.RFC3339),
		}
		if err := writer.Write(row); err != nil {
			return fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	return nil
}

// ExportCavesCSV exporte les caves en CSV
func (s *Store) ExportCavesCSV(ctx context.Context, w io.Writer) error {
	caves, err := s.GetCaves(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch caves: %w", err)
	}

	writer := csv.NewWriter(w)
	defer writer.Flush()

	headers := []string{"ID", "Name", "Model", "Total Capacity", "Current Count", "Created At"}
	if err := writer.Write(headers); err != nil {
		return fmt.Errorf("failed to write CSV header: %w", err)
	}

	for _, cave := range caves {
		model := ""
		if cave.Model != nil {
			model = *cave.Model
		}
		row := []string{
			fmt.Sprintf("%d", cave.ID),
			cave.Name,
			model,
			fmt.Sprintf("%d", cave.Capacity),
			fmt.Sprintf("%d", cave.Current),
			cave.CreatedAt.Format(time.RFC3339),
		}
		if err := writer.Write(row); err != nil {
			return fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	return nil
}

// ExportTastingHistoryCSV exporte l'historique de dégustation en CSV
func (s *Store) ExportTastingHistoryCSV(ctx context.Context, w io.Writer) error {
	history, err := s.GetAllConsumptionHistory(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch consumption history: %w", err)
	}

	writer := csv.NewWriter(w)
	defer writer.Flush()

	headers := []string{"ID", "Wine ID", "Wine Name", "Quantity Consumed", "Rating", "Notes", "Tasting Date", "Created At"}
	if err := writer.Write(headers); err != nil {
		return fmt.Errorf("failed to write CSV header: %w", err)
	}

	for _, entry := range history {
		wine, _ := s.GetWineByID(ctx, entry.WineID)
		wineName := ""
		if wine != nil {
			wineName = wine.Name
		}

		row := []string{
			fmt.Sprintf("%d", entry.ID),
			fmt.Sprintf("%d", entry.WineID),
			wineName,
			fmt.Sprintf("%d", entry.Quantity),
			fmt.Sprintf("%v", entry.Rating),
			entry.Comment,
			entry.Date.Format(time.DateOnly),
			entry.CreatedAt.Format(time.RFC3339),
		}
		if err := writer.Write(row); err != nil {
			return fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	return nil
}

// ImportJSON importe les données depuis un JSON
func (s *Store) ImportJSON(ctx context.Context, data []byte) error {
	var importData ExportData
	if err := json.Unmarshal(data, &importData); err != nil {
		return fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	tx, err := s.Db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Importer les caves
	caveMap := make(map[int64]int64) // old ID -> new ID
	for _, cave := range importData.Caves {
		result, err := tx.ExecContext(ctx,
			`INSERT INTO caves (name, model, location, capacity, current, created_at) 
			 VALUES (?, ?, ?, ?, ?, ?)`,
			cave.Name, cave.Model, cave.Location, cave.Capacity, cave.Current, cave.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("failed to import cave: %w", err)
		}
		newID, _ := result.LastInsertId()
		caveMap[cave.ID] = newID
	}

	// Importer les cells
	cellMap := make(map[int64]int64)
	for _, cell := range importData.Cells {
		newCaveID := caveMap[cell.CaveID]
		result, err := tx.ExecContext(ctx,
			`INSERT INTO cells (cave_id, location, capacity, current, created_at) 
			 VALUES (?, ?, ?, ?, ?)`,
			newCaveID, cell.Location, cell.Capacity, cell.Current, cell.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("failed to import cell: %w", err)
		}
		newID, _ := result.LastInsertId()
		cellMap[cell.ID] = newID
	}

	// Importer les wines
	wineMap := make(map[int64]int64)
	for _, wine := range importData.Wines {
		var newCellID *int64
		if wine.CellID != nil {
			id := cellMap[*wine.CellID]
			newCellID = &id
		}

		result, err := tx.ExecContext(ctx,
			`INSERT INTO wines (name, region, vintage, type, quantity, cell_id, producer, 
			 alcohol_level, price, rating, comments, consumed, min_apogee_date, 
			 max_apogee_date, consumption_date, created_at) 
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			wine.Name, wine.Region, wine.Vintage, wine.WineType, wine.Quantity, newCellID,
			wine.Producer, wine.AlcoholLevel, wine.Price, wine.Rating, wine.Comments,
			wine.Consumed, wine.MinApogeeDate, wine.MaxApogeeDate, wine.ConsumptionDate,
			wine.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("failed to import wine: %w", err)
		}
		newID, _ := result.LastInsertId()
		wineMap[wine.ID] = newID
	}

	// Importer les alertes
	for _, alert := range importData.Alerts {
		newWineID := wineMap[alert.WineID]
		_, err := tx.ExecContext(ctx,
			`INSERT INTO alerts (wine_id, alert_type, status, dismissed_at, created_at) 
			 VALUES (?, ?, ?, ?, ?)`,
			newWineID, alert.AlertType, alert.Status, alert.DismissedAt, alert.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("failed to import alert: %w", err)
		}
	}

	// Importer l'historique
	for _, entry := range importData.History {
		newWineID := wineMap[entry.WineID]
		_, err := tx.ExecContext(ctx,
			`INSERT INTO consumption_history (wine_id, quantity, rating, comment, reason, date, created_at) 
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			newWineID, entry.Quantity, entry.Rating, entry.Comment, entry.Reason, entry.Date, entry.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("failed to import consumption history: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Helpers
func formatDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.DateOnly)
}

func formatInt64Ptr(i *int64) string {
	if i == nil {
		return ""
	}
	return fmt.Sprintf("%d", *i)
}

// GetAllCells récupère toutes les cellules
func (s *Store) GetAllCells(ctx context.Context) ([]*domain.Cell, error) {
	rows, err := s.Db.QueryContext(ctx, `
		SELECT id, cave_id, location, capacity, current, created_at FROM cells
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cells []*domain.Cell
	for rows.Next() {
		var cell domain.Cell
		if err := rows.Scan(&cell.ID, &cell.CaveID, &cell.Location, &cell.Capacity, &cell.Current, &cell.CreatedAt); err != nil {
			return nil, err
		}
		cells = append(cells, &cell)
	}

	return cells, rows.Err()
}

// GetAllConsumptionHistory récupère tout l'historique de consommation
func (s *Store) GetAllConsumptionHistory(ctx context.Context) ([]*domain.ConsumptionHistory, error) {
	rows, err := s.Db.QueryContext(ctx, `
		SELECT id, wine_id, quantity, rating, comment, reason, date, created_at FROM consumption_history
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []*domain.ConsumptionHistory
	for rows.Next() {
		var entry domain.ConsumptionHistory
		if err := rows.Scan(&entry.ID, &entry.WineID, &entry.Quantity, &entry.Rating, &entry.Comment, &entry.Reason, &entry.Date, &entry.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, &entry)
	}

	return history, rows.Err()
}
