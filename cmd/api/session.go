package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// SessionKey est la clé pour stocker la session dans le contexte
type SessionKey string

const (
	SessionUserIDKey   SessionKey = "user_id"
	SessionUserKey     SessionKey = "user"
	SessionUserRoleKey SessionKey = "role"
)

// authRequiredMiddleware vérifie que l'utilisateur est authentifié
// Si non authentifié, redirige vers /login
func (s *Server) authRequiredMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Vérifier si un cookie de session existe
		cookie, err := r.Cookie("glou_session")
		if err != nil || cookie.Value == "" {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// Valider le token signé (HMAC SHA-256)
		userID, username, role, valid := s.validateSessionToken(cookie.Value)
		if !valid {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// Injecter dans le contexte
		ctx := context.WithValue(r.Context(), SessionUserIDKey, userID)
		ctx = context.WithValue(ctx, SessionUserKey, username)
		ctx = context.WithValue(ctx, SessionUserRoleKey, role)
		next(w, r.WithContext(ctx))
	}
}

// setSession crée un cookie de session pour l'utilisateur
func (s *Server) setSession(w http.ResponseWriter, userID int64, username string, role string) {
	// Générer un token signé incluant utilisateur, rôle et expiration
	if role == "" {
		role = "user"
	}
	token := s.generateSessionToken(userID, username, role, time.Now().Add(7*24*time.Hour))
	cookie := &http.Cookie{
		Name:     "glou_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.config.Environment == "production",
		SameSite: http.SameSiteStrictMode,
		MaxAge:   86400 * 7, // 7 jours
	}
	http.SetCookie(w, cookie)
}

// clearSession supprime le cookie de session
func (s *Server) clearSession(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     "glou_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	}
	http.SetCookie(w, cookie)
}

// getUserFromContext récupère l'utilisateur depuis le contexte
func getUserFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(SessionUserIDKey).(int64)
	return userID, ok
}

// generateSessionToken crée un token HMAC signé: base64("userID|username|role|expUnix|sig")
func (s *Server) generateSessionToken(userID int64, username, role string, exp time.Time) string {
	payload := fmt.Sprintf("%d|%s|%s|%d", userID, username, role, exp.Unix())
	mac := hmac.New(sha256.New, []byte(s.config.SessionSecret))
	mac.Write([]byte(payload))
	sig := mac.Sum(nil)
	token := payload + "|" + base64.StdEncoding.EncodeToString(sig)
	return base64.StdEncoding.EncodeToString([]byte(token))
}

// validateSessionToken vérifie signature et expiration
func (s *Server) validateSessionToken(token string) (int64, string, string, bool) {
	// Décoder base64 extérieur
	raw, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return 0, "", "", false
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 5 {
		return 0, "", "", false
	}
	// Recalculer signature
	payload := strings.Join(parts[:4], "|")
	mac := hmac.New(sha256.New, []byte(s.config.SessionSecret))
	mac.Write([]byte(payload))
	expected := mac.Sum(nil)
	provided, err := base64.StdEncoding.DecodeString(parts[4])
	if err != nil {
		return 0, "", "", false
	}
	if !hmac.Equal(expected, provided) {
		return 0, "", "", false
	}
	// Expiration
	expUnix := parts[3]
	var exp int64
	_, err = fmt.Sscanf(expUnix, "%d", &exp)
	if err != nil || time.Now().Unix() > exp {
		return 0, "", "", false
	}
	// Parse userID
	var uid int64
	if _, err := fmt.Sscanf(parts[0], "%d", &uid); err != nil {
		return 0, "", "", false
	}
	return uid, parts[1], parts[2], true
}

// adminRequiredMiddleware vérifie que l'utilisateur est admin
func (s *Server) adminRequiredMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		role, _ := r.Context().Value(SessionUserRoleKey).(string)
		if role != "admin" {
			s.respondError(w, http.StatusForbidden, "Admin access required", nil)
			return
		}
		next(w, r)
	}
}
