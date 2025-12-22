#!/bin/bash
# Script de déploiement Glou Server pour Linux/Mac
# Usage: ./deploy-linux.sh

set -e

echo "====================================="
echo "   Glou Server - Déploiement Linux/Mac"
echo "====================================="
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Créer les dossiers nécessaires
echo -e "${YELLOW}[1/6] Création des dossiers...${NC}"
for folder in data backups assets; do
    if [ ! -d "$folder" ]; then
        mkdir -p "$folder"
        echo -e "${GREEN}  ✓ Dossier $folder créé${NC}"
    else
        echo -e "${GREEN}  ✓ Dossier $folder existe déjà${NC}"
    fi
done
chmod 700 data backups 2>/dev/null || true
echo ""

# Vérifier le fichier .env
echo -e "${YELLOW}[2/6] Vérification de la configuration...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}  ⚠ Fichier .env non trouvé, copie depuis .env.example${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo ""
        echo -e "${RED}  IMPORTANT: Éditez le fichier .env avec vos valeurs !${NC}"
        echo -e "${YELLOW}  Notamment:${NC}"
        echo -e "${YELLOW}    - ENCRYPTION_PASSPHRASE (minimum 32 caractères)${NC}"
        echo -e "${YELLOW}    - ENCRYPTION_SALT${NC}"
        echo -e "${YELLOW}    - SESSION_SECRET${NC}"
        echo ""
        echo -e "${CYAN}  Voulez-vous éditer le fichier maintenant ? (o/n)${NC}"
        read -r response
        if [ "$response" = "o" ] || [ "$response" = "O" ]; then
            ${EDITOR:-nano} .env
        fi
        echo ""
    else
        echo -e "${RED}  ✗ Fichier .env.example non trouvé !${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}  ✓ Fichier .env trouvé${NC}"
fi
echo ""

# Vérifier Docker
echo -e "${YELLOW}[3/6] Vérification de Docker...${NC}"
if command -v docker &> /dev/null; then
    docker_version=$(docker --version)
    echo -e "${GREEN}  ✓ Docker installé : $docker_version${NC}"
else
    echo -e "${RED}  ✗ Docker n'est pas installé !${NC}"
    echo ""
    echo -e "${YELLOW}Installez Docker depuis:${NC}"
    echo -e "${CYAN}https://docs.docker.com/get-docker/${NC}"
    echo ""
    exit 1
fi
echo ""

# Vérifier Docker Compose
echo -e "${YELLOW}[4/6] Vérification de Docker Compose...${NC}"
if docker compose version &> /dev/null; then
    compose_version=$(docker compose version)
    echo -e "${GREEN}  ✓ Docker Compose installé : $compose_version${NC}"
else
    echo -e "${RED}  ✗ Docker Compose n'est pas disponible !${NC}"
    echo -e "${YELLOW}  Assurez-vous que Docker est à jour (v2+)${NC}"
    exit 1
fi
echo ""

# Choix du mode de déploiement
echo -e "${YELLOW}[5/6] Choix du mode de déploiement${NC}"
echo -e "${CYAN}  1) Production (docker-compose.prod.yml) - Image depuis GitHub${NC}"
echo -e "${CYAN}  2) Development (docker-compose.yml) - Build local${NC}"
echo ""
echo -e "${YELLOW}  Votre choix (1 ou 2) ?${NC}"
read -r choice

compose_file="docker-compose.yml"
if [ "$choice" = "1" ]; then
    compose_file="docker-compose.prod.yml"
    echo -e "${GREEN}  → Mode Production sélectionné${NC}"
elif [ "$choice" = "2" ]; then
    compose_file="docker-compose.yml"
    echo -e "${GREEN}  → Mode Development sélectionné${NC}"
else
    echo -e "${YELLOW}  Choix invalide, utilisation de docker-compose.yml${NC}"
fi
echo ""

# Lancer Docker Compose
echo -e "${YELLOW}[6/6] Lancement de Glou Server...${NC}"
echo -e "  → Commande: docker compose -f $compose_file up -d"
echo ""

if docker compose -f "$compose_file" up -d; then
    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}   ✓ Glou Server démarré avec succès !${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${CYAN}Interface web disponible sur:${NC}"
    echo -e "${GREEN}  → http://localhost:8080${NC}"
    echo ""
    echo -e "${YELLOW}Commandes utiles:${NC}"
    echo -e "  • Voir les logs     : docker logs -f glou-server"
    echo -e "  • Arrêter le serveur: docker compose -f $compose_file down"
    echo -e "  • Redémarrer        : docker compose -f $compose_file restart"
    echo -e "  • Voir le statut    : docker ps"
    echo ""
    
    # Attendre que le serveur soit prêt
    echo -e "${YELLOW}Vérification de la disponibilité du serveur...${NC}"
    max_attempts=30
    attempt=0
    server_ready=false
    
    while [ $attempt -lt $max_attempts ] && [ "$server_ready" = false ]; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health | grep -q "200"; then
            server_ready=true
        else
            sleep 1
            ((attempt++))
        fi
    done
    
    if [ "$server_ready" = true ]; then
        echo -e "${GREEN}  ✓ Serveur opérationnel et prêt !${NC}"
        echo ""
        echo -e "${CYAN}  Ouvrir dans le navigateur ? (o/n)${NC}"
        read -r open_browser
        if [ "$open_browser" = "o" ] || [ "$open_browser" = "O" ]; then
            if command -v xdg-open &> /dev/null; then
                xdg-open http://localhost:8080
            elif command -v open &> /dev/null; then
                open http://localhost:8080
            fi
        fi
    else
        echo -e "${YELLOW}  ⚠ Le serveur met du temps à démarrer...${NC}"
        echo -e "${YELLOW}  Vérifiez les logs avec: docker logs -f glou-server${NC}"
    fi
else
    echo ""
    echo -e "${RED}  ✗ Erreur lors du démarrage !${NC}"
    echo -e "${YELLOW}  Vérifiez les logs avec: docker logs glou-server${NC}"
    exit 1
fi
