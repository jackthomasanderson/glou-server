# Configuration de l'Environnement

**TL;DR** : Configurez votre fichier `.env` pour définir les accès à la base de données et les secrets d'API.

**Prérequis** :
- Le fichier `.env` généré depuis `.env.example`.

**Action** :
1. Ouvrez le fichier `.env` à la racine du projet.
2. Définissez `DB_USER`, `DB_PASSWORD` et `DB_NAME` avec vos identifiants PostgreSQL personnalisés.
3. Générez une chaîne aléatoire de 32 caractères et affectez-la à `JWT_SECRET`.
4. Relancez `docker-compose up -d` pour appliquer les changements.

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| `JWT_SECRET is missing` | Vérifiez que la variable est présente dans `.env` et qu'elle contient une chaîne longue et sécurisée. |
| `password authentication failed for user` | Vérifiez que les variables `.env` correspondent à celles définies lors de la première création du volume `db`. Il se peut que vous deviez supprimer le volume `db_data` si les identifiants ont été modifiés entre temps. |
