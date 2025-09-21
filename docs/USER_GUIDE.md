# Guide d’utilisation — Sauvegarder, Revue, Publier

## Sauvegarder (brouillon)
- Bouton **Sauvegarder** : enregistre votre état de formulaire côté serveur **sans** le publier.
- Utilisez-le lorsque vous devez quitter la page ou passer à une autre section.
- En arrière-plan, le client envoie un `PATCH /buildings/:id/working` avec un `If-Match` pour éviter d’écraser une version plus récente.

## Revue (aperçu des changements)
- Bouton **Revue** : ouvre un panneau latéral avec les champs **visibles** montrant Avant/Après.
- Calcul local : compare **Données publiées (committed)** vs **vos réponses actuelles** avant publication.
- Servez-vous-en pour vérifier rapidement ce qui va changer.

## Publier
- Bouton **Publier** : engage vos changements et incrémente la version.
- Avant l’envoi, une **confirmation** apparaît :
  - Si des sélections masquent des champs déjà remplis, un avertissement détaillé est affiché.
  - Sinon, une simple confirmation “Publier les changements actuels ?”.
- En cas de concurrence (autre onglet), un **conflit (412)** s’affiche, avec un chemin “Recharger & Revoir”.

## Indicateur de version
- L’étiquette `vN` dans l’en-tête montre la version publiée actuelle.
- Elle se met à jour après un chargement et après une publication réussie.

## Bonnes pratiques
- **Travail longue durée** : Sauvegardez régulièrement (brouillon).
- **Avant de publier** : Utilisez **Revue** pour relire les modifications.
- **Conflits** : Si vous travaillez à plusieurs, gardez un seul onglet en mode édition par bâtiment pour minimiser les 412.


## Comment fonctionne la Revue après un rechargement
- **Revue** compare toujours vos réponses **au dernier état publié** (baseline).
- Si vous cliquez **Sauvegarder** puis **rechargez la page**, vos réponses sont rechargées depuis le brouillon **et** la Revue continue d’afficher les différences par rapport à la **version publiée**, jusqu’à ce que vous **publiez**.


## Astuce (si la Revue affiche d’anciens changements après un rechargement)
- Si, après avoir **rechargé la page**, la **Revue** vous montre encore d’anciens changements, cliquez simplement sur **Publier** pour **réinitialiser la Revue** (la publication remet la baseline à jour et vide la liste des changements visibles).
- De manière générale : si vous voyez des « vieux » changements dans la Revue, **publiez** pour la remettre à zéro.
