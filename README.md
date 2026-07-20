# Catalogue TNG

Front statique MkDocs pour consulter les activités Terra Numerica Grenoble.

Le catalogue est affiché directement sur la page d’accueil `docs/index.md`. Il consomme l’API PRP-act du portail Terra Numerica avec du JavaScript vanilla et MkDocs.

## Installation

```bash
pip install -r requirements.txt
```

## Lancement Local

```bash
mkdocs serve
```

Le site sera disponible sur `http://127.0.0.1:8000/`.

## Structure

- `docs/index.md` : page d’accueil et catalogue.
- `docs/activite.md` : page détail d’une activité.
- `docs/javascripts/catalogue.js` : appels API, filtres, rendu des cartes et détails.
- `docs/assets/stylesheets/catalog.css` : styles du catalogue.
- `mkdocs.yml` : configuration MkDocs.

## Fonctionnalités En Place

- Catalogue directement disponible à la racine du site.
- Chargement des activités TNG opérationnelles depuis PRP-act.
- Recherche texte et filtres par type, matière et niveau.
- Cartes catalogue avec image, type, durée, contributeur, thèmes et lien détail.
- Page détail dédiée par activité.
- Descriptions API rendues comme du Markdown simple.
- Images média PRP-act transformées en URLs complètes.
- Informations pratiques affichées sous forme de fiches.

## Configuration Catalogue

Le conteneur principal dans `docs/index.md` configure les URLs utilisées par le front :

```html
<div
  class="catalog-app"
  data-catalog-app
  data-api-base-url="https://portail.terra-numerica.org/prpact/api/"
  data-catalogue-url="https://portail.terra-numerica.org/prpact/api/act/"
  data-count-url="https://portail.terra-numerica.org/prpact/api/act/count"
  data-types-url="https://portail.terra-numerica.org/prpact/api/enum/types"
  data-subjects-url="https://portail.terra-numerica.org/prpact/api/enum/subjects"
  data-levels-url="https://portail.terra-numerica.org/prpact/api/enum/levels"
  data-activity-detail-url="activite/"
>
```

Variables disponibles :

- `data-api-base-url` : base de l’API PRP-act.
- `data-catalogue-url` : endpoint de liste des activités.
- `data-count-url` : endpoint de comptage.
- `data-types-url` : endpoint des types d’activités.
- `data-subjects-url` : endpoint des matières.
- `data-levels-url` : endpoint des niveaux.
- `data-activity-detail-url` : page détail utilisée par les boutons `Détails`.

## Filtres

La collection `tng` et le statut `operational` sont forcés côté JavaScript. Ils ne sont pas affichés comme filtres utilisateur.

Filtres visibles :

| Filtre | Source | Usage |
| --- | --- | --- |
| Recherche | champ texte | Envoie `search=<texte>` |
| Type | `/enum/types` | Envoie le `query_arg` fourni par l’API |
| Matière | `/enum/subjects` | Envoie le `query_arg` fourni par l’API |
| Niveau | `/enum/levels` | Envoie le `query_arg` fourni par l’API |

Fallback local du filtre `Type` si l’énumération est indisponible :

| Label affiché | Query arg envoyé |
| --- | --- |
| Ateliers | `type=workshop` |
| Démonstrateurs | `type=demonstrator` |
| Conférences | `type=conference` |
| Applications en ligne | `type=online_app` |
| Expositions fixes | `type=static_exhibition` |
| Expositions mobiles | `type=mobile_exhibition` |
| Combinés | `type=combined` |
| Cours | `type=course` |

## Endpoints Utilisés

- `GET https://portail.terra-numerica.org/prpact/api/act/` : liste des activités, avec `collection=tng`, `status=operational` et les filtres utilisateur.
- `GET https://portail.terra-numerica.org/prpact/api/act/count` : nombre d’activités.
- `GET https://portail.terra-numerica.org/prpact/api/act/<uuid>` : détail complet d’une activité.
- `GET https://portail.terra-numerica.org/prpact/api/enum/types` : types d’activités.
- `GET https://portail.terra-numerica.org/prpact/api/enum/subjects` : matières.
- `GET https://portail.terra-numerica.org/prpact/api/enum/levels` : niveaux.

## Page Détail

Le bouton `Détails` d’une carte ouvre :

```text
/activite/?slug=<slug-lisible>&uuid=<uuid-api>
```

Le `slug` rend l’URL lisible. Le `uuid` est utilisé pour appeler :

```text
GET https://portail.terra-numerica.org/prpact/api/act/<uuid>
```

La page détail affiche :

- la description formatée depuis le Markdown fourni par l’API ;
- les informations pratiques sous forme de fiches ;
- les illustrations, avec correction des URLs média relatives ;
- les documents et liens externes ;
- les activités liées et séquences si l’API les fournit ;
- les données brutes dans un bloc repliable.

## Évolutions Possibles

- Brancher une API TN-Events dédiée pour gérer les inscriptions depuis le front.
- Ajouter une correspondance explicite entre activité PRP-act et événement TN-Events.
- Ajouter une demande de réservation pour les activités sans événement programmé.
- Ajouter une pagination si le volume d’activités augmente.
- Générer des pages détail statiques au build si le catalogue doit être mieux indexé.

## Validation

Commandes utilisées pour vérifier le projet :

```bash
node --check docs/javascripts/catalogue.js
mkdocs build --strict
```

## Déploiement GitHub Pages

Le dépôt contient un workflow GitHub Actions dans `.github/workflows/pages.yml`.

Pour publier le site :

1. Pousser le code sur la branche `main`.
2. Dans GitHub, ouvrir `Settings > Pages`.
3. Dans `Build and deployment`, choisir `Source: GitHub Actions`.
4. Relancer le workflow `Deploy MkDocs site` si besoin.

Le workflow installe les dépendances de `requirements.txt`, build le site avec MkDocs Material, puis publie le dossier `site`.
