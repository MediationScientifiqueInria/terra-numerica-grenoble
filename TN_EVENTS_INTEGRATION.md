# Intégration TN-Events

Objectif : connecter le front de consultation du catalogue de ressources à TN-Events, sans dépendre de l’admin Django ni scraper les pages HTML existantes.

## Contexte TN-Events

- Backend Django dans `src/`.
- App métier principale : `events`.
- Modèles existants :
  - `Event` : événement.
  - `Slot` : créneau lié à un événement.
  - `Registration` : inscription à un créneau.
- Routes HTML actuelles :
  - `/events/` : liste des événements.
  - `/events/<slug>/reg` : formulaire d’inscription.
  - `/admin/` : gestion interne.
- Il n’existe pas encore d’API JSON propre.
- `django-cors-headers` est installé, mais la config CORS reste à finaliser si le front est sur un autre domaine ou port.

## À Faire Côté Intégration

1. Ne pas intégrer le front directement avec `/admin/`.
   Le front catalogue doit parler à des endpoints publics dédiés.

2. Ajouter ou demander au backend TN-Events une API JSON minimale :
   - `GET /api/events/`
   - `GET /api/events/<slug>/`
   - `GET /api/events/<slug>/slots/`
   - `POST /api/events/<slug>/registrations/`
   - Plus tard : `POST /api/reservation-requests/`

3. Contrat JSON souhaité pour les événements :

```json
{
  "id": 1,
  "slug": "atelier-robotique",
  "name": "Atelier robotique",
  "location": "Terra Numerica Grenoble",
  "is_past": false
}
```

4. Contrat JSON souhaité pour les créneaux :

```json
{
  "id": 12,
  "day": "2026-09-15",
  "start_time": "10:00",
  "end_time": "11:30",
  "max_people": 20,
  "available_places": 8,
  "registration_limit": "2026-09-14",
  "is_full": false
}
```

5. Contrat JSON souhaité pour une inscription :

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

6. Côté front, prévoir ces états :
   - chargement des événements ;
   - aucun événement disponible ;
   - événement passé ;
   - inscriptions fermées ;
   - créneau complet ;
   - inscription réussie ;
   - erreur de validation ;
   - erreur serveur.

7. Si le front tourne sur un autre port ou domaine, demander au backend d’ajouter :

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]
```

8. Pour une première version, privilégier une connexion simple :
   - catalogue front = consultation des ressources ;
   - bouton “S’inscrire” ou “Réserver” ;
   - redirection vers TN-Events ou appel API selon disponibilité backend.

9. Si l’API n’est pas encore prête, utiliser temporairement des liens profonds :

```text
/events/<event_slug>/reg
```

Cette solution doit rester transitoire.

10. Pour TNG, anticiper une séparation par site :

```json
{
  "site": "TNG"
}
```

Le front doit pouvoir filtrer ou appeler seulement les ressources/événements TNG.

## Recommandation

Pour aller vite : commencer par connecter le catalogue à TN-Events via des liens `/events/<slug>/reg`.

Pour faire propre : ajouter une API JSON minimale côté TN-Events, puis faire consommer cette API par le front. C’est la meilleure base pour ajouter ensuite réservations, validation et notifications.
