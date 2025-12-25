package domain

import "time"

// TobaccoAlert représente une alerte pour un produit tabac
type TobaccoAlert struct {
	ID          int64      `json:"id"`
	TobaccoID   int64      `json:"tobacco_id"`
	AlertType   string     `json:"alert_type"` // low_stock
	Status      string     `json:"status"`     // active, dismissed
	CreatedAt   time.Time  `json:"created_at"`
	DismissedAt *time.Time `json:"dismissed_at,omitempty"`
}
