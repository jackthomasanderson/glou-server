package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/romain/glou-server/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

// CreateUser crée un nouvel utilisateur avec un mot de passe hashé
func (s *Store) CreateUser(ctx context.Context, username, email, password, role string) (int64, error) {
	// Hasher le mot de passe
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return 0, fmt.Errorf("failed to hash password: %w", err)
	}

	query := `
	INSERT INTO users (username, email, password_hash, role, is_active, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	now := time.Now()
	result, err := s.Db.ExecContext(ctx, query, username, email, string(hashedPassword), role, true, now, now)
	if err != nil {
		return 0, fmt.Errorf("failed to create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert id: %w", err)
	}

	return id, nil
}

// GetUserByUsername récupère un utilisateur par son nom d'utilisateur
func (s *Store) GetUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `
	SELECT id, username, email, role, is_active, created_at, updated_at
	FROM users
	WHERE username = ?
	LIMIT 1
	`

	row := s.Db.QueryRowContext(ctx, query, username)

	user := &domain.User{}
	var isActive int
	err := row.Scan(&user.ID, &user.Username, &user.Email, &user.Role, &isActive, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.IsActive = isActive == 1

	return user, nil
}

// GetUserByEmail récupère un utilisateur par son email
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
	SELECT id, username, email, role, is_active, created_at, updated_at
	FROM users
	WHERE email = ?
	LIMIT 1
	`

	row := s.Db.QueryRowContext(ctx, query, email)

	user := &domain.User{}
	var isActive int
	err := row.Scan(&user.ID, &user.Username, &user.Email, &user.Role, &isActive, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.IsActive = isActive == 1

	return user, nil
}

// GetAllUsers récupère tous les utilisateurs
func (s *Store) GetAllUsers(ctx context.Context) ([]*domain.User, error) {
	query := `
	SELECT id, username, email, role, is_active, created_at, updated_at
	FROM users
	ORDER BY created_at DESC
	`

	rows, err := s.Db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get users: %w", err)
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		user := &domain.User{}
		var isActive int
		err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.Role, &isActive, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		user.IsActive = isActive == 1
		users = append(users, user)
	}

	return users, nil
}

// HasAdminUser vérifie si au moins un utilisateur admin existe
func (s *Store) HasAdminUser(ctx context.Context) (bool, error) {
	query := `
	SELECT COUNT(*) 
	FROM users 
	WHERE role = 'admin' AND is_active = 1
	LIMIT 1
	`

	var count int
	err := s.Db.QueryRowContext(ctx, query).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check admin user: %w", err)
	}

	return count > 0, nil
}

// IsSetupComplete vérifie si le wizard de configuration a été complété
func (s *Store) IsSetupComplete(ctx context.Context) (bool, error) {
	query := `
	SELECT completed 
	FROM setup_wizard 
	ORDER BY created_at DESC 
	LIMIT 1
	`

	var completed int
	err := s.Db.QueryRowContext(ctx, query).Scan(&completed)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("failed to check setup status: %w", err)
	}

	return completed == 1, nil
}

// MarkSetupComplete marque le wizard de configuration comme complété
func (s *Store) MarkSetupComplete(ctx context.Context) error {
	query := `
	INSERT INTO setup_wizard (completed, completed_at, created_at)
	VALUES (1, ?, ?)
	`

	now := time.Now()
	_, err := s.Db.ExecContext(ctx, query, now, now)
	if err != nil {
		return fmt.Errorf("failed to mark setup complete: %w", err)
	}

	return nil
}

// VerifyPassword vérifie si un mot de passe correspond au hash
func (s *Store) VerifyPassword(ctx context.Context, username, password string) (bool, error) {
	query := `
	SELECT password_hash 
	FROM users 
	WHERE username = ? AND is_active = 1
	LIMIT 1
	`

	var passwordHash string
	err := s.Db.QueryRowContext(ctx, query, username).Scan(&passwordHash)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("failed to get password hash: %w", err)
	}

	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password))
	return err == nil, nil
}
