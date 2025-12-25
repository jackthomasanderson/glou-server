package store

import (
	"context"
	"fmt"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// GenerateTobaccoAlerts creates alerts for tobacco products based on conditions
// - low_stock alert if quantity < 2
func (s *Store) GenerateTobaccoAlerts(ctx context.Context) error {
	lowStockThreshold := 2

	// Get all tobacco products
	tobaccos, err := s.GetTobaccos(ctx)
	if err != nil {
		return fmt.Errorf("failed to get tobaccos: %w", err)
	}

	for _, tobacco := range tobaccos {
		// Check if alert exists for this tobacco
		existingAlerts, err := s.GetAlertsByTobaccoID(ctx, tobacco.ID)
		if err != nil {
			return fmt.Errorf("failed to get alerts for tobacco %d: %w", tobacco.ID, err)
		}

		existingAlertTypes := make(map[string]bool)
		for _, alert := range existingAlerts {
			if alert.Status == "active" {
				existingAlertTypes[alert.AlertType] = true
			}
		}

		// Low stock alert
		if tobacco.Quantity < lowStockThreshold && !existingAlertTypes["low_stock"] {
			alert := &domain.TobaccoAlert{
				TobaccoID: tobacco.ID,
				AlertType: "low_stock",
				Status:    "active",
				CreatedAt: time.Now(),
			}
			_, err := s.CreateTobaccoAlert(ctx, alert)
			if err != nil {
				return fmt.Errorf("failed to create low_stock alert for tobacco %d: %w", tobacco.ID, err)
			}
		}
	}

	return nil
}

// GetAlertsByTobaccoID retrieves all alerts for a specific tobacco product
func (s *Store) GetAlertsByTobaccoID(ctx context.Context, tobaccoID int64) ([]*domain.TobaccoAlert, error) {
	query := `SELECT id, tobacco_id, alert_type, status, created_at FROM tobacco_alerts WHERE tobacco_id = ?`
	rows, err := s.Db.QueryContext(ctx, query, tobaccoID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tobacco alerts: %w", err)
	}
	defer rows.Close()

	var alerts []*domain.TobaccoAlert
	for rows.Next() {
		alert := &domain.TobaccoAlert{}
		err := rows.Scan(&alert.ID, &alert.TobaccoID, &alert.AlertType, &alert.Status, &alert.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan tobacco alert: %w", err)
		}
		alerts = append(alerts, alert)
	}

	return alerts, rows.Err()
}

// CreateTobaccoAlert creates a new tobacco alert
func (s *Store) CreateTobaccoAlert(ctx context.Context, alert *domain.TobaccoAlert) (int64, error) {
	query := `INSERT INTO tobacco_alerts (tobacco_id, alert_type, status, created_at) VALUES (?, ?, ?, ?)`
	result, err := s.Db.ExecContext(ctx, query, alert.TobaccoID, alert.AlertType, alert.Status, time.Now())
	if err != nil {
		return 0, fmt.Errorf("failed to create tobacco alert: %w", err)
	}
	return result.LastInsertId()
}

// GetTobaccoAlerts retrieves all active tobacco alerts
func (s *Store) GetTobaccoAlerts(ctx context.Context) ([]*domain.TobaccoAlert, error) {
	query := `SELECT id, tobacco_id, alert_type, status, created_at FROM tobacco_alerts WHERE status = 'active' ORDER BY created_at DESC`
	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query tobacco alerts: %w", err)
	}
	defer rows.Close()

	alerts := make([]*domain.TobaccoAlert, 0)
	for rows.Next() {
		alert := &domain.TobaccoAlert{}
		err := rows.Scan(&alert.ID, &alert.TobaccoID, &alert.AlertType, &alert.Status, &alert.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan tobacco alert: %w", err)
		}
		alerts = append(alerts, alert)
	}

	return alerts, rows.Err()
}

// DismissTobaccoAlert marks a tobacco alert as dismissed
func (s *Store) DismissTobaccoAlert(ctx context.Context, alertID int64) error {
	query := `UPDATE tobacco_alerts SET status = 'dismissed', dismissed_at = ? WHERE id = ?`
	_, err := s.Db.ExecContext(ctx, query, time.Now(), alertID)
	return err
}
