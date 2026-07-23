---
title: Catalogue
hide:
  - toc
---

# Catalogue

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
  <section class="catalog-toolbar" aria-label="Filtres du catalogue">
    <div class="catalog-search">
      <label for="catalog-search">Rechercher</label>
      <input id="catalog-search" type="search" placeholder="Titre, thème, niveau..." data-catalog-search>
    </div>

    <div class="catalog-filter">
      <label for="catalog-type">Type</label>
      <select id="catalog-type" data-catalog-type>
        <option value="">Tous</option>
      </select>
    </div>

    <div class="catalog-filter">
      <label for="catalog-subject">Disciplines abordées</label>
      <select id="catalog-subject" data-catalog-subject>
        <option value="">Toutes</option>
      </select>
    </div>

    <div class="catalog-filter">
      <label for="catalog-level">Niveau</label>
      <select id="catalog-level" data-catalog-level>
        <option value="">Tous</option>
      </select>
    </div>
  </section>

  <div class="catalog-state" data-catalog-loading>Chargement des activités...</div>
  <div class="catalog-state catalog-state--summary" data-catalog-summary hidden></div>
  <div class="catalog-state" data-catalog-empty hidden>Aucune activité ne correspond aux filtres.</div>
  <div class="catalog-state catalog-state--error" data-catalog-error hidden>Impossible de charger le catalogue Terra Numerica.</div>

  <section class="catalog-grid" data-catalog-grid aria-live="polite"></section>
</div>
