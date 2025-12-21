package main

import (
	"context"
	"net/http"
	"time"
)

// SessionKey est la clé pour stocker la session dans le contexte
type SessionKey string

const (
	SessionUserIDKey SessionKey = "user_id"
	SessionUserKey   SessionKey = "user"
)

// authRequiredMiddleware vérifie que l'utilisateur est authentifié
// Si non authentifié, redirige vers /login
func (s *Server) authRequiredMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Pour l'instant, on va vérifier une session basique
		// TODO: Implémenter JWT ou sessions avec cookies sécurisés

		// Vérifier si un cookie de session existe
		cookie, err := r.Cookie("glou_session")
		if err != nil || cookie.Value == "" {
			// Pas de session, rediriger vers login
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// TODO: Valider le token de session
		// Pour l'instant, on accepte toute session

		next(w, r)
	}
}

// setSession crée un cookie de session pour l'utilisateur
func (s *Server) setSession(w http.ResponseWriter, userID int64, username string) {
	// TODO: Utiliser un vrai système de session/JWT
	// Pour l'instant, cookie simple
	cookie := &http.Cookie{
		Name:     "glou_session",
		Value:    username, // TODO: Utiliser un token JWT
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
