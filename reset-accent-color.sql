-- Réinitialiser la couleur d'accentuation à bleu pour tous les utilisateurs
UPDATE "User"
SET "accentColor" = '#2563EB'
WHERE "accentColor" IS NOT NULL 
  AND "accentColor" != '#2563EB';

-- Vérifier les résultats
SELECT id, username, "accentColor" FROM "User";
