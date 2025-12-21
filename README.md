# 🍷 Glou Server

<p align="center">
    <img src="assets/logo.png" alt="Logo glou-server" width="250" />
</p>

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://hub.docker.com/)
[![Android Client](https://img.shields.io/badge/Client-Android-brightgreen.svg)](https://github.com/jackthomasanderson/glou-android)

**Gestionnaire de cave moderne, self-hosted et 100 % open-source.**

Glou simplifie la gestion de vos bouteilles (vins, bières, spiritueux) grâce à une interface **Material You** soignée et un **ajout rapide par scan**. 
Pensé pour aller à l’essentiel : une architecture simple, des performances solides et aucun compromis sur la vie privée.

---

## ✨ Points clés

* 🐳 **Auto-hébergé** : Un seul conteneur Docker à déployer.
* 📱 **Écosystème complet** : Accompagné de son [application Android native](https://github.com/jackthomasanderson/glou-android).
* 🔒 **Vie privée** : Aucun tracking, aucune dépendance cloud, vos données restent chez vous.
* 🇫🇷 **Savoir-faire** : Projet open-source développé en France.

---

## 🛠 Stack Technique

* **Runtime** : Node.js
* **Base de données** : SQLite (via Prisma/Sequelize)
* **API** : REST
* **Conteneurisation** : Docker & Docker Compose

---

## 🚀 Installation Rapide

### Via Docker Compose
```yaml
services:
  glou-server:
    image: jackthomasanderson/glou-server:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    restart: always

```

### Installation manuelle

1. Clonez le dépôt :
```bash
git clone [https://github.com/jackthomasanderson/glou-server.git](https://github.com/jackthomasanderson/glou-server.git)

```


2. Installez les dépendances :
```bash
npm install

```


3. Lancez le serveur :
```bash
npm start

```



---

## 📱 Application Mobile

Pour une expérience optimale, notamment pour le scan de bouteilles, utilisez l'application compagnon :
👉 **[Découvrir glou-android](https://www.google.com/url?sa=E&source=gmail&q=https://github.com/jackthomasanderson/glou-android)**

---

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une **Issue** ou une **Pull Request** pour améliorer le moteur de gestion ou l'API.

---

## 📄 Licence

Distribué sous la licence MIT. Voir le fichier `LICENSE` pour plus d'informations.