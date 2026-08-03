# Trouver la Bouteille Idéale pour un Plat

## TL;DR
Depuis l'onglet **Accords** de Dégustations, tapez un plat pour obtenir une liste de bouteilles de votre stock classées par pertinence, avec une action « Consommer maintenant » en un clic.

## Prérequis
* Avoir des bouteilles en stock (vin, bulles, spiritueux ou cigares).

## Action

1. Allez dans **Dégustations** (`/tastings`) puis ouvrez l'onglet **Accords**.
2. Tapez le plat ou l'ingrédient dans le champ de recherche (ex. : « bœuf », « saumon », « chocolat ») — ou utilisez un des raccourcis rapides (**Viande**, **Poisson**, **Fromage**, **Chocolat**).
3. La liste des bouteilles compatibles s'affiche, triées par pertinence de l'accord puis par priorité de rotation : les bouteilles en fin de fenêtre d'apogée ou déjà entamées remontent en premier parmi celles à score égal.
4. Cliquez **Consommer maintenant** sur la suggestion choisie — le formulaire de dégustation s'ouvre pré-rempli avec la bouteille et l'accord, y compris la mise à jour de niveau de stock (voir [09-Journal-Degustation.md](./09-Journal-Degustation.md)).
5. Depuis une fiche bouteille, vous pouvez aussi partir de l'item : loguez une dégustation en renseignant l'accord réalisé et une note facultative. L'historique des dégustations peut ensuite être filtré par met ou par bouteille.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Aucun résultat pour mon plat** | Le catalogue d'accords couvre un vocabulaire prédéfini (viande, poisson, fromage, chocolat, etc.) en français et en anglais. Essayez un terme plus générique ou un des raccourcis rapides. |
| **Les suggestions ne débitent pas mon stock** | « Consommer maintenant » ouvre le formulaire de dégustation standard — la bouteille n'est débitée qu'après validation de ce formulaire, pas au moment du clic sur la suggestion. |
| **Une bouteille pertinente n'apparaît pas dans les résultats** | Vérifiez sa catégorie et son sous-type (couleur pour un vin, type pour un spiritueux) : le moteur associe la variante détectée du plat au sous-type exact de la bouteille, pas seulement à sa catégorie générale. |
