(function () {
  const FALLBACK_TYPE_FILTERS = [
    { queryArg: "type=workshop", label: "Ateliers" },
    { queryArg: "type=demonstrator", label: "Démonstrateurs" },
    { queryArg: "type=conference", label: "Conférences" },
    { queryArg: "type=online_app", label: "Applications en ligne" },
    { queryArg: "type=static_exhibition", label: "Expositions fixes" },
    { queryArg: "type=mobile_exhibition", label: "Expositions mobiles" },
    { queryArg: "type=combined", label: "Combinés" },
    { queryArg: "type=course", label: "Cours" },
  ];
  const CATALOG_COLLECTION_QUERY = "collection=tng";
  const CATALOG_STATUS_QUERY = "status=operational";

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char];
    });
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) return [value];
    if (value && Array.isArray(value.results)) return value.results;
    if (value && Array.isArray(value.items)) return value.items;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.activities)) return value.activities;
    if (value && Array.isArray(value.objects)) return value.objects;
    if (value && Array.isArray(value.member)) return value.member;
    if (value && Array.isArray(value["hydra:member"])) return value["hydra:member"];
    return [];
  }

  function countFromPayload(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    if (value && typeof value === "object") {
      const count = firstValue(value, ["count", "total", "total_count", "nb", "number"]);
      if (count !== "" && !Number.isNaN(Number(count))) return Number(count);
    }
    return null;
  }

  function firstValue(item, keys) {
    for (const key of keys) {
      const value = item[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  function labelFromValue(value) {
    if (Array.isArray(value)) return value.map(labelFromValue).filter(Boolean).join(", ");
    if (value && typeof value === "object") {
      return firstValue(value, ["label", "name", "title", "legend", "value", "slug", "id"]);
    }
    return value || "";
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function formatDuration(value) {
    const duration = String(value || "");
    const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return duration;
    const [, days, hours, minutes, seconds] = match.map((item) => Number(item || 0));
    const parts = [];
    if (days) parts.push(`${days} j`);
    if (hours) parts.push(`${hours} h`);
    if (minutes) parts.push(`${minutes} min`);
    if (seconds && parts.length === 0) parts.push(`${seconds} s`);
    return parts.join(" ") || "";
  }

  function optionValue(value) {
    if (value && typeof value === "object") {
      return firstValue(value, ["value", "slug", "id", "name", "label"]);
    }
    return value || "";
  }

  function apiUrl(baseUrl, path, params) {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const base = new URL(normalizedBase, window.location.origin);
    const url = new URL(path.replace(/^\//, ""), base);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  function fillQueryArgSelect(select, options) {
    const current = select.value;
    select.querySelectorAll("option:not([value=''])").forEach((option) => option.remove());
    options.forEach(({ queryArg, label }) => {
      const option = document.createElement("option");
      option.value = queryArg;
      option.textContent = label;
      select.appendChild(option);
    });
    select.value = [...select.options].some((option) => option.value === current) ? current : "";
  }

  function withQueryArgs(url, queryArgs) {
    const nextUrl = new URL(url, window.location.origin);

    queryArgs.filter(Boolean).forEach((queryArg) => {
      const params = new URLSearchParams(queryArg);
      params.forEach((value, key) => {
        nextUrl.searchParams.set(key, value);
      });
    });
    return nextUrl.toString();
  }

  function slugify(value) {
    return normalize(value)
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function renderInlineMarkdown(value) {
    return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function renderMarkdown(value) {
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    let list = [];

    function flushParagraph() {
      if (paragraph.length === 0) return;
      blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function flushList() {
      if (list.length === 0) return;
      blocks.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      const listItem = trimmed.match(/^[-*]\s+(.+)$/);

      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      if (heading) {
        flushParagraph();
        flushList();
        const headingText = heading[1].trim();
        const labelMatch = headingText.match(/^([^:]{2,40})\s*:\s*(.+)$/);
        if (labelMatch) {
          blocks.push(`<p><strong>${renderInlineMarkdown(`${labelMatch[1]} :`)}</strong> ${renderInlineMarkdown(labelMatch[2])}</p>`);
        } else {
          blocks.push(`<h5>${renderInlineMarkdown(headingText)}</h5>`);
        }
        return;
      }

      if (listItem) {
        flushParagraph();
        list.push(listItem[1]);
        return;
      }

      flushList();
      paragraph.push(trimmed);
    });

    flushParagraph();
    flushList();
    return blocks.join("");
  }

  function renderValue(value) {
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) return value.map(renderValue).filter(Boolean).join(", ");
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (typeof value === "object") return labelFromValue(value) || JSON.stringify(value);
    return String(value);
  }

  function detailLinkList(items) {
    const links = asArray(items)
      .map((item) => {
        const url = firstValue(item, ["url", "href", "link"]);
        const title = firstValue(item, ["title", "label", "name"]) || url;
        if (!url) return "";
        return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a></li>`;
      })
      .filter(Boolean)
      .join("");
    return links ? `<ul class="activity-detail__list">${links}</ul>` : "";
  }

  function detailReferenceList(items) {
    const references = asArray(items)
      .map((item) => {
        const position = firstValue(item, ["position"]);
        const nestedActivity = firstValue(item, ["activity"]);
        const name = firstValue(item, ["name", "title", "label"])
          || labelFromValue(nestedActivity)
          || firstValue(item, ["uuid", "id"]);
        const prefix = position !== "" ? `${position}. ` : "";
        return name ? `<li>${escapeHtml(prefix + name)}</li>` : "";
      })
      .filter(Boolean)
      .join("");
    return references ? `<ul class="activity-detail__list">${references}</ul>` : "";
  }

  function mediaUrl(value, apiBaseUrl) {
    if (!value) return "";
    const url = String(value);
    if (/^https?:\/\//i.test(url) || url.startsWith("//")) return url;
    const apiUrlObject = new URL(apiBaseUrl, window.location.origin);
    if (url.startsWith("/")) return `${apiUrlObject.origin}${url}`;
    return new URL(url, apiUrlObject).toString();
  }

  function mediaSrcFromValue(value, apiBaseUrl) {
    if (!value) return "";
    if (typeof value === "string") {
      const imgMatch = value.match(/<img[^>]+src=["']([^"']+)["']/i);
      return mediaUrl(imgMatch ? imgMatch[1] : value, apiBaseUrl);
    }
    if (typeof value === "object") {
      const directValue = firstValue(value, ["url", "src", "image", "file", "thumbnail", "path"]);
      if (directValue && directValue !== value) return mediaSrcFromValue(directValue, apiBaseUrl);
    }
    return "";
  }

  function firstIllustrationUrl(activity, apiBaseUrl) {
    const illustration = activity.illustrations.find(Boolean);
    return mediaSrcFromValue(illustration, apiBaseUrl);
  }

  function detailIllustrations(items, apiBaseUrl) {
    const illustrations = asArray(items)
      .map((item) => {
        const url = mediaSrcFromValue(item, apiBaseUrl);
        const legend = firstValue(item, ["legend", "title", "label"]);
        if (!url) return "";
        return `
          <figure class="activity-detail__figure">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(legend || "Illustration de l’activité")}">
            ${legend ? `<figcaption>${escapeHtml(legend)}</figcaption>` : ""}
          </figure>
        `;
      })
      .filter(Boolean)
      .join("");
    return illustrations ? `<div class="activity-detail__figures">${illustrations}</div>` : "";
  }

  function technicalInfoCard(title, value, note) {
    const renderedValue = renderValue(value);
    if (!renderedValue) return "";
    return `
      <article class="activity-tech-card">
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(renderedValue)}</strong>
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </article>
    `;
  }

  function renderTechnicalInfo(additInfo) {
    if (!additInfo || typeof additInfo !== "object" || Array.isArray(additInfo)) return "";

    const needs = [
      ["needs_AC_supply", "Alimentation électrique"],
      ["needs_internet_access", "Accès Internet"],
      ["needs_large_display", "Projection / grand écran"],
      ["needs_tables", "Tables"],
      ["needs_seats", "Sièges"],
    ]
      .filter(([key]) => additInfo[key] === true)
      .map(([, label]) => label);

    const cards = [
      technicalInfoCard("Durée", formatDuration(firstValue(additInfo, ["duration"]))),
      technicalInfoCard("Installation", formatDuration(firstValue(additInfo, ["deployment_duration"]))),
      technicalInfoCard("Participants max", firstValue(additInfo, ["group_size_max"])),
      technicalInfoCard("Espace libre", firstValue(additInfo, ["minimal_free_space"])),
      technicalInfoCard("Écran", additInfo.no_screen === true ? "Non nécessaire" : ""),
      technicalInfoCard("Intervenant", firstValue(additInfo, ["speaker"])),
    ].filter(Boolean);

    const needsBlock = needs.length
      ? `
        <article class="activity-tech-card activity-tech-card--wide">
          <span>À prévoir</span>
          <div class="activity-tech-card__chips">
            ${needs.map((need) => `<em>${escapeHtml(need)}</em>`).join("")}
          </div>
        </article>
      `
      : "";

    const speakerDetails = firstValue(additInfo, ["speaker_details"]);
    const comments = firstValue(additInfo, ["comments"]);
    const notes = [
      speakerDetails ? ["Détails intervenant", speakerDetails] : null,
      comments ? ["Notes", comments] : null,
    ].filter(Boolean);
    const notesBlock = notes
      .map(([title, value]) => `
        <article class="activity-tech-note">
          <span>${escapeHtml(title)}</span>
          <div class="activity-detail__markdown">${renderMarkdown(value)}</div>
        </article>
      `)
      .join("");

    const content = [...cards, needsBlock, notesBlock].join("");
    return content ? `<div class="activity-tech-grid">${content}</div>` : "";
  }

  function mapActivity(item) {
    const type = firstValue(item, ["type", "resource_type", "activity_type", "category"]);
    const level = firstValue(item, ["levels", "level", "niveau", "school_level", "audience", "public"]);
    const eventUrl = firstValue(item, ["tn_events_url", "event_url", "registration_url", "booking_url"]);
    const eventSlug = firstValue(item, ["event_slug", "tn_events_slug"]);
    const subjects = firstValue(item, ["related_subjects", "subjects", "themes", "topics", "tags", "keywords"]);
    const additInfo = firstValue(item, ["addit_info", "additional_info"]);
    const provider = firstValue(item, ["provider"]);
    const collection = firstValue(item, ["collection"]);
    const status = firstValue(item, ["status"]);
    const duration = firstValue(item, ["duration", "duree"]) || (additInfo ? firstValue(additInfo, ["duration"]) : "");

    return {
      id: firstValue(item, ["id", "pk", "uuid", "slug"]),
      title: firstValue(item, ["title", "name", "label", "titre", "nom"]),
      description: compactText(firstValue(item, ["short_description", "description", "summary", "excerpt", "abstract", "resume"])),
      longDescription: compactText(firstValue(item, ["long_description", "longDescription"])),
      typeValue: optionValue(type),
      typeLabel: labelFromValue(type) || "Activité",
      levelValue: optionValue(level),
      levelLabel: labelFromValue(level) || "Tous niveaux",
      duration: formatDuration(duration),
      location: firstValue(item, ["location", "lieu", "place"]),
      collectionLabel: labelFromValue(collection),
      statusLabel: labelFromValue(status),
      providerLabel: labelFromValue(provider),
      themes: Array.isArray(subjects) ? subjects.map(labelFromValue).filter(Boolean) : String(subjects || "").split(",").map((theme) => theme.trim()).filter(Boolean),
      dependencies: additInfo && Array.isArray(additInfo.dependencies) ? additInfo.dependencies.filter(Boolean) : [],
      additInfo: additInfo && typeof additInfo === "object" ? additInfo : null,
      illustrations: asArray(firstValue(item, ["illustrations"])),
      attachments: asArray(firstValue(item, ["attachments"])),
      seeAlsoLinks: asArray(firstValue(item, ["see_also_links", "links"])),
      referredActivities: asArray(firstValue(item, ["activities"])),
      sequence: asArray(firstValue(item, ["sequence"])),
      variantOf: firstValue(item, ["variant_of"]),
      isVariant: Boolean(firstValue(item, ["is_variant", "isVariant"])),
      isAlias: Boolean(firstValue(item, ["is_alias", "isAlias"])),
      eventUrl,
      eventSlug,
      raw: item,
    };
  }

  function tnEventsUrl(activity, eventsBaseUrl) {
    if (activity.eventUrl) return activity.eventUrl;
    if (!activity.eventSlug || !eventsBaseUrl) return "";
    const base = eventsBaseUrl.replace(/\/$/, "");
    return `${base}/events/${activity.eventSlug}/reg`;
  }

  function publicEventUrl(event, eventsPublicBaseUrl, eventsBaseUrl) {
    const explicitUrl = firstValue(event, ["registrationUrl", "eventUrl", "url"]);
    if (explicitUrl) return explicitUrl;
    const baseUrl = eventsPublicBaseUrl || eventsBaseUrl;
    if (!event.slug || !baseUrl) return "";
    return `${baseUrl.replace(/\/$/, "")}/events/${event.slug}/reg`;
  }

  function eventSlugFromActivity(activity) {
    return slugify(activity.eventSlug || activity.id || activity.title);
  }

  function activityDetailPageUrl(activity, detailPageUrl) {
    const url = new URL(detailPageUrl || "activite/", window.location.href);
    url.searchParams.set("slug", slugify(activity.title || activity.id || "activite"));
    url.searchParams.set("uuid", activity.id);
    return url.toString();
  }

  function findMatchingEvent(activity, eventsBySlug) {
    const activitySlug = eventSlugFromActivity(activity);
    if (!activitySlug) return null;
    if (eventsBySlug.has(activitySlug)) return eventsBySlug.get(activitySlug);

    return [...eventsBySlug.entries()].find(([eventSlug]) => (
      eventSlug.includes(activitySlug) || activitySlug.includes(eventSlug)
    ))?.[1] || null;
  }

  function renderActivity(activity, eventsBaseUrl, eventsPublicBaseUrl, eventsBySlug, activityDetailUrl, apiBaseUrl) {
    const article = document.createElement("article");
    const typeClass = slugify(activity.typeValue || activity.typeLabel || "activity");
    article.className = `resource-card resource-card--${typeClass}`;
    const imageUrl = firstIllustrationUrl(activity, apiBaseUrl);
    const tags = activity.themes
      .map((theme) => `<span class="resource-card__tag">${escapeHtml(theme)}</span>`)
      .join("");
    const meta = [
      activity.duration,
      activity.providerLabel,
    ].filter(Boolean);
    const matchedEvent = findMatchingEvent(activity, eventsBySlug);
    const eventLink = matchedEvent
      ? publicEventUrl(matchedEvent, eventsPublicBaseUrl, eventsBaseUrl)
      : tnEventsUrl(activity, eventsPublicBaseUrl || eventsBaseUrl);
    const registrationSlug = matchedEvent?.slug;
    const action = registrationSlug
      ? `<button class="resource-card__action" type="button" data-register-event="${escapeHtml(registrationSlug)}">S’inscrire</button>`
      : eventLink
        ? `<a class="resource-card__action" href="${escapeHtml(eventLink)}">S’inscrire</a>`
        : "";
    const detailAction = activity.id
      ? `<a class="resource-card__action resource-card__action--secondary" href="${escapeHtml(activityDetailPageUrl(activity, activityDetailUrl))}">Détails</a>`
      : "";

    article.innerHTML = `
      <div class="resource-card__media${imageUrl ? " has-image" : ""}">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(activity.title || "Illustration de l’activité")}">` : ""}
        <span class="resource-card__type">${escapeHtml(activity.typeLabel)}</span>
      </div>
      <div class="resource-card__body">
        <h2>${escapeHtml(activity.title || "Activité sans titre")}</h2>
        <div class="resource-card__meta">
          ${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        <p>${escapeHtml(activity.description || "Description à compléter.")}</p>
        <div class="resource-card__tags">${tags}</div>
      </div>
      <footer class="resource-card__footer">
        <div class="resource-card__actions">
          ${detailAction}
          ${action}
        </div>
      </footer>
    `;

    return article;
  }

  function renderActivityDetail(detail, apiBaseUrl) {
    const title = firstValue(detail, ["name", "title", "label"]) || "Activité";
    const shortDescription = firstValue(detail, ["short_description", "description", "summary"]);
    const longDescription = firstValue(detail, ["long_description", "body", "content"]);
    const showShortDescription = shortDescription && !longDescription;
    const additInfo = firstValue(detail, ["addit_info", "additional_info"]);
    const rawJson = JSON.stringify(detail, null, 2);

    const technicalInfo = renderTechnicalInfo(additInfo);
    const links = detailLinkList(firstValue(detail, ["see_also_links", "links"]));
    const attachments = detailLinkList(firstValue(detail, ["attachments", "documents"]));
    const illustrations = detailIllustrations(firstValue(detail, ["illustrations", "images"]), apiBaseUrl);
    const combinedActivities = detailReferenceList(firstValue(detail, ["activities"]));
    const sequence = detailReferenceList(firstValue(detail, ["sequence"]));

    return `
      <div class="activity-detail">
        <h3>${escapeHtml(title)}</h3>
        ${showShortDescription ? `<div class="activity-detail__lead activity-detail__markdown">${renderMarkdown(shortDescription)}</div>` : ""}
        ${longDescription ? `<section><h4>Description</h4><div class="activity-detail__markdown">${renderMarkdown(longDescription)}</div></section>` : ""}
        ${technicalInfo ? `<section><h4>Préparation pratique</h4>${technicalInfo}</section>` : ""}
        ${illustrations ? `<section><h4>Illustrations</h4>${illustrations}</section>` : ""}
        ${attachments ? `<section><h4>Documents</h4>${attachments}</section>` : ""}
        ${links ? `<section><h4>Liens</h4>${links}</section>` : ""}
        ${combinedActivities ? `<section><h4>Activités liées</h4>${combinedActivities}</section>` : ""}
        ${sequence ? `<section><h4>Séquence</h4>${sequence}</section>` : ""}
        <details class="activity-detail__raw">
          <summary>Données brutes</summary>
          <pre>${escapeHtml(rawJson)}</pre>
        </details>
      </div>
    `;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response.json();
  }

  function filterFromEnum(item, fallbackParamName) {
    const label = labelFromValue(item);
    const queryArg = firstValue(item, ["query_arg", "queryArg", "query", "url_query"]);
    const value = optionValue(item);

    if (queryArg && label) {
      const normalizedQueryArg = String(queryArg);
      return {
        queryArg: normalizedQueryArg.includes("=") || !fallbackParamName
          ? normalizedQueryArg
          : `${fallbackParamName}=${encodeURIComponent(normalizedQueryArg)}`,
        label: String(label),
      };
    }
    if (value && label && fallbackParamName) {
      return { queryArg: `${fallbackParamName}=${encodeURIComponent(value)}`, label: String(label) };
    }
    return null;
  }

  async function loadTypeFilters(url) {
    return loadQueryArgFilters(url, FALLBACK_TYPE_FILTERS, "type");
  }

  async function loadQueryArgFilters(url, fallbackOptions, fallbackParamName) {
    try {
      const payload = await fetchJson(url);
      const options = asArray(payload).map((item) => filterFromEnum(item, fallbackParamName)).filter(Boolean);
      return options.length ? options : fallbackOptions;
    } catch {
      return fallbackOptions;
    }
  }

  function mapEvent(item) {
    return {
      id: firstValue(item, ["id", "pk", "uuid"]),
      slug: firstValue(item, ["slug"]),
      name: firstValue(item, ["name", "title", "label"]),
      location: firstValue(item, ["location", "lieu"]),
      url: firstValue(item, ["url", "absolute_url", "public_url"]),
      eventUrl: firstValue(item, ["event_url", "detail_url"]),
      registrationUrl: firstValue(item, ["registration_url", "booking_url"]),
      isPast: Boolean(firstValue(item, ["is_past", "isPast"])),
    };
  }

  function eventMatchKey(event) {
    return normalize(event.slug || event.name)
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function mapSlot(item) {
    return {
      id: firstValue(item, ["id", "pk"]),
      day: firstValue(item, ["day", "date"]),
      startTime: firstValue(item, ["start_time", "startTime", "start"]),
      endTime: firstValue(item, ["end_time", "endTime", "end"]),
      maxPeople: firstValue(item, ["max_people", "maxPeople"]),
      availablePlaces: firstValue(item, ["available_places", "availablePlaces"]),
      registrationLimit: firstValue(item, ["registration_limit", "registrationLimit"]),
      isFull: Boolean(firstValue(item, ["is_full", "isFull"])),
    };
  }

  function slotLabel(slot) {
    const time = [slot.startTime, slot.endTime].filter(Boolean).join(" - ");
    const places = slot.availablePlaces !== "" ? ` · ${slot.availablePlaces} place${Number(slot.availablePlaces) > 1 ? "s" : ""} restante${Number(slot.availablePlaces) > 1 ? "s" : ""}` : "";
    return [slot.day, time].filter(Boolean).join(" · ") + places;
  }

  function createRegistrationModal() {
    const modal = document.createElement("div");
    modal.className = "registration-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="registration-modal__backdrop"></div>
      <section class="registration-modal__panel" role="dialog" aria-modal="true" aria-labelledby="registration-title">
        <header class="registration-modal__header">
          <div>
            <p class="tng-kicker">TN-Events</p>
            <h2 id="registration-title">Inscription</h2>
          </div>
          <button class="registration-modal__close" type="button" data-registration-close aria-label="Fermer">×</button>
        </header>
        <div class="catalog-state" data-registration-loading hidden>Chargement des créneaux...</div>
        <div class="catalog-state catalog-state--error" data-registration-error hidden></div>
        <div class="catalog-state catalog-state--success" data-registration-success hidden>Inscription enregistrée.</div>
        <form class="registration-form" data-registration-form>
          <label>
            Créneau
            <select name="slot" required data-registration-slots></select>
          </label>
          <div class="registration-form__grid">
            <label>Prénom <input name="first_name" autocomplete="given-name" required></label>
            <label>Nom <input name="last_name" autocomplete="family-name" required></label>
          </div>
          <label>Email <input name="email" type="email" autocomplete="email" required></label>
          <div class="registration-form__counts">
            <label>Adultes <input name="adults_count" type="number" min="0" value="1" required></label>
            <div class="registration-form__children-row">
              <label>Enfants <input name="children_count" type="number" min="0" value="0" required></label>
              <label>Âge min <input name="age_min" type="number" min="0"></label>
              <label>Âge max <input name="age_max" type="number" min="0"></label>
            </div>
          </div>
          <footer class="registration-form__footer">
            <button class="resource-card__action" type="submit">Valider l’inscription</button>
          </footer>
        </form>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function initCatalogue(app) {
    const apiBaseUrl = app.dataset.apiBaseUrl || "https://portail.terra-numerica.org/prpact/api/";
    const catalogueUrl = app.dataset.catalogueUrl || apiUrl(apiBaseUrl, "act/");
    const countUrl = app.dataset.countUrl || apiUrl(apiBaseUrl, "act/count");
    const subjectsUrl = app.dataset.subjectsUrl || apiUrl(apiBaseUrl, "enum/subjects");
    const levelsUrl = app.dataset.levelsUrl || apiUrl(apiBaseUrl, "enum/levels");
    const eventsBaseUrl = app.dataset.eventsBaseUrl || "";
    const eventsPublicBaseUrl = app.dataset.eventsPublicBaseUrl || eventsBaseUrl;
    const activityDetailUrl = app.dataset.activityDetailUrl || "activite/";
    const grid = app.querySelector("[data-catalog-grid]");
    const loading = app.querySelector("[data-catalog-loading]");
    const summary = app.querySelector("[data-catalog-summary]");
    const empty = app.querySelector("[data-catalog-empty]");
    const error = app.querySelector("[data-catalog-error]");
    const search = app.querySelector("[data-catalog-search]");
    const typeSelect = app.querySelector("[data-catalog-type]");
    const subjectSelect = app.querySelector("[data-catalog-subject]");
    const levelSelect = app.querySelector("[data-catalog-level]");
    const registrationModal = createRegistrationModal();
    const registrationForm = registrationModal.querySelector("[data-registration-form]");
    const registrationSlots = registrationModal.querySelector("[data-registration-slots]");
    const registrationLoading = registrationModal.querySelector("[data-registration-loading]");
    const registrationError = registrationModal.querySelector("[data-registration-error]");
    const registrationSuccess = registrationModal.querySelector("[data-registration-success]");
    let searchTimeout = 0;

    let activities = [];
    const eventsBySlug = new Map();
    let currentRegistrationSlug = "";

    function selectedQueryArgs() {
      const queryArgs = [
        CATALOG_COLLECTION_QUERY,
        CATALOG_STATUS_QUERY,
        typeSelect.value,
        subjectSelect.value,
        levelSelect.value,
      ];

      if (search.value.trim()) queryArgs.push(`search=${encodeURIComponent(search.value.trim())}`);
      return queryArgs;
    }

    function countQueryArgs() {
      return [CATALOG_COLLECTION_QUERY];
    }

    function render() {
      grid.replaceChildren(...activities.map((activity) => renderActivity(activity, eventsBaseUrl, eventsPublicBaseUrl, eventsBySlug, activityDetailUrl, apiBaseUrl)));
      empty.hidden = activities.length !== 0;
    }

    async function loadEvents() {
      if (!eventsBaseUrl) {
        return;
      }

      try {
        await fetchJson(apiUrl(eventsBaseUrl, "api/health/"));
        const payload = await fetchJson(apiUrl(eventsBaseUrl, "api/events/"));
        const events = asArray(payload).map(mapEvent).filter((event) => event.slug);
        eventsBySlug.clear();
        events.forEach((event) => eventsBySlug.set(eventMatchKey(event), event));
        render();
      } catch (eventsLoadError) {
        console.error("Erreur de chargement TN-Events", eventsLoadError);
      }
    }

    function closeRegistrationModal() {
      registrationModal.hidden = true;
      currentRegistrationSlug = "";
    }

    async function openRegistrationModal(slug) {
      if (!slug || !eventsBaseUrl) return;
      currentRegistrationSlug = slug;
      registrationModal.hidden = false;
      registrationForm.hidden = true;
      registrationError.hidden = true;
      registrationSuccess.hidden = true;
      registrationLoading.hidden = false;
      registrationSlots.replaceChildren();

      try {
        const payload = await fetchJson(apiUrl(eventsBaseUrl, `api/events/${slug}/slots/`));
        const slots = asArray(payload).map(mapSlot);
        const availableSlots = slots.filter((slot) => !slot.isFull);

        availableSlots.forEach((slot) => {
          const option = document.createElement("option");
          option.value = slot.id;
          option.textContent = slotLabel(slot);
          registrationSlots.appendChild(option);
        });

        registrationLoading.hidden = true;
        if (availableSlots.length === 0) {
          registrationError.textContent = "Aucun créneau disponible pour cet événement.";
          registrationError.hidden = false;
          return;
        }
        registrationForm.hidden = false;
      } catch (slotError) {
        console.error("Erreur de chargement des créneaux", slotError);
        registrationLoading.hidden = true;
        registrationError.textContent = "Impossible de charger les créneaux.";
        registrationError.hidden = false;
      }
    }

    async function submitRegistration(event) {
      event.preventDefault();
      registrationError.hidden = true;
      registrationSuccess.hidden = true;

      const formData = new FormData(registrationForm);
      const payload = {
        slot: Number(formData.get("slot")),
        first_name: String(formData.get("first_name") || "").trim(),
        last_name: String(formData.get("last_name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        adults_count: Number(formData.get("adults_count") || 0),
        children_count: Number(formData.get("children_count") || 0),
        age_min: formData.get("age_min") ? Number(formData.get("age_min")) : null,
        age_max: formData.get("age_max") ? Number(formData.get("age_max")) : null,
      };

      try {
        const response = await fetch(apiUrl(eventsBaseUrl, `api/events/${currentRegistrationSlug}/registrations/`), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const details = await response.text();
          throw new Error(details || `HTTP ${response.status}`);
        }

        registrationForm.reset();
        registrationSuccess.hidden = false;
      } catch (submitError) {
        console.error("Erreur d’inscription", submitError);
        registrationError.textContent = "L’inscription n’a pas pu être enregistrée. Vérifiez les champs puis réessayez.";
        registrationError.hidden = false;
      }
    }

    function setLoadingState() {
      loading.hidden = false;
      summary.hidden = true;
      empty.hidden = true;
      error.hidden = true;
      grid.replaceChildren();
    }

    async function loadActivities() {
      setLoadingState();
      try {
        const [payload, countPayload] = await Promise.all([
          fetchJson(withQueryArgs(catalogueUrl, selectedQueryArgs())),
          fetchJson(withQueryArgs(countUrl, countQueryArgs())).catch(() => null),
        ]);
        const count = countFromPayload(payload) ?? countFromPayload(countPayload);
        activities = asArray(payload).map(mapActivity);
        loading.hidden = true;
        if (count !== null) {
          summary.textContent = `${count} activité${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""}.`;
          summary.hidden = false;
        } else if (activities.length > 0) {
          summary.textContent = `${activities.length} activité${activities.length > 1 ? "s" : ""} chargée${activities.length > 1 ? "s" : ""}.`;
          summary.hidden = false;
        }
        render();
      } catch (loadError) {
        console.error("Erreur de chargement du catalogue", loadError);
        loading.hidden = true;
        error.hidden = false;
      }
    }

    search.addEventListener("input", () => {
      window.clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(loadActivities, 250);
    });
    typeSelect.addEventListener("change", loadActivities);
    subjectSelect.addEventListener("change", loadActivities);
    levelSelect.addEventListener("change", loadActivities);
    app.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-register-event]");
      if (trigger) {
        openRegistrationModal(trigger.dataset.registerEvent);
      }
    });
    registrationModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-registration-close]")) closeRegistrationModal();
    });
    registrationForm.addEventListener("submit", submitRegistration);

    Promise.all([
      loadTypeFilters(app.dataset.typesUrl || apiUrl(apiBaseUrl, "enum/types")),
      loadQueryArgFilters(subjectsUrl, [], "subject"),
      loadQueryArgFilters(levelsUrl, [], "level"),
    ]).then(([typeFilters, subjectFilters, levelFilters]) => {
      fillQueryArgSelect(typeSelect, typeFilters);
      fillQueryArgSelect(subjectSelect, subjectFilters);
      fillQueryArgSelect(levelSelect, levelFilters);
      loadActivities();
    });
    loadEvents();
  }

  async function initActivityDetailPage(page) {
    const apiBaseUrl = page.dataset.apiBaseUrl || "https://portail.terra-numerica.org/prpact/api/";
    const params = new URLSearchParams(window.location.search);
    const uuid = params.get("uuid") || params.get("id");
    const loading = page.querySelector("[data-activity-page-loading]");
    const error = page.querySelector("[data-activity-page-error]");
    const content = page.querySelector("[data-activity-page-content]");

    if (!uuid) {
      loading.hidden = true;
      error.textContent = "Identifiant d’activité manquant dans l’URL.";
      error.hidden = false;
      return;
    }

    try {
      const detail = await fetchJson(apiUrl(apiBaseUrl, `act/${uuid}`));
      const title = firstValue(detail, ["name", "title", "label"]);
      if (title) document.title = `${title} - ${document.title}`;
      loading.hidden = true;
      content.innerHTML = renderActivityDetail(detail, apiBaseUrl);
    } catch (detailError) {
      console.error("Erreur de chargement de la page activité", detailError);
      loading.hidden = true;
      error.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-catalog-app]").forEach(initCatalogue);
    document.querySelectorAll("[data-activity-detail-page]").forEach(initActivityDetailPage);
  });
})();
