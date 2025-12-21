package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// ActivityLogger enregistre les actions pour audit
func (s *Store) LogActivity(ctx context.Context, entityType string, entityID int64, action string, details interface{}, ipAddress string) error {
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	_, err = s.Db.ExecContext(ctx,
		`INSERT INTO activity_log (entity_type, entity_id, action, details, ip_address, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		entityType, entityID, action, string(detailsJSON), ipAddress, time.Now(),
	)
	return err
}

// GetActivityLog récupère l'historique d'activités avec filtrage optionnel
func (s *Store) GetActivityLog(ctx context.Context, entityType *string, limit int, offset int) ([]domain.ActivityLogEntry, error) {
	query := `SELECT id, entity_type, entity_id, action, details, ip_address, created_at FROM activity_log`
	args := []interface{}{}

	if entityType != nil {
		query += ` WHERE entity_type = ?`
		args = append(args, *entityType)
	}

	query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.Db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []domain.ActivityLogEntry
	for rows.Next() {
		var entry domain.ActivityLogEntry
		if err := rows.Scan(&entry.ID, &entry.EntityType, &entry.EntityID, &entry.Action,
			&entry.Details, &entry.IPAddress, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, rows.Err()
}

// GetActivityLogForEntity récupère l'historique d'une entité spécifique
func (s *Store) GetActivityLogForEntity(ctx context.Context, entityType string, entityID int64) ([]domain.ActivityLogEntry, error) {
	rows, err := s.Db.QueryContext(ctx,
		`SELECT id, entity_type, entity_id, action, details, ip_address, created_at 
		 FROM activity_log 
		 WHERE entity_type = ? AND entity_id = ?
		 ORDER BY created_at DESC`,
		entityType, entityID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []domain.ActivityLogEntry
	for rows.Next() {
		var entry domain.ActivityLogEntry
		if err := rows.Scan(&entry.ID, &entry.EntityType, &entry.EntityID, &entry.Action,
			&entry.Details, &entry.IPAddress, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, rows.Err()
}

// ClearOldActivityLogs supprime les logs de plus de X jours
func (s *Store) ClearOldActivityLogs(ctx context.Context, daysOld int) error {
	cutoff := time.Now().AddDate(0, 0, -daysOld)
	_, err := s.Db.ExecContext(ctx,
		`DELETE FROM activity_log WHERE created_at < ?`,
		cutoff,
	)
	return err
}
