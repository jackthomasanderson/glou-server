package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/romain/glou-server/internal/domain"
	_ "modernc.org/sqlite"
)

// Store gère l'accès à la base de données SQLite
type Store struct {
	Db *sql.DB
}

// New initialise et retourne un Store
func New(dbPath string) (*Store, error) {
	// Ouvrir la connexion SQLite
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Vérifier la connexion
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	store := &Store{Db: db}

	// Initialiser le schéma
	if err := store.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return store, nil
}

// Close ferme la connexion à la base de données
func (s *Store) Close() error {
	if s.Db == nil {
		return nil
	}
	return s.Db.Close()
}

// initSchema crée les tables si elles n'existent pas
func (s *Store) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS caves (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		model TEXT NOT NULL,
		capacity INTEGER NOT NULL DEFAULT 100,
		current INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS cells (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		cave_id INTEGER NOT NULL,
		location TEXT NOT NULL,
		capacity INTEGER NOT NULL DEFAULT 1,
		current INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (cave_id) REFERENCES caves(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS wines (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		region TEXT NOT NULL,
		vintage INTEGER NOT NULL,
		type TEXT NOT NULL,
		quantity INTEGER NOT NULL DEFAULT 1,
		cell_id INTEGER,
		producer TEXT,
		alcohol_level REAL,
		price REAL,
		rating REAL,
		comments TEXT,
		consumed INTEGER NOT NULL DEFAULT 0,
		min_apogee_date DATE,
		max_apogee_date DATE,
		consumption_date DATE,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL
	);

	CREATE TABLE IF NOT EXISTS alerts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		wine_id INTEGER NOT NULL,
		alert_type TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'active',
		dismissed_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS consumption_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		wine_id INTEGER NOT NULL,
		quantity INTEGER NOT NULL,
		rating REAL,
		comment TEXT,
		reason TEXT,
		date DATE NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		app_title TEXT DEFAULT 'Glou',
		app_slogan TEXT DEFAULT 'Wine Management System',
		logo_url TEXT,
		favicon_url TEXT,
		support_email TEXT,
		theme_color TEXT DEFAULT '#007bff',
		secondary_color TEXT DEFAULT '#6c757d',
		accent_color TEXT DEFAULT '#28a745',
		dark_mode_default INTEGER DEFAULT 0,
		public_domain TEXT,
		public_protocol TEXT DEFAULT 'http',
		proxy_mode INTEGER DEFAULT 0,
		proxy_headers INTEGER DEFAULT 0,
		allow_registration INTEGER DEFAULT 0,
		require_approval INTEGER DEFAULT 0,
		enable_notifications INTEGER DEFAULT 1,
		maintenance_mode INTEGER DEFAULT 0,
		rows_per_page INTEGER DEFAULT 10,
		date_format TEXT DEFAULT 'YYYY-MM-DD',
		language TEXT DEFAULT 'en',
		max_request_body_size INTEGER DEFAULT 1048576,
		session_timeout INTEGER DEFAULT 1440,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS activity_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		entity_type TEXT NOT NULL,
		entity_id INTEGER NOT NULL,
		action TEXT NOT NULL,
		details TEXT,
		ip_address TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
	CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
	`

	if _, err := s.Db.Exec(schema); err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}

	return nil
}

// CreateWine insère un nouveau vin et retourne son ID
func (s *Store) CreateWine(ctx context.Context, wine *domain.Wine) (int64, error) {
	query := `
	INSERT INTO wines (name, region, vintage, type, quantity, cell_id, producer, 
		alcohol_level, price, rating, comments, consumed, min_apogee_date, 
		max_apogee_date, consumption_date, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := s.Db.ExecContext(ctx, query,
		wine.Name,
		wine.Region,
		wine.Vintage,
		wine.WineType,
		wine.Quantity,
		wine.CellID,
		wine.Producer,
		wine.AlcoholLevel,
		wine.Price,
		wine.Rating,
		wine.Comments,
		wine.Consumed,
		wine.MinApogeeDate,
		wine.MaxApogeeDate,
		wine.ConsumptionDate,
		time.Now(),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to create wine: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert id: %w", err)
	}

	return id, nil
}

// GetWines retourne la liste de tous les vins
func (s *Store) GetWines(ctx context.Context) ([]*domain.Wine, error) {
	query := `
	SELECT id, name, region, vintage, type, quantity, cell_id, producer, 
	       alcohol_level, price, rating, comments, consumed, min_apogee_date, 
	       max_apogee_date, consumption_date, created_at
	FROM wines
	ORDER BY created_at DESC
	`

	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query wines: %w", err)
	}
	defer rows.Close()

	wines := make([]*domain.Wine, 0)
	for rows.Next() {
		wine := &domain.Wine{}
		err := rows.Scan(
			&wine.ID,
			&wine.Name,
			&wine.Region,
			&wine.Vintage,
			&wine.WineType,
			&wine.Quantity,
			&wine.CellID,
			&wine.Producer,
			&wine.AlcoholLevel,
			&wine.Price,
			&wine.Rating,
			&wine.Comments,
			&wine.Consumed,
			&wine.MinApogeeDate,
			&wine.MaxApogeeDate,
			&wine.ConsumptionDate,
			&wine.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan wine row: %w", err)
		}
		wines = append(wines, wine)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating wine rows: %w", err)
	}

	return wines, nil
}

// GetWineByID retourne un vin par son ID
func (s *Store) GetWineByID(ctx context.Context, id int64) (*domain.Wine, error) {
	query := `
	SELECT id, name, region, vintage, type, quantity, cell_id, producer, 
	       alcohol_level, price, rating, comments, consumed, min_apogee_date, 
	       max_apogee_date, consumption_date, created_at
	FROM wines
	WHERE id = ?
	`

	wine := &domain.Wine{}
	err := s.Db.QueryRowContext(ctx, query, id).Scan(
		&wine.ID,
		&wine.Name,
		&wine.Region,
		&wine.Vintage,
		&wine.WineType,
		&wine.Quantity,
		&wine.CellID,
		&wine.Producer,
		&wine.AlcoholLevel,
		&wine.Price,
		&wine.Rating,
		&wine.Comments,
		&wine.Consumed,
		&wine.MinApogeeDate,
		&wine.MaxApogeeDate,
		&wine.ConsumptionDate,
		&wine.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("wine not found with id %d", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query wine by id: %w", err)
	}

	return wine, nil
}

// DeleteWine supprime un vin par son ID (consommation)
func (s *Store) DeleteWine(ctx context.Context, id int64) error {
	// Vérifier que le vin existe
	wine, err := s.GetWineByID(ctx, id)
	if err != nil {
		return err
	}

	if wine.Quantity <= 1 {
		// Supprimer complètement si c'était la dernière bouteille
		query := "DELETE FROM wines WHERE id = ?"
		result, err := s.Db.ExecContext(ctx, query, id)
		if err != nil {
			return fmt.Errorf("failed to delete wine: %w", err)
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("failed to get rows affected: %w", err)
		}

		if rowsAffected == 0 {
			return fmt.Errorf("wine not found with id %d", id)
		}
	} else {
		// Décrémenter la quantité
		query := "UPDATE wines SET quantity = quantity - 1 WHERE id = ?"
		result, err := s.Db.ExecContext(ctx, query, id)
		if err != nil {
			return fmt.Errorf("failed to update wine quantity: %w", err)
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("failed to get rows affected: %w", err)
		}

		if rowsAffected == 0 {
			return fmt.Errorf("wine not found with id %d", id)
		}
	}

	return nil
}

// SearchWines recherche les vins avec filtres
func (s *Store) SearchWines(ctx context.Context, filters map[string]interface{}) ([]*domain.Wine, error) {
	query := `SELECT id, name, region, vintage, type, quantity, cell_id, producer, alcohol_level, price, rating, comments, consumed, min_apogee_date, max_apogee_date, consumption_date, created_at FROM wines WHERE 1=1`
	var args []interface{}

	if name, ok := filters["name"].(string); ok && name != "" {
		query += ` AND name LIKE ?`
		args = append(args, "%"+name+"%")
	}
	if region, ok := filters["region"].(string); ok && region != "" {
		query += ` AND region LIKE ?`
		args = append(args, "%"+region+"%")
	}
	if wineType, ok := filters["type"].(string); ok && wineType != "" {
		query += ` AND type = ?`
		args = append(args, wineType)
	}
	if vintage, ok := filters["vintage"].(int); ok && vintage > 0 {
		query += ` AND vintage = ?`
		args = append(args, vintage)
	}

	query += ` ORDER BY created_at DESC`

	rows, err := s.Db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to search wines: %w", err)
	}
	defer rows.Close()

	wines := make([]*domain.Wine, 0)
	for rows.Next() {
		wine := &domain.Wine{}
		err := rows.Scan(
			&wine.ID, &wine.Name, &wine.Region, &wine.Vintage, &wine.WineType, &wine.Quantity, &wine.CellID,
			&wine.Producer, &wine.AlcoholLevel, &wine.Price, &wine.Rating, &wine.Comments, &wine.Consumed,
			&wine.MinApogeeDate, &wine.MaxApogeeDate, &wine.ConsumptionDate, &wine.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan wine: %w", err)
		}
		wines = append(wines, wine)
	}

	return wines, rows.Err()
}

// AddAlert crée une alerte vin
func (s *Store) AddAlert(ctx context.Context, alert *domain.Alert) (int64, error) {
	query := `INSERT INTO alerts (wine_id, alert_type, status) VALUES (?, ?, ?)`
	result, err := s.Db.ExecContext(ctx, query, alert.WineID, alert.AlertType, "active")
	if err != nil {
		return 0, fmt.Errorf("failed to create alert: %w", err)
	}
	return result.LastInsertId()
}

// GetAlerts récupère les alertes actives
func (s *Store) GetAlerts(ctx context.Context) ([]*domain.Alert, error) {
	query := `SELECT id, wine_id, alert_type, status, created_at FROM alerts WHERE status = 'active' ORDER BY created_at DESC`
	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query alerts: %w", err)
	}
	defer rows.Close()

	alerts := make([]*domain.Alert, 0)
	for rows.Next() {
		alert := &domain.Alert{}
		err := rows.Scan(&alert.ID, &alert.WineID, &alert.AlertType, &alert.Status, &alert.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan alert: %w", err)
		}
		alerts = append(alerts, alert)
	}

	return alerts, rows.Err()
}

// DismissAlert marque une alerte comme dismissée
func (s *Store) DismissAlert(ctx context.Context, alertID int64) error {
	query := `UPDATE alerts SET status = 'dismissed', dismissed_at = ? WHERE id = ?`
	_, err := s.Db.ExecContext(ctx, query, time.Now(), alertID)
	return err
}

// RecordConsumption enregistre une dégustation avec transaction
func (s *Store) RecordConsumption(ctx context.Context, consumption *domain.ConsumptionHistory) (int64, error) {
	// Begin transaction
	tx, err := s.Db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Insert consumption record
	query := `
	INSERT INTO consumption_history (wine_id, quantity, rating, comment, reason, date)
	VALUES (?, ?, ?, ?, ?, ?)
	`
	result, err := tx.ExecContext(ctx, query, consumption.WineID, consumption.Quantity, consumption.Rating, consumption.Comment, consumption.Reason, consumption.Date)
	if err != nil {
		return 0, fmt.Errorf("failed to record consumption: %w", err)
	}

	consumptionID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get consumption id: %w", err)
	}

	// Update wine quantity (within same transaction)
	updateQuery := `UPDATE wines SET quantity = quantity - ?, consumed = consumed + ? WHERE id = ?`
	_, err = tx.ExecContext(ctx, updateQuery, consumption.Quantity, consumption.Quantity, consumption.WineID)
	if err != nil {
		return 0, fmt.Errorf("failed to update wine quantity: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return consumptionID, nil
}

// GetConsumptionHistory récupère l'historique de dégustation d'un vin
func (s *Store) GetConsumptionHistory(ctx context.Context, wineID int64) ([]*domain.ConsumptionHistory, error) {
	query := `SELECT id, wine_id, quantity, rating, comment, reason, date, created_at FROM consumption_history WHERE wine_id = ? ORDER BY date DESC`
	rows, err := s.Db.QueryContext(ctx, query, wineID)
	if err != nil {
		return nil, fmt.Errorf("failed to query consumption history: %w", err)
	}
	defer rows.Close()

	history := make([]*domain.ConsumptionHistory, 0)
	for rows.Next() {
		h := &domain.ConsumptionHistory{}
		err := rows.Scan(&h.ID, &h.WineID, &h.Quantity, &h.Rating, &h.Comment, &h.Reason, &h.Date, &h.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan history: %w", err)
		}
		history = append(history, h)
	}

	return history, rows.Err()
}

// CreateCave crée une nouvelle cave
func (s *Store) CreateCave(ctx context.Context, cave *domain.Cave) (int64, error) {
	query := `INSERT INTO caves (name, model, capacity) VALUES (?, ?, ?)`
	result, err := s.Db.ExecContext(ctx, query, cave.Name, cave.Model, cave.Capacity)
	if err != nil {
		return 0, fmt.Errorf("failed to create cave: %w", err)
	}
	return result.LastInsertId()
}

// GetCaves récupère toutes les caves
func (s *Store) GetCaves(ctx context.Context) ([]*domain.Cave, error) {
	query := `SELECT id, name, model, capacity, current, created_at FROM caves ORDER BY created_at DESC`
	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query caves: %w", err)
	}
	defer rows.Close()

	caves := make([]*domain.Cave, 0)
	for rows.Next() {
		cave := &domain.Cave{}
		err := rows.Scan(&cave.ID, &cave.Name, &cave.Model, &cave.Capacity, &cave.Current, &cave.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cave: %w", err)
		}
		caves = append(caves, cave)
	}

	return caves, rows.Err()
}

// CreateCell crée un nouvel emplacement
func (s *Store) CreateCell(ctx context.Context, cell *domain.Cell) (int64, error) {
	query := `INSERT INTO cells (cave_id, location, capacity) VALUES (?, ?, ?)`
	result, err := s.Db.ExecContext(ctx, query, cell.CaveID, cell.Location, cell.Capacity)
	if err != nil {
		return 0, fmt.Errorf("failed to create cell: %w", err)
	}
	return result.LastInsertId()
}

// GetCellsByCAve récupère les emplacements d'une cave
func (s *Store) GetCellsByCave(ctx context.Context, caveID int64) ([]*domain.Cell, error) {
	query := `SELECT id, cave_id, location, capacity, current, created_at FROM cells WHERE cave_id = ? ORDER BY location`
	rows, err := s.Db.QueryContext(ctx, query, caveID)
	if err != nil {
		return nil, fmt.Errorf("failed to query cells: %w", err)
	}
	defer rows.Close()

	cells := make([]*domain.Cell, 0)
	for rows.Next() {
		cell := &domain.Cell{}
		err := rows.Scan(&cell.ID, &cell.CaveID, &cell.Location, &cell.Capacity, &cell.Current, &cell.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cell: %w", err)
		}
		cells = append(cells, cell)
	}

	return cells, rows.Err()
}

// GetWinesToDrinkNow récupère les vins dont l'apogée commence
func (s *Store) GetWinesToDrinkNow(ctx context.Context) ([]*domain.Wine, error) {
	today := time.Now()
	query := `
	SELECT id, name, region, vintage, type, quantity, cell_id, producer, alcohol_level, price, rating, comments, consumed, min_apogee_date, max_apogee_date, consumption_date, created_at
	FROM wines
	WHERE quantity > 0
	AND min_apogee_date IS NOT NULL
	AND min_apogee_date <= ?
	AND (max_apogee_date IS NULL OR max_apogee_date >= ?)
	ORDER BY max_apogee_date ASC
	`
	rows, err := s.Db.QueryContext(ctx, query, today, today)
	if err != nil {
		return nil, fmt.Errorf("failed to query wines to drink now: %w", err)
	}
	defer rows.Close()

	wines := make([]*domain.Wine, 0)
	for rows.Next() {
		wine := &domain.Wine{}
		err := rows.Scan(
			&wine.ID, &wine.Name, &wine.Region, &wine.Vintage, &wine.WineType, &wine.Quantity, &wine.CellID,
			&wine.Producer, &wine.AlcoholLevel, &wine.Price, &wine.Rating, &wine.Comments, &wine.Consumed,
			&wine.MinApogeeDate, &wine.MaxApogeeDate, &wine.ConsumptionDate, &wine.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan wine: %w", err)
		}
		wines = append(wines, wine)
	}

	return wines, rows.Err()
}

// UpdateWine met à jour un vin existant
func (s *Store) UpdateWine(ctx context.Context, wine *domain.Wine) error {
	query := `
	UPDATE wines 
	SET name=?, region=?, vintage=?, type=?, quantity=?, cell_id=?, 
		producer=?, alcohol_level=?, price=?, rating=?, comments=?, 
		consumed=?, min_apogee_date=?, max_apogee_date=?, consumption_date=?
	WHERE id=?
	`

	result, err := s.Db.ExecContext(ctx, query,
		wine.Name, wine.Region, wine.Vintage, wine.WineType, wine.Quantity, wine.CellID,
		wine.Producer, wine.AlcoholLevel, wine.Price, wine.Rating, wine.Comments,
		wine.Consumed, wine.MinApogeeDate, wine.MaxApogeeDate, wine.ConsumptionDate, wine.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update wine: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("wine not found with id %d", wine.ID)
	}

	return nil
}

// CreateAlert crée une nouvelle alerte
func (s *Store) CreateAlert(ctx context.Context, alert *domain.Alert) (int64, error) {
	query := `
	INSERT INTO alerts (wine_id, alert_type, status, created_at)
	VALUES (?, ?, ?, ?)
	`
	result, err := s.Db.ExecContext(ctx, query, alert.WineID, alert.AlertType, alert.Status, time.Now())
	if err != nil {
		return 0, fmt.Errorf("failed to create alert: %w", err)
	}
	return result.LastInsertId()
}

// UpdateAlert met à jour une alerte
func (s *Store) UpdateAlert(ctx context.Context, alertID int64, status string) error {
	query := `UPDATE alerts SET status = ? WHERE id = ?`
	_, err := s.Db.ExecContext(ctx, query, status, alertID)
	if err != nil {
		return fmt.Errorf("failed to update alert: %w", err)
	}
	return nil
}

// GenerateAlerts crée automatiquement des alertes basées sur les conditions des vins
// - Alerte low_stock si quantité < 2 (ou seuil configurable)
// - Alerte apogee_reached si date d'aujourd'hui >= min_apogee_date
// - Alerte apogee_ended si date d'aujourd'hui > max_apogee_date
func (s *Store) GenerateAlerts(ctx context.Context) error {
	today := time.Now()
	lowStockThreshold := 2

	// Récupérer tous les vins
	wines, err := s.GetWines(ctx)
	if err != nil {
		return fmt.Errorf("failed to get wines: %w", err)
	}

	for _, wine := range wines {
		// Vérifier si une alerte existe déjà pour ce vin
		existingAlerts, err := s.GetAlertsByWineID(ctx, wine.ID)
		if err != nil {
			return fmt.Errorf("failed to get alerts for wine %d: %w", wine.ID, err)
		}

		existingAlertTypes := make(map[string]bool)
		for _, alert := range existingAlerts {
			if alert.Status == "active" {
				existingAlertTypes[alert.AlertType] = true
			}
		}

		// Alerte low_stock
		if wine.Quantity < lowStockThreshold && !existingAlertTypes["low_stock"] {
			alert := &domain.Alert{
				WineID:    wine.ID,
				AlertType: "low_stock",
				Status:    "active",
				CreatedAt: time.Now(),
			}
			_, err := s.CreateAlert(ctx, alert)
			if err != nil {
				return fmt.Errorf("failed to create low_stock alert for wine %d: %w", wine.ID, err)
			}
		}

		// Alerte apogee_reached
		if wine.MinApogeeDate != nil && !wine.MinApogeeDate.After(today) && !existingAlertTypes["apogee_reached"] {
			alert := &domain.Alert{
				WineID:    wine.ID,
				AlertType: "apogee_reached",
				Status:    "active",
				CreatedAt: time.Now(),
			}
			_, err := s.CreateAlert(ctx, alert)
			if err != nil {
				return fmt.Errorf("failed to create apogee_reached alert for wine %d: %w", wine.ID, err)
			}
		}

		// Alerte apogee_ended
		if wine.MaxApogeeDate != nil && wine.MaxApogeeDate.Before(today) && !existingAlertTypes["apogee_ended"] {
			alert := &domain.Alert{
				WineID:    wine.ID,
				AlertType: "apogee_ended",
				Status:    "active",
				CreatedAt: time.Now(),
			}
			_, err := s.CreateAlert(ctx, alert)
			if err != nil {
				return fmt.Errorf("failed to create apogee_ended alert for wine %d: %w", wine.ID, err)
			}
		}
	}

	return nil
}

// GetAlertsByWineID récupère toutes les alertes pour un vin donné
func (s *Store) GetAlertsByWineID(ctx context.Context, wineID int64) ([]*domain.Alert, error) {
	query := `SELECT id, wine_id, alert_type, status, created_at FROM alerts WHERE wine_id = ?`
	rows, err := s.Db.QueryContext(ctx, query, wineID)
	if err != nil {
		return nil, fmt.Errorf("failed to query alerts: %w", err)
	}
	defer rows.Close()

	var alerts []*domain.Alert
	for rows.Next() {
		alert := &domain.Alert{}
		err := rows.Scan(&alert.ID, &alert.WineID, &alert.AlertType, &alert.Status, &alert.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan alert: %w", err)
		}
		alerts = append(alerts, alert)
	}

	return alerts, rows.Err()
}
