package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// CreateTobacco inserts a new tobacco product
func (s *Store) CreateTobacco(ctx context.Context, t *domain.Tobacco) (int64, error) {
	query := `
	INSERT INTO tobaccos (name, brand, purchase_date, quantity, purchase_price, current_value, cave_id, cell_id, notes, origin_country, format, wrapper, binder, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := s.Db.ExecContext(ctx, query,
		t.Name, t.Brand, t.PurchaseDate, t.Quantity, t.PurchasePrice, t.CurrentValue, t.CaveID, t.CellID, t.Notes, t.OriginCountry, t.Format, t.Wrapper, t.Binder, time.Now(),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create tobacco: %w", err)
	}
	return result.LastInsertId()
}

// GetTobaccos fetches all tobacco products
func (s *Store) GetTobaccos(ctx context.Context) ([]*domain.Tobacco, error) {
	query := `
	SELECT id, name, brand, purchase_date, quantity, purchase_price, current_value, cave_id, cell_id, notes, origin_country, format, wrapper, binder, created_at
	FROM tobaccos
	ORDER BY created_at DESC
	`
	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query tobaccos: %w", err)
	}
	defer rows.Close()

	var items []*domain.Tobacco
	for rows.Next() {
		var t domain.Tobacco
		if err := rows.Scan(&t.ID, &t.Name, &t.Brand, &t.PurchaseDate, &t.Quantity, &t.PurchasePrice, &t.CurrentValue, &t.CaveID, &t.CellID, &t.Notes, &t.OriginCountry, &t.Format, &t.Wrapper, &t.Binder, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan tobacco: %w", err)
		}
		items = append(items, &t)
	}
	return items, rows.Err()
}

// GetTobaccoByID fetches a single tobacco product
func (s *Store) GetTobaccoByID(ctx context.Context, id int64) (*domain.Tobacco, error) {
	query := `
	SELECT id, name, brand, purchase_date, quantity, purchase_price, current_value, cave_id, cell_id, notes, origin_country, format, wrapper, binder, created_at
	FROM tobaccos WHERE id = ?
	`
	var t domain.Tobacco
	err := s.Db.QueryRowContext(ctx, query, id).Scan(&t.ID, &t.Name, &t.Brand, &t.PurchaseDate, &t.Quantity, &t.PurchasePrice, &t.CurrentValue, &t.CaveID, &t.CellID, &t.Notes, &t.OriginCountry, &t.Format, &t.Wrapper, &t.Binder, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("tobacco not found with id %d", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query tobacco: %w", err)
	}
	return &t, nil
}

// UpdateTobacco updates an existing tobacco product
func (s *Store) UpdateTobacco(ctx context.Context, t *domain.Tobacco) error {
	query := `
	UPDATE tobaccos SET name=?, brand=?, purchase_date=?, quantity=?, purchase_price=?, current_value=?, cave_id=?, cell_id=?, notes=?, origin_country=?, format=?, wrapper=?, binder=?
	WHERE id=?
	`
	result, err := s.Db.ExecContext(ctx, query, t.Name, t.Brand, t.PurchaseDate, t.Quantity, t.PurchasePrice, t.CurrentValue, t.CaveID, t.CellID, t.Notes, t.OriginCountry, t.Format, t.Wrapper, t.Binder, t.ID)
	if err != nil {
		return fmt.Errorf("failed to update tobacco: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return fmt.Errorf("tobacco not found with id %d", t.ID)
	}
	return nil
}

// DeleteTobacco deletes a tobacco product (or decrements quantity)
func (s *Store) DeleteTobacco(ctx context.Context, id int64) error {
	// Fetch current
	item, err := s.GetTobaccoByID(ctx, id)
	if err != nil {
		return err
	}
	if item.Quantity <= 1 {
		_, err := s.Db.ExecContext(ctx, `DELETE FROM tobaccos WHERE id = ?`, id)
		if err != nil {
			return fmt.Errorf("failed to delete tobacco: %w", err)
		}
		return nil
	}
	_, err = s.Db.ExecContext(ctx, `UPDATE tobaccos SET quantity = quantity - 1 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("failed to decrement tobacco: %w", err)
	}
	return nil
}
