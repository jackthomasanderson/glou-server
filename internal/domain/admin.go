package domain

import "time"

// Settings représente les configurations de Glou
type Settings struct {
	ID int64 `json:"id"`

	// Branding
	AppTitle     string `json:"app_title"`     // Nom de l'app (ex: "Glou" ou "Ma Cave")
	AppSlogan    string `json:"app_slogan"`    // Slogan (ex: "Votre cave dans la poche")
	LogoURL      string `json:"logo_url"`      // URL du logo
	FaviconURL   string `json:"favicon_url"`   // URL du favicon
	SupportEmail string `json:"support_email"` // Email de support

	// UI Customization
	ThemeColor      string `json:"theme_color"`       // Couleur primaire (ex: #007bff)
	SecondaryColor  string `json:"secondary_color"`   // Couleur secondaire
	AccentColor     string `json:"accent_color"`      // Couleur d'accent
	DarkModeDefault bool   `json:"dark_mode_default"` // Mode sombre par défaut?

	// Network & Reverse Proxy
	PublicDomain   string `json:"public_domain"`   // Domaine public (ex: glou.example.com)
	PublicProtocol string `json:"public_protocol"` // http ou https
	ProxyMode      bool   `json:"proxy_mode"`      // Derrière un reverse proxy?
	ProxyHeaders   bool   `json:"proxy_headers"`   // Faire confiance aux headers X-*?

	// Features
	AllowRegistration   bool `json:"allow_registration"`   // Permettre enregistrement? (futur)
	RequireApproval     bool `json:"require_approval"`     // Approuver avant accès?
	EnableNotifications bool `json:"enable_notifications"` // Activer notifications?
	MaintenanceMode     bool `json:"maintenance_mode"`     // Mode maintenance?

	// Appearance
	RowsPerPage int    `json:"rows_per_page"` // Nombre de lignes par page
	DateFormat  string `json:"date_format"`   // Format de date
	Language    string `json:"language"`      // Langue par défaut (en/fr)

	// Advanced
	MaxRequestBodySize int64 `json:"max_request_body_size"` // Max upload
	SessionTimeout     int   `json:"session_timeout"`       // Minutes

	// SMTP Configuration
	SMTPConfigured bool `json:"smtp_configured"` // SMTP est-il configuré?

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// User représente un utilisateur
type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Role      string    `json:"role"` // "admin", "user"
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PasswordResetToken représente un token de réinitialisation de mot de passe
type PasswordResetToken struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	Used      bool      `json:"used"`
	CreatedAt time.Time `json:"created_at"`
}
