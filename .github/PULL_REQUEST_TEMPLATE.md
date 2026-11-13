<!-- English first / Français ensuite -->

## What & why

<!-- What changes, and what for. Link issues: Closes #123 -->

## How to verify

<!-- How to check the linked issue is resolved: a command, a test, or a journey anyone can follow. -->

## Same pattern elsewhere

<!-- How you searched for the same problem in other places (e.g. `grep -rn "…" api/src web`), and what you found. -->

## For reviewers

- [ ] New user-facing strings have **both** FR and EN i18n keys
- [ ] A change users will notice adds its EN + FR release note (`api/release-notes/`, see CONTRIBUTING)
- [ ] No secrets, `.env` values or private files committed
- [ ] The change follows any owner decision on the issue; a departure from it was asked back to the owner first
- [ ] Docs / wiki and website (`docs/index.html`) updated if behaviour, installation or updating changes
- [ ] Screenshots below (UI changes)

By submitting this pull request, I license my contribution under the [Glou CLA](../CLA.md) version I signed.

<!-- The CI already checks typecheck, lint, tests and strict TypeScript — no need to tick those by hand. PRs should be based on `dev` and target `dev`. -->

---

## Quoi & pourquoi

<!-- Ce qui change, et dans quel but. Lien issue : Closes #123 -->

## Comment vérifier

<!-- Comment vérifier que l'issue liée est résolue : une commande, un test, ou un parcours que n'importe qui peut suivre. -->

## Même problème ailleurs

<!-- Comment vous avez cherché le même problème ailleurs (ex. `grep -rn "…" api/src web`), et ce que vous avez trouvé. -->

## Pour les relecteurs

- [ ] Les nouveaux textes ont des clés i18n FR **et** EN
- [ ] Un changement visible des utilisateurs ajoute sa note de version EN + FR (`api/release-notes/`, voir CONTRIBUTING)
- [ ] Aucun secret, valeur `.env` ou fichier privé commité
- [ ] Le changement suit toute décision du propriétaire sur l'issue ; un écart lui a d'abord été soumis
- [ ] Docs / wiki et site (`docs/index.html`) mis à jour si le comportement, l'installation ou la mise à jour change
- [ ] Captures ci-dessous (changements d'UI)

En soumettant cette pull request, je concède ma contribution selon la version du [CLA de Glou](../CLA.md) que j'ai signée.

<!-- La CI vérifie déjà typecheck, lint, tests et TypeScript strict — inutile de les cocher à la main. La PR doit être basée sur `dev` et cibler `dev`. -->
