package domain

import "time"

// Cave represents a wine cellar or storage location
type Cave struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Model     *string   `json:"model,omitempty"` // Pointer to allow nil
	Location  string    `json:"location"`
	Capacity  int       `json:"capacity"`
	Current   int       `json:"current"` // Current number of bottles
	CreatedAt time.Time `json:"created_at"`
}

// Cell represents a storage cell or compartment within a cave
type Cell struct {
	ID        int64     `json:"id"`
	CaveID    int64     `json:"cave_id"`
	Location  string    `json:"location"`
	Capacity  int       `json:"capacity"`
	Current   int       `json:"current"` // Current number of bottles
	CreatedAt time.Time `json:"created_at"`
}

// Wine represents a wine bottle (alias of Bottle for backward compatibility)
type Wine = Bottle

// Alert represents an alert for wine consumption or apogee
type Alert struct {
	ID          int64      `json:"id"`
	WineID      int64      `json:"wine_id"`
	AlertType   string     `json:"alert_type"` // low_stock, apogee_reached, apogee_ended
	Message     string     `json:"message"`
	Status      string     `json:"status"` // active, dismissed
	CreatedAt   time.Time  `json:"created_at"`
	DismissedAt *time.Time `json:"dismissed_at,omitempty"`
}

// ConsumptionHistory represents a wine consumption record
type ConsumptionHistory struct {
	ID        int64     `json:"id"`
	WineID    int64     `json:"wine_id"`
	Quantity  int       `json:"quantity"`         // Quantity consumed
	Comment   string    `json:"comment"`          // Tasting notes/comment
	Reason    string    `json:"reason"`           // Reason for consumption
	Rating    *float64  `json:"rating,omitempty"` // Rating
	Date      time.Time `json:"date"`             // Consumption date
	CreatedAt time.Time `json:"created_at"`
}
