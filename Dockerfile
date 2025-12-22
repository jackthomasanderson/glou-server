# Stage 1: Builder
FROM golang:1.24-alpine AS builder

WORKDIR /build

# Installer les dépendances de build minimales
RUN apk add --no-cache git ca-certificates tzdata

# Copier les fichiers du projet
COPY go.mod go.sum* ./
COPY internal ./internal
COPY cmd ./cmd

# Télécharger les dépendances
RUN go mod download && go mod tidy

# Compiler l'application (statiquement lié)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o glou-server \
    ./cmd/api

# Stage 2: Runtime
FROM alpine:3.19

# Installer les certificats CA uniquement
RUN apk add --no-cache ca-certificates tzdata

# Créer un utilisateur non-root
RUN addgroup -g 1000 glou && adduser -D -u 1000 -G glou glou

WORKDIR /app

# Copier l'exécutable depuis le builder
COPY --from=builder /build/glou-server .

# Changer la propriété des fichiers
RUN chown -R glou:glou /app

# Passer à l'utilisateur non-root
USER glou

# Exposer le port
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Démarrer l'application
ENTRYPOINT ["./glou-server"]
CMD []
