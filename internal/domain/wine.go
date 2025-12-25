package domain

import "time"

// Wine représente une bouteille de boisson dans la collection
type Wine struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`     // Nom du vin (ex: Château Margaux)
	Region    string    `json:"region"`   // Appellation (ex: Bordeaux)
	Vintage   int       `json:"vintage"`  // Millésime (ex: 2015)
	WineType  string    `json:"type"`     // Type: Red, White, Rosé, Sparkling
	Quantity  int       `json:"quantity"` // Nombre de bouteilles
	CellID    *int64    `json:"cell_id"`  // ID de l'emplacement (optionnel)
	CreatedAt time.Time `json:"created_at"`
	// Nouvelles fonctionnalités
	MinApogeeDate   *time.Time `json:"min_apogee_date"`  // Date min pour boire
	MaxApogeeDate   *time.Time `json:"max_apogee_date"`  // Date max pour boire
	Rating          *float32   `json:"rating"`           // Notation 0-5
	Comments        string     `json:"comments"`         // Commentaires/notes de dégustation
	Price           *float32   `json:"price"`            // Prix d'achat
	CurrentValue    *float32   `json:"current_value"`    // Valeur actuelle estimée
	Producer        string     `json:"producer"`         // Producteur
	AlcoholLevel    *float32   `json:"alcohol_level"`    // Degré alcoolique
	Consumed        int        `json:"consumed"`         // Nombre consommées
	ConsumptionDate *time.Time `json:"consumption_date"` // Date dernière consommation
}

// Cell représente un emplacement dans la cave
type Cell struct {
	ID        int64     `json:"id"`
	CaveID    int64     `json:"cave_id"`  // Référence à la cave
	Location  string    `json:"location"` // Description: "Étagère A, ligne 2"
	Capacity  int       `json:"capacity"` // Capacité maximale
	Current   int       `json:"current"`  // Bouteilles actuellement présentes
	CreatedAt time.Time `json:"created_at"`
}

// Cave représente une cave de collection de boissons
type Cave struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`     // Nom de la cave
	Model     *string   `json:"model"`    // Modèle (ex: La Sommelière) - optionnel
	Location  string    `json:"location"` // Localisation (ex: Maison principale, Maison de vacances)
	Capacity  int       `json:"capacity"` // Capacité totale
	Current   int       `json:"current"`  // Bouteilles actuelles
	CreatedAt time.Time `json:"created_at"`
}

// Alert représente une alerte vin
type Alert struct {
	ID          int64      `json:"id"`
	WineID      int64      `json:"wine_id"`
	AlertType   string     `json:"alert_type"` // "low_stock", "apogee_reached", "apogee_ended"
	Status      string     `json:"status"`     // "active", "dismissed"
	CreatedAt   time.Time  `json:"created_at"`
	DismissedAt *time.Time `json:"dismissed_at"`
}

// ConsumptionHistory enregistre l'historique des dégustations
type ConsumptionHistory struct {
	ID        int64     `json:"id"`
	WineID    int64     `json:"wine_id"`
	Quantity  int       `json:"quantity"` // Nombre de bouteilles dégustées
	Rating    *float32  `json:"rating"`   // Note donnée
	Comment   string    `json:"comment"`  // Impression de dégustation
	Reason    string    `json:"reason"`   // Raison: "vente", "dégustation", "perte", "cadeau"
	Date      time.Time `json:"date"`     // Date de dégustation
	CreatedAt time.Time `json:"created_at"`
}
