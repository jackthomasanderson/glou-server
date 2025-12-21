package domain

import "time"

// ActivityLogEntry représente une entrée dans le journal d'activités
type ActivityLogEntry struct {
	ID         int64     `json:"id"`
	EntityType string    `json:"entity_type"` // "wine", "cave", "cell", "alert", "consumption"
	EntityID   int64     `json:"entity_id"`
	Action     string    `json:"action"`  // "created", "updated", "deleted", "tasted"
	Details    string    `json:"details"` // JSON avec les changements
	IPAddress  string    `json:"ip_address"`
	CreatedAt  time.Time `json:"created_at"`
}
