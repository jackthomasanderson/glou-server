# Carte thermique des vins — Guide Utilisateur

## 🎯 Nouveautés du tableau de bord

Vous disposez maintenant de deux visualisations interactives (heatmaps) pour comprendre la répartition géographique de votre collection de vins.

## 1️⃣ Heatmap régionale (grille)

Placée en haut du tableau de bord après les KPI et le tableau de données.

### Ce que vous voyez
- **Grille de tuiles colorées**, une par région
- **Tuiles plus foncées** = plus de bouteilles
- **Badges de type** affichant les principaux types par région
- **Nombre total de bouteilles** affiché sur chaque tuile

### Comment l'utiliser
1. Parcourez la grille pour repérer rapidement les régions les plus fournies
2. Cliquez sur une tuile pour l'agrandir et voir le détail
3. Consultez les pourcentages par type dans la vue développée
4. Cliquez ailleurs pour refermer

## 2️⃣ Carte interactive (SVG)

Sous la grille, une carte SVG interactive des régions de France.

### Ce que vous voyez
- **Polygones colorés** représentant les régions
- **Intensité** basée sur le nombre de bouteilles
- **Étiquettes** avec le décompte par région
- **Légende** expliquant l'échelle de couleur
- **Effets au survol** pour mettre en évidence

### Comment l'utiliser
1. Survolez les régions pour les mettre en évidence
2. Cliquez pour ouvrir une boîte de détails
3. Fermez en cliquant à l'extérieur ou sur une autre région

### Échelle de couleur
- Très clair (#FFE0E0) : très peu (<20% du max)
- Clair (#FFB3B3) : peu (20–40%)
- Moyen (#FF8080) : modéré (40–60%)
- Foncé (#CC4444) : beaucoup (60–80%)
- Très foncé (#990000) : concentration maximale (>80%)

## 🗺️ Régions viticoles prises en charge

Les heatmaps reconnaissent et regroupent automatiquement les vins de ces régions françaises :

### 🍇 **Bordeaux**
- Célèbre pour : Château Margaux, Pauillac, Pomerol, Saint-Émilion
- Vins typiques : Assemblages rouges (Cabernet Sauvignon, Merlot)
- Profil : Riche, élégant, apte au vieillissement

### 🍷 **Bourgogne**
- Célèbre pour : Pinot Noir, Chardonnay
- Vins typiques : Côte d'Or, Côte de Beaune
- Profil : Raffiné, axé sur le terroir

### 🌄 **Vallée du Rhône**
- Célèbre pour : Syrah, Grenache
- Vins typiques : Châteauneuf-du-Pape, Côtes du Rhône
- Profil : Puissant, épicé, fruité

### 🌊 **Vallée de la Loire**
- Célèbre pour : Sauvignon Blanc, Cabernet Franc
- Vins typiques : Sancerre, Chinon
- Profil : Frais, vif, élégant

### 🏔️ **Alsace**
- Célèbre pour : Riesling, Gewürztraminer
- Vins typiques : Blancs aromatiques alsaciens
- Profil : Aromatique, sec à demi-sec

### 🍾 **Champagne**
- Célèbre pour : Vins effervescents
- Vins typiques : Champagne AOC
- Profil : Élégant, festif, complexe

### 🌸 **Provence**
- Célèbre pour : Vins rosés
- Vins typiques : Rosé de Provence
- Profil : Sec, frais, estival

### 🌾 **Languedoc-Roussillon**
- Célèbre pour : Vins de rapport qualité-prix, diversité
- Vins typiques : Divers rouges et blancs
- Profil : Diversifié, excellent rapport qualité-prix

### 🏛️ **Sud-Ouest**
- Célèbre pour : Cahors, spécialités régionales
- Vins typiques : Cahors (Malbec), cépages locaux
- Profil : Distinctif, avec du caractère

## 📊 Cas d'utilisation & Analyses

### Cas 1 : Comprendre l'équilibre de la collection
**Question :** "Ma collection est-elle équilibrée entre les régions ?"
**Réponse :** Regardez la heatmap en grille :
- Si Bordeaux est beaucoup plus foncé que la Loire, votre collection est dominée par Bordeaux.
- Si toutes les tuiles ont une teinte similaire, vous avez un bon équilibre régional.

### Cas 2 : Identifier les manques
**Question :** "Sur quelles régions devrais-je me concentrer pour mes prochains achats ?"
**Réponse :** Cherchez les tuiles claires :
- Les tuiles claires représentent les régions sous-représentées.
- Envisagez d'élargir ces régions dans votre collection.

### Cas 3 : Répartition par type de vin
**Question :** "Est-ce que je collectionne principalement des rouges ou ai-je une bonne variété ?"
**Réponse :** Regardez les badges de type de vin dans chaque région :
- Vérifiez les pourcentages dans la vue détaillée.
- Identifiez les régions où vous êtes faible sur certains types.

## 💡 Astuces & Conseils

- Utilisez la heatmap pour guider vos achats
- Actualisez la page pour recharger les données
- Préférez des noms de région standards pour une meilleure correspondance

## ⚠️ À noter

- La correspondance des noms utilise un algorithme tolérant (fuzzy matching)
- Les heatmaps chargent les données au chargement de la page (pas de rafraîchissement automatique)

## 🔧 Dépannage rapide

- Vérifiez que vos vins ont bien le champ `region` renseigné
- Rechargez la page si les données n'apparaissent pas
- Consultez la console du navigateur pour les erreurs API

## 🔭 Évolutions possibles

- Passage à une carte géographique réelle (Leaflet/Mapbox)
- Analyse temporelle
- Filtrage par type
- Export d'images ou de rapports

## ❓ FAQ

Q: Pourquoi deux heatmaps ?
A: La grille est meilleur pour la comparaison rapide, la carte pour la répartition géographique.

Q: Les heatmaps se mettent-elles à jour en temps réel ?
A: Non — rechargez la page pour voir les dernières données.

---

Bonne exploration de votre collection ! 🍷