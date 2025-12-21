package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/romain/glou-server/internal/domain"
)

// GetSettings récupère les paramètres de Glou
func (s *Store) GetSettings(ctx context.Context) (*domain.Settings, error) {
	query := `
	SELECT id, app_title, app_slogan, logo_url, favicon_url, support_email,
		   theme_color, secondary_color, accent_color, dark_mode_default,
		   public_domain, public_protocol, proxy_mode, proxy_headers,
		   allow_registration, require_approval, enable_notifications, maintenance_mode,
		   rows_per_page, date_format, language, max_request_body_size, session_timeout,
		   smtp_configured, created_at, updated_at
	FROM settings
	LIMIT 1
	`

	row := s.Db.QueryRowContext(ctx, query)

	settings := &domain.Settings{}
	var smtpConfigured int
	err := row.Scan(
		&settings.ID, &settings.AppTitle, &settings.AppSlogan, &settings.LogoURL, &settings.FaviconURL,
		&settings.SupportEmail, &settings.ThemeColor, &settings.SecondaryColor, &settings.AccentColor,
		&settings.DarkModeDefault, &settings.PublicDomain, &settings.PublicProtocol, &settings.ProxyMode,
		&settings.ProxyHeaders, &settings.AllowRegistration, &settings.RequireApproval,
		&settings.EnableNotifications, &settings.MaintenanceMode, &settings.RowsPerPage,
		&settings.DateFormat, &settings.Language, &settings.MaxRequestBodySize, &settings.SessionTimeout,
		&smtpConfigured, &settings.CreatedAt, &settings.UpdatedAt,
	)

	settings.SMTPConfigured = smtpConfigured == 1

	if err == sql.ErrNoRows {
		// Créer les settings par défaut
		return s.createDefaultSettings(ctx)
	}

	return settings, err
}

// createDefaultSettings crée les paramètres par défaut
func (s *Store) createDefaultSettings(ctx context.Context) (*domain.Settings, error) {
	settings := &domain.Settings{
		AppTitle:            "Glou",
		AppSlogan:           "Wine Management System",
		ThemeColor:          "#007bff",
		SecondaryColor:      "#6c757d",
		AccentColor:         "#28a745",
		DarkModeDefault:     false,
		PublicProtocol:      "http",
		ProxyMode:           false,
		ProxyHeaders:        false,
		AllowRegistration:   false,
		RequireApproval:     false,
		EnableNotifications: true,
		MaintenanceMode:     false,
		RowsPerPage:         10,
		DateFormat:          "YYYY-MM-DD",
		Language:            "en",
		MaxRequestBodySize:  1048576,
		SessionTimeout:      1440,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	query := `
	INSERT INTO settings (app_title, app_slogan, theme_color, secondary_color, accent_color, dark_mode_default,
		public_protocol, proxy_mode, proxy_headers, allow_registration, require_approval,
		enable_notifications, maintenance_mode, rows_per_page, date_format, language,
		max_request_body_size, session_timeout, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := s.Db.ExecContext(ctx, query,
		settings.AppTitle, settings.AppSlogan, settings.ThemeColor, settings.SecondaryColor,
		settings.AccentColor, settings.DarkModeDefault, settings.PublicProtocol, settings.ProxyMode,
		settings.ProxyHeaders, settings.AllowRegistration, settings.RequireApproval,
		settings.EnableNotifications, settings.MaintenanceMode, settings.RowsPerPage,
		settings.DateFormat, settings.Language, settings.MaxRequestBodySize, settings.SessionTimeout,
		settings.CreatedAt, settings.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create default settings: %w", err)
	}

	id, _ := result.LastInsertId()
	settings.ID = id

	return settings, nil
}

// UpdateSettings met à jour les paramètres
func (s *Store) UpdateSettings(ctx context.Context, settings *domain.Settings) error {
	query := `
	UPDATE settings SET
		app_title = ?, app_slogan = ?, logo_url = ?, favicon_url = ?, support_email = ?,
		theme_color = ?, secondary_color = ?, accent_color = ?, dark_mode_default = ?,
		public_domain = ?, public_protocol = ?, proxy_mode = ?, proxy_headers = ?,
		allow_registration = ?, require_approval = ?, enable_notifications = ?, maintenance_mode = ?,
		rows_per_page = ?, date_format = ?, language = ?, max_request_body_size = ?, session_timeout = ?,
		smtp_configured = ?, updated_at = ?
	WHERE id = ?
	`

	_, err := s.Db.ExecContext(ctx, query,
		settings.AppTitle,
		settings.AppSlogan,
		settings.LogoURL,
		settings.FaviconURL,
		settings.SupportEmail,
		settings.ThemeColor,
		settings.SecondaryColor,
		settings.AccentColor,
		settings.DarkModeDefault,
		settings.PublicDomain,
		settings.PublicProtocol,
		settings.ProxyMode,
		settings.ProxyHeaders,
		settings.AllowRegistration,
		settings.RequireApproval,
		settings.EnableNotifications,
		settings.MaintenanceMode,
		settings.RowsPerPage,
		settings.DateFormat,
		settings.Language,
		settings.MaxRequestBodySize,
		settings.SessionTimeout,
		boolToInt(settings.SMTPConfigured),
		time.Now(),
		settings.ID,
	)

	return err
}

// boolToInt converts bool to int for SQLite storage
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
