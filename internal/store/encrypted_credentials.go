package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// EncryptedCredential représente une credential chiffrée
type EncryptedCredential struct {
	ID             int64     `json:"id"`
	ServiceName    string    `json:"service_name"`
	CredentialType string    `json:"credential_type"`
	EncryptedValue string    `json:"encrypted_value"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// StoreEncryptedCredential stocke une credential chiffrée
// Recommandation ANSSI : toujours chiffrer les données sensibles avant stockage
func (s *Store) StoreEncryptedCredential(ctx context.Context, serviceName, credentialType, plainValue string) error {
	if s.EncryptionService == nil {
		return fmt.Errorf("encryption service not configured")
	}

	// Chiffrer la valeur avec AES-256-GCM (ANSSI)
	encryptedValue, err := s.EncryptionService.Encrypt(plainValue)
	if err != nil {
		return fmt.Errorf("failed to encrypt credential: %w", err)
	}

	query := `
	INSERT INTO encrypted_credentials (service_name, credential_type, encrypted_value, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT(service_name) DO UPDATE SET
		credential_type = excluded.credential_type,
		encrypted_value = excluded.encrypted_value,
		updated_at = excluded.updated_at
	`

	now := time.Now()
	_, err = s.Db.ExecContext(ctx, query, serviceName, credentialType, encryptedValue, now, now)
	if err != nil {
		return fmt.Errorf("failed to store encrypted credential: %w", err)
	}

	return nil
}

// GetDecryptedCredential récupère et déchiffre une credential
func (s *Store) GetDecryptedCredential(ctx context.Context, serviceName string) (string, error) {
	if s.EncryptionService == nil {
		return "", fmt.Errorf("encryption service not configured")
	}

	query := `
	SELECT encrypted_value
	FROM encrypted_credentials
	WHERE service_name = ?
	LIMIT 1
	`

	var encryptedValue string
	err := s.Db.QueryRowContext(ctx, query, serviceName).Scan(&encryptedValue)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("failed to get encrypted credential: %w", err)
	}

	// Déchiffrer la valeur
	plainValue, err := s.EncryptionService.Decrypt(encryptedValue)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt credential: %w", err)
	}

	return plainValue, nil
}

// DeleteEncryptedCredential supprime une credential chiffrée
func (s *Store) DeleteEncryptedCredential(ctx context.Context, serviceName string) error {
	query := `DELETE FROM encrypted_credentials WHERE service_name = ?`

	_, err := s.Db.ExecContext(ctx, query, serviceName)
	if err != nil {
		return fmt.Errorf("failed to delete encrypted credential: %w", err)
	}

	return nil
}

// ListEncryptedCredentials liste toutes les credentials (sans les valeurs déchiffrées)
func (s *Store) ListEncryptedCredentials(ctx context.Context) ([]EncryptedCredential, error) {
	query := `
	SELECT id, service_name, credential_type, created_at, updated_at
	FROM encrypted_credentials
	ORDER BY service_name
	`

	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list credentials: %w", err)
	}
	defer rows.Close()

	var credentials []EncryptedCredential
	for rows.Next() {
		var cred EncryptedCredential
		err := rows.Scan(&cred.ID, &cred.ServiceName, &cred.CredentialType, &cred.CreatedAt, &cred.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan credential: %w", err)
		}
		credentials = append(credentials, cred)
	}

	return credentials, nil
}
