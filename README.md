# Catalogue TNG

Base front MkDocs pour le catalogue de ressources Terra Numerica Grenoble.

Le catalogue appelle l’API Terra Numerica configurée dans `docs/index.md` avec la collection `tng` forcée côté JavaScript.
Le contrat TN-Events cible est documenté dans `TN_EVENTS_INTEGRATION.md`.

## Installation

```bash
pip install -r requirements.txt
```

## Lancement local

```bash
mkdocs serve
```

Le site sera disponible sur `http://127.0.0.1:8000/`.

## Catalogue

La page d’accueil `docs/index.md` affiche directement le catalogue. Il n’y a plus de route `/catalogue/` séparée.

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
  data-events-base-url="http://127.0.0.1:8002"
  data-events-public-base-url=""
  data-activity-detail-url="activite/"
>
```

Variables disponibles :

- `data-api-base-url` : base de l’API Terra Numerica. Valeur actuelle : `https://portail.terra-numerica.org/prpact/api/`.
- `data-catalogue-url` : URL appelée pour alimenter les cartes du catalogue. Valeur actuelle : `https://portail.terra-numerica.org/prpact/api/act/`.
- `data-count-url` : URL appelée pour afficher le nombre d’activités TNG. Valeur actuelle : `https://portail.terra-numerica.org/prpact/api/act/count`.
- `data-types-url` : URL complète de l’énumération des types. Valeur actuelle : `https://portail.terra-numerica.org/prpact/api/enum/types`.
- `data-subjects-url` : URL complète de l’énumération des matières. Valeur actuelle : `https://portail.terra-numerica.org/prpact/api/enum/subjects`.
- `data-levels-url` : URL complète de l’énumération des niveaux. Valeur actuelle : `https://portail.terra-numerica.org/prpact/api/enum/levels`.
- `data-events-base-url` : base de l’API TN-Events utilisée pour charger les événements, créneaux et inscriptions. Valeur actuelle de test : `http://127.0.0.1:8002`.
- `data-events-public-base-url` : base publique TN-Events utilisée pour construire les liens visibles `/events/<slug>/reg`. Si vide, le front réutilise `data-events-base-url`.
- `data-activity-detail-url` : URL de la page détail activité. Valeur actuelle sur l’accueil : `activite/`.

Les filtres `Type`, `Matière` et `Niveau` lisent `query_arg` et `label` depuis les endpoints d’énumération quand l’API les fournit.
La collection `tng` et le statut `operational` sont toujours envoyés à l’API, mais ils ne sont pas affichés comme filtres dans l’interface.

Filtres envoyés à `GET /act/` :

| Filtre | Type | Usage |
| --- | --- | --- |
| `collection` | string | Toujours `tng` |
| `status` | string | Toujours `operational` |
| `search` | string | Recherche texte libre |
| `type` | array string | `workshop`, `demonstrator`, `conference`, `online_app`, `static_exhibition`, `mobile_exhibition`, `combined`, `course` |
| `subject` | array string | Matière scolaire, valeurs dynamiques via `/enum/subjects` |
| `level` | array string | Niveau scolaire, valeurs dynamiques via `/enum/levels` |

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

Endpoints utilisés par le front :

- `GET https://portail.terra-numerica.org/prpact/api/act/` : liste des activités TNG affichées en cartes, avec filtres en query string.
- `GET https://portail.terra-numerica.org/prpact/api/act/<uuid>` : détail complet de l’activité affiché sur la page `docs/activite.md`.
- `GET https://portail.terra-numerica.org/prpact/api/act/count` : nombre d’activités TNG.
- `GET https://portail.terra-numerica.org/prpact/api/enum/types` : options du filtre type.
- `GET https://portail.terra-numerica.org/prpact/api/enum/subjects` : options du filtre matière.
- `GET https://portail.terra-numerica.org/prpact/api/enum/levels` : options du filtre niveau.
- `GET http://127.0.0.1:8002/api/health/` : test de connexion TN-Events.
- `GET http://127.0.0.1:8002/api/events/` : liste des événements TN-Events.

Endpoints TN-Events prévus ensuite :

- `GET http://127.0.0.1:8002/api/events/<slug>/`
- `GET http://127.0.0.1:8002/api/events/<slug>/slots/`
- `POST http://127.0.0.1:8002/api/events/<slug>/registrations/`

## Inscription Sans Redirection

Le bouton `S’inscrire` reste dans le front MkDocs :

1. Le front identifie un événement TN-Events par `slug`.
2. Il ouvre une modale d’inscription.
3. Il charge les créneaux :

```text
GET http://127.0.0.1:8002/api/events/<slug>/slots/
```

4. Il envoie l’inscription :

```text
POST http://127.0.0.1:8002/api/events/<slug>/registrations/
```

Payload envoyé :

```json
{
  "slot": 12,
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.org",
  "adults_count": 1,
  "children_count": 2,
  "age_min": 8,
  "age_max": 10
}
```

Si l’API événements renvoie `url`, `event_url`, `registration_url` ou `booking_url`, le front utilise cette URL comme vrai lien TN-Events.
Sinon, il construit un lien public avec `data-events-public-base-url` :

```text
<data-events-public-base-url>/events/<slug>/reg
```

Si aucun événement TN-Events ne correspond à l’activité Terra Numerica et qu’aucun lien d’inscription n’est fourni par l’API catalogue, le bouton `S’inscrire` n’est pas affiché.

Pour tester l’API côté terminal :

```bash
curl "$API/enum/types"
curl "$API/enum/levels"
```

Le front reste en JavaScript vanilla : pas de React, Vue, ni backend ajouté.

## Page Détail Activité

Le bouton `Détails` d’une carte ouvre une page dédiée :

```text
/activite/?slug=<slug-lisible>&uuid=<uuid-api>
```

Le `slug` sert à garder une URL lisible. Le `uuid` reste nécessaire pour appeler l’endpoint PRP-act :

```text
GET https://portail.terra-numerica.org/prpact/api/act/<uuid>
```
