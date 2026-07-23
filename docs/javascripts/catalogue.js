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
  const SITE_BASE_URL = document.currentScript?.src
    ? new URL("../", document.currentScript.src).toString()
    : new URL("./", window.location.href).toString();
  let cardChipPagerTimers = [];

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
      if (Array.isArray(value) && value.length === 0) continue;
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

  function truncateText(value, maxLength) {
    const text = compactText(value);
    if (text.length <= maxLength) return text;
    const clipped = text.slice(0, maxLength + 1);
    const lastSpace = clipped.lastIndexOf(" ");
    return `${clipped.slice(0, lastSpace > maxLength * 0.65 ? lastSpace : maxLength).trim()}...`;
  }

  function displayTitleFromActivity(item) {
    return compactText(firstValue(item, ["short_description"]))
      || firstValue(item, ["name", "title", "label", "titre", "nom"])
      || compactText(firstValue(item, ["description", "summary"]))
      || "Activité";
  }

  function labelListFromValue(value) {
    return Array.isArray(value)
      ? value.map(labelFromValue).filter(Boolean)
      : String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
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

  function formatArea(value) {
    const area = renderValue(value).trim();
    if (!area) return "";
    if (/\b(m2|m²|mètre|metre)/i.test(area)) return area;
    return `${area} m²`;
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

  function queryArgValue(queryArg, name) {
    const params = new URLSearchParams(String(queryArg || ""));
    return params.get(name) || "";
  }

  function typeKeysFromValue(value) {
    if (!value) return [];
    if (typeof value === "object") {
      return ["value", "slug", "id", "name", "label", "code"]
        .map((key) => normalize(value[key]))
        .filter(Boolean);
    }
    return [normalize(value)].filter(Boolean);
  }

  function activityTypeKeys(item) {
    return typeKeysFromValue(firstValue(item, ["type", "resource_type", "activity_type", "category"]));
  }

  function activitySubjectKeys(item) {
    const subjects = firstValue(item, ["related_subjects", "subjects", "themes", "topics", "tags", "keywords"]);
    return labelListFromValue(subjects).map(normalize).filter(Boolean);
  }

  function filterOptionsForAvailableKeys(options, availableKeys, queryParamName) {
    if (availableKeys.size === 0) return options;
    return options.filter((option) => {
      const queryValue = queryArgValue(option.queryArg, queryParamName);
      const optionKeys = [
        normalize(queryValue),
        normalize(option.label),
      ].filter(Boolean);
      return optionKeys.some((key) => availableKeys.has(key));
    });
  }

  function filterTypeOptionsForAvailableActivities(typeFilters, activitiesPayload) {
    const availableTypes = new Set(asArray(activitiesPayload).flatMap(activityTypeKeys));
    return filterOptionsForAvailableKeys(typeFilters, availableTypes, "type");
  }

  function filterSubjectOptionsForAvailableActivities(subjectFilters, activitiesPayload) {
    const availableSubjects = new Set(asArray(activitiesPayload).flatMap(activitySubjectKeys));
    return filterOptionsForAvailableKeys(subjectFilters, availableSubjects, "subject");
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
    return escapeHtml(value)
      .replace(/&lt;br&gt;/g, "<br>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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

  function linkUrlFromValue(item, apiBaseUrl) {
    if (!item) return "";
    if (typeof item === "string") return apiBaseUrl ? mediaUrl(item, apiBaseUrl) : item;
    if (typeof item === "object") {
      const value = firstValue(item, ["url", "href", "link", "file", "src", "path", "document"]);
      if (value && typeof value === "object" && value !== item) return linkUrlFromValue(value, apiBaseUrl);
      return apiBaseUrl ? mediaUrl(value, apiBaseUrl) : value;
    }
    return "";
  }

  function resourceIcon(type = "document") {
    if (type === "external") {
      return `
        <svg class="activity-detail__resource-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14 4h6v6"></path>
          <path d="M10 14 20 4"></path>
          <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"></path>
        </svg>
      `;
    }
    return `
      <svg class="activity-detail__resource-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 3h6l4 4v14H7z"></path>
        <path d="M13 3v5h4"></path>
        <path d="M9.5 13h5"></path>
        <path d="M9.5 16h5"></path>
      </svg>
    `;
  }

  function detailLinkList(items, apiBaseUrl, options = {}) {
    const links = asArray(items)
      .map((item) => {
        const url = linkUrlFromValue(item, apiBaseUrl);
        const title = firstValue(item, ["title", "label", "name"]) || url;
        if (!url) return "";
        if (options.iconOnly) {
          return `<a class="activity-detail__resource-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">${resourceIcon(options.iconType)}</a>`;
        }
        return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a></li>`;
      })
      .filter(Boolean)
      .join("");
    if (options.iconOnly) return links;
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
    if (/^(https?:|data:|blob:)\/?/i.test(url) || url.startsWith("//")) return url;
    if (url.startsWith("assets/")) return new URL(url, SITE_BASE_URL).toString();
    const apiUrlObject = new URL(apiBaseUrl, window.location.origin);
    if (url.startsWith("/")) return `${apiUrlObject.origin}${url}`;
    return new URL(url, apiUrlObject).toString();
  }

  function looksLikeMediaPath(value) {
    const text = String(value || "").trim();
    return /^(https?:|data:image\/|blob:)\/?/i.test(text)
      || text.startsWith("//")
      || text.startsWith("/")
      || /^assets\//i.test(text)
      || /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i.test(text);
  }

  function mediaSrcFromValue(value, apiBaseUrl, seen = new Set()) {
    if (!value) return "";
    if (typeof value === "string") {
      const imgMatch = value.match(/<img[^>]+src=["']([^"']+)["']/i);
      const src = imgMatch ? imgMatch[1] : value;
      return looksLikeMediaPath(src) ? mediaUrl(src, apiBaseUrl) : "";
    }
    if (typeof value === "object") {
      if (seen.has(value)) return "";
      seen.add(value);
      const directValue = firstValue(value, [
        "url",
        "src",
        "image",
        "file",
        "thumbnail",
        "path",
        "content_url",
        "contentUrl",
        "absolute_url",
        "absoluteUrl",
        "download_url",
        "downloadUrl",
        "original",
        "large",
        "medium",
        "small",
        "file_url",
        "fileUrl",
        "image_url",
        "imageUrl",
        "media_url",
        "mediaUrl",
        "content",
      ]);
      if (directValue && directValue !== value) {
        const directSrc = mediaSrcFromValue(directValue, apiBaseUrl, seen);
        if (directSrc) return directSrc;
      }
      for (const nestedValue of Object.values(value)) {
        if (nestedValue === value) continue;
        const nestedSrc = mediaSrcFromValue(nestedValue, apiBaseUrl, seen);
        if (nestedSrc) return nestedSrc;
      }
    }
    return "";
  }

  function illustrationItemsFromSource(source) {
    if (Array.isArray(source)) return source;
    if (!source || typeof source !== "object") return asArray(source);
    const directValue = firstValue(source, [
      "illustrations",
      "images",
      "image",
      "thumbnail",
      "picture",
      "pictures",
      "photo",
      "photos",
      "media",
      "medias",
      "illustration_set",
      "illustrationSet",
      "image_set",
      "imageSet",
      "files",
      "contents",
    ]);
    const items = asArray(directValue);
    if (items.length > 0) return items;
    return directValue ? [directValue] : [];
  }

  function firstIllustrationUrl(activity, apiBaseUrl) {
    const illustration = illustrationItemsFromSource(activity).find(Boolean);
    return mediaSrcFromValue(illustration, apiBaseUrl);
  }

  function detailIllustrationItems(items, apiBaseUrl) {
    return asArray(items)
      .map((item) => {
        const url = mediaSrcFromValue(item, apiBaseUrl);
        const legend = firstValue(item, ["legend", "caption", "title", "label"]);
        const credits = firstValue(item, ["credits", "credit", "copyright", "author", "source", "attribution"]);
        if (!url) return null;
        return { url, legend, credits };
      })
      .filter(Boolean);
  }

  function illustrationCaption(legend, credits) {
    const normalizedLegend = normalize(legend);
    const usefulLegend = normalizedLegend && normalizedLegend !== "apercu du contenu"
      ? compactText(legend)
      : "";
    const usefulCredits = compactText(labelFromValue(credits));
    const content = [
      usefulLegend ? `<span>${escapeHtml(usefulLegend)}</span>` : "",
      usefulCredits ? `<small>Crédits : ${escapeHtml(usefulCredits)}</small>` : "",
    ].filter(Boolean).join("");
    return content ? `<figcaption>${content}</figcaption>` : "";
  }

  function detailFigure({ url, legend, credits }, index) {
    return `
      <figure class="activity-detail__figure" data-carousel-slide>
        <img src="${escapeHtml(url)}" alt="${escapeHtml(legend || `Illustration ${index + 1} de l’activité`)}">
        ${illustrationCaption(legend, credits)}
      </figure>
    `;
  }

  function detailIllustrations(items, apiBaseUrl) {
    const illustrations = detailIllustrationItems(items, apiBaseUrl);
    if (illustrations.length === 0) return "";

    if (illustrations.length === 1) {
      return `<div class="activity-detail__figures">${detailFigure(illustrations[0], 0)}</div>`;
    }

    const slides = illustrations.map(detailFigure).join("");
    const dots = illustrations
      .map((_, index) => `
        <button class="activity-detail__carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Afficher l’illustration ${index + 1}" data-carousel-dot="${index}"></button>
      `)
      .join("");

    return `
      <div class="activity-detail__carousel" data-illustration-carousel>
        <div class="activity-detail__carousel-frame">
          <button class="activity-detail__carousel-button activity-detail__carousel-button--prev" type="button" aria-label="Illustration précédente" data-carousel-prev>&lsaquo;</button>
          <div class="activity-detail__carousel-track" data-carousel-track>
            ${slides}
          </div>
          <button class="activity-detail__carousel-button activity-detail__carousel-button--next" type="button" aria-label="Illustration suivante" data-carousel-next>&rsaquo;</button>
        </div>
        <div class="activity-detail__carousel-dots">
          ${dots}
        </div>
      </div>
    `;
  }

  function initIllustrationCarousels(root) {
    root.querySelectorAll("[data-illustration-carousel]").forEach((carousel) => {
      const track = carousel.querySelector("[data-carousel-track]");
      const slides = [...carousel.querySelectorAll("[data-carousel-slide]")];
      const dots = [...carousel.querySelectorAll("[data-carousel-dot]")];
      const previous = carousel.querySelector("[data-carousel-prev]");
      const next = carousel.querySelector("[data-carousel-next]");
      if (!track || slides.length < 2) return;

      function activeIndex() {
        return Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      }

      function scrollToIndex(index) {
        const nextIndex = (index + slides.length) % slides.length;
        track.scrollTo({ left: nextIndex * track.clientWidth, behavior: "smooth" });
      }

      function updateControls() {
        const index = activeIndex();
        dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === index));
      }

      previous?.addEventListener("click", () => scrollToIndex(activeIndex() - 1));
      next?.addEventListener("click", () => scrollToIndex(activeIndex() + 1));
      dots.forEach((dot) => {
        dot.addEventListener("click", () => scrollToIndex(Number(dot.dataset.carouselDot)));
      });
      track.addEventListener("scroll", () => window.requestAnimationFrame(updateControls));
      window.addEventListener("resize", updateControls);
      updateControls();
    });
  }

  function applyCardImageFit(root) {
    root.querySelectorAll(".resource-card").forEach((card) => {
      const images = [...card.querySelectorAll("[data-card-image]")];
      const firstImage = images[0];
      if (!firstImage) return;

      function updateFit() {
        const frame = card.querySelector(".resource-card__media");
        if (!frame || !firstImage.naturalWidth || !firstImage.naturalHeight) return;
        const imageRatio = firstImage.naturalWidth / firstImage.naturalHeight;
        const frameRatio = frame.clientWidth / frame.clientHeight;
        const shouldContain = imageRatio > frameRatio * 1.25;
        images.forEach((image) => image.classList.toggle("is-panoramic", shouldContain));
      }

      if (firstImage.complete) updateFit();
      firstImage.addEventListener("load", updateFit, { once: true });
    });
  }

  function applyCardBackTextFit(root) {
    root.querySelectorAll(".resource-card__face--back").forEach((backFace) => {
      const body = backFace.querySelector(".resource-card__back-body");
      const title = body?.querySelector("h2");
      const description = body?.querySelector("p");
      const footer = backFace.querySelector(".resource-card__footer");
      if (!body || !title || !description || !footer) return;

      const bodyStyles = window.getComputedStyle(body);
      const descriptionStyles = window.getComputedStyle(description);
      const availableHeight = backFace.clientHeight
        - (backFace.querySelector(".resource-card__back-media")?.offsetHeight || 0)
        - footer.offsetHeight
        - parseFloat(bodyStyles.paddingTop || 0)
        - parseFloat(bodyStyles.paddingBottom || 0);
      const usedHeight = title.offsetHeight
        + parseFloat(bodyStyles.rowGap || bodyStyles.gap || 0)
        + parseFloat(descriptionStyles.marginBottom || 0)
        + 12;
      const lineHeight = parseFloat(descriptionStyles.lineHeight)
        || parseFloat(descriptionStyles.fontSize) * 1.35;
      const lines = Math.max(3, Math.floor((availableHeight - usedHeight) / lineHeight));
      description.style.webkitLineClamp = String(lines);
    });
  }

  function clearCardChipPagers() {
    cardChipPagerTimers.forEach((timer) => window.clearInterval(timer));
    cardChipPagerTimers = [];
  }

  function initCardChipPagers(root) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.querySelectorAll("[data-chip-pager]").forEach((pager) => {
      const pages = [...pager.querySelectorAll("[data-chip-page]")];
      const dots = [...pager.querySelectorAll("[data-chip-page-dot]")];
      if (pages.length < 2) return;

      let index = 0;
      function showPage(nextIndex) {
        pages[index].classList.remove("is-active");
        dots[index]?.classList.remove("is-active");
        index = (nextIndex + pages.length) % pages.length;
        pages[index].classList.add("is-active");
        dots[index]?.classList.add("is-active");
      }

      pages[0].classList.add("is-active");
      dots[0]?.classList.add("is-active");
      dots.forEach((dot, dotIndex) => {
        dot.addEventListener("click", () => showPage(dotIndex));
      });
      if (reduceMotion) return;

      const timer = window.setInterval(() => {
        showPage(index + 1);
      }, Number(pager.dataset.chipPagerInterval) || 3200);
      cardChipPagerTimers.push(timer);
    });
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

  function technicalInfoChipsCard(title, value) {
    const values = labelListFromValue(value);
    if (values.length === 0) return "";
    return `
      <article class="activity-tech-card activity-tech-card--wide">
        <span>${escapeHtml(title)}</span>
        <div class="activity-tech-card__chips">
          ${values.map((item) => `<em>${escapeHtml(item)}</em>`).join("")}
        </div>
      </article>
    `;
  }

  function renderTechnicalInfo(additInfo, options = {}) {
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
    if (additInfo.no_screen === false && additInfo.needs_large_display !== true) {
      needs.push("Écran");
    }

    const speaker = firstValue(additInfo, ["speaker"]);
    const speakerDetails = firstValue(additInfo, ["speaker_details"]);
    const speakerBlock = options.mergeSpeakerDetails
      ? [
        speaker ? `**${speaker}**<br>` : "",
        speakerDetails,
      ].filter(Boolean).join("\n")
      : "";

    const cards = [
      technicalInfoCard("Durée", formatDuration(firstValue(additInfo, ["duration"]))),
      technicalInfoCard("Participant max", firstValue(additInfo, ["group_size_max"])),
      technicalInfoCard("Espaces utiles", formatArea(firstValue(additInfo, ["minimal_free_space"]))),
      technicalInfoCard("Installation", formatDuration(firstValue(additInfo, ["deployment_duration"]))),
      technicalInfoChipsCard("Niveau scolaire", options.levels),
      technicalInfoChipsCard("Disciplines abordées", options.subjects),
      options.mergeSpeakerDetails ? "" : technicalInfoCard("Intervenant", speaker),
    ].filter(Boolean);

    const needsBlock = needs.length
      ? `
        <article class="activity-tech-card activity-tech-card--wide">
          <span>Matériel à prévoir</span>
          <div class="activity-tech-card__chips">
            ${needs.map((need) => `<em>${escapeHtml(need)}</em>`).join("")}
          </div>
        </article>
      `
      : "";

    const comments = firstValue(additInfo, ["comments"]);
    const notes = [
      speakerBlock ? ["Intervenant", speakerBlock] : null,
      !options.mergeSpeakerDetails && speakerDetails ? ["Détails intervenant", speakerDetails] : null,
      comments ? ["À noter", comments] : null,
    ].filter(Boolean);
    const notesBlock = notes
      .map(([title, value]) => `
        <article class="activity-tech-note${title === "Intervenant" ? " activity-tech-note--speaker" : ""}">
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
      title: displayTitleFromActivity(item),
      name: firstValue(item, ["title", "name", "label", "titre", "nom"]),
      description: compactText(firstValue(item, ["excerpt", "abstract", "resume"])),
      longDescription: compactText(firstValue(item, ["long_description", "longDescription"])),
      typeValue: optionValue(type),
      typeLabel: labelFromValue(type) || "Activité",
      levelValue: optionValue(level),
      levelLabel: labelFromValue(level) || "Tous niveaux",
      levels: labelListFromValue(level),
      duration: formatDuration(duration),
      location: firstValue(item, ["location", "lieu", "place"]),
      collectionLabel: labelFromValue(collection),
      statusLabel: labelFromValue(status),
      providerLabel: labelFromValue(provider),
      themes: Array.isArray(subjects) ? subjects.map(labelFromValue).filter(Boolean) : String(subjects || "").split(",").map((theme) => theme.trim()).filter(Boolean),
      dependencies: additInfo && Array.isArray(additInfo.dependencies) ? additInfo.dependencies.filter(Boolean) : [],
      additInfo: additInfo && typeof additInfo === "object" ? additInfo : null,
      illustrations: illustrationItemsFromSource(item),
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

  async function enrichActivityForCard(activity, apiBaseUrl) {
    const hasIllustrations = illustrationItemsFromSource(activity).length > 0;
    if (!activity.id || (activity.themes.length > 0 && activity.longDescription && hasIllustrations)) return activity;
    try {
      const detail = await fetchJson(apiUrl(apiBaseUrl, `act/${activity.id}`));
      const subjects = firstValue(detail, ["related_subjects", "subjects", "themes", "topics", "tags", "keywords"]);
      const detailIllustrations = illustrationItemsFromSource(detail);
      return {
        ...activity,
        longDescription: compactText(firstValue(detail, ["long_description", "body", "content"])) || activity.longDescription,
        themes: activity.themes.length > 0 ? activity.themes : labelListFromValue(subjects),
        illustrations: hasIllustrations ? activity.illustrations : detailIllustrations,
      };
    } catch (detailError) {
      console.warn("Impossible d’enrichir la carte activité", activity.id, detailError);
      return activity;
    }
  }

  async function enrichActivitiesForCards(activities, apiBaseUrl) {
    return Promise.all(activities.map((activity) => enrichActivityForCard(activity, apiBaseUrl)));
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
    const slug = slugify(activity.name || activity.title || activity.id || "activite");
    url.searchParams.set("slug", slug);
    url.hash = "";
    return url.toString();
  }

  async function activityIdFromSlug(slug, catalogueUrl) {
    if (!slug) return "";
    const payload = await fetchJson(withQueryArgs(catalogueUrl, [
      CATALOG_COLLECTION_QUERY,
      CATALOG_STATUS_QUERY,
      "limit=1000",
    ]));
    const activity = asArray(payload)
      .map(mapActivity)
      .find((item) => slugify(item.name || item.title || item.id) === slug);
    return activity?.id || "";
  }

  function findMatchingEvent(activity, eventsBySlug) {
    const activitySlug = eventSlugFromActivity(activity);
    if (!activitySlug) return null;
    if (eventsBySlug.has(activitySlug)) return eventsBySlug.get(activitySlug);

    return [...eventsBySlug.entries()].find(([eventSlug]) => (
      eventSlug.includes(activitySlug) || activitySlug.includes(eventSlug)
    ))?.[1] || null;
  }

  function renderCardChipGroup(label, values, maxVisible = 6) {
    if (!values.length) return "";
    if (values.length > maxVisible) {
      const pages = [];
      for (let index = 0; index < values.length; index += maxVisible) {
        pages.push(values.slice(index, index + maxVisible));
      }
      return `
        <div class="resource-card__chip-group">
          <span>${escapeHtml(label)}</span>
          <div class="resource-card__tags resource-card__tags--pager" data-chip-pager data-chip-pager-interval="3200">
            <div class="resource-card__tags-pages">
              ${pages.map((page, pageIndex) => `
                <div class="resource-card__tags-page${pageIndex === 0 ? " is-active" : ""}" data-chip-page>
                  ${page.map((value) => `<em class="resource-card__tag">${escapeHtml(value)}</em>`).join("")}
                </div>
              `).join("")}
            </div>
            <div class="resource-card__chip-dots" aria-label="${escapeHtml(`${label} : pages disponibles`)}">
              ${pages.map((_, pageIndex) => `
                <button class="resource-card__chip-dot${pageIndex === 0 ? " is-active" : ""}" type="button" aria-label="${escapeHtml(`${label} page ${pageIndex + 1}`)}" data-chip-page-dot="${pageIndex}"></button>
              `).join("")}
            </div>
          </div>
        </div>
      `;
    }

    const tags = values.map((value) => `<em class="resource-card__tag">${escapeHtml(value)}</em>`).join("");
    return `
      <div class="resource-card__chip-group">
        <span>${escapeHtml(label)}</span>
        <div class="resource-card__tags">
          ${tags}
        </div>
      </div>
    `;
  }

  function renderActivity(activity, eventsBaseUrl, eventsPublicBaseUrl, eventsBySlug, activityDetailUrl, apiBaseUrl) {
    const article = document.createElement("article");
    const typeClass = slugify(activity.typeValue || activity.typeLabel || "activity");
    article.className = `resource-card resource-card--${typeClass}`;
    const imageUrl = firstIllustrationUrl(activity, apiBaseUrl);
    const levels = renderCardChipGroup("Niveaux", activity.levels, 7);
    const disciplines = renderCardChipGroup("Disciplines", activity.themes, 4);
    const cardTitle = activity.title || "Activité sans titre";
    const displayedCardTitle = truncateText(cardTitle, 100);
    const backDescription = activity.longDescription || activity.description || cardTitle;
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
      ? `<a class="resource-card__action resource-card__action--secondary" href="${escapeHtml(activityDetailPageUrl(activity, activityDetailUrl))}">En savoir plus</a>`
      : "";

    article.innerHTML = `
      <div class="resource-card__inner">
        <div class="resource-card__face resource-card__face--front">
          <div class="resource-card__media${imageUrl ? " has-image" : ""}">
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(activity.title || "Illustration de l’activité")}" data-card-image>` : ""}
            <span class="resource-card__type">${escapeHtml(activity.typeLabel)}</span>
          </div>
          <div class="resource-card__body">
            <h2 title="${escapeHtml(cardTitle)}">${escapeHtml(displayedCardTitle)}</h2>
            <div class="resource-card__meta">
              ${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
            ${activity.description ? `<p>${escapeHtml(activity.description)}</p>` : ""}
            ${levels}
            ${disciplines}
          </div>
        </div>
        <div class="resource-card__face resource-card__face--back">
          ${imageUrl ? `
            <div class="resource-card__back-media">
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(activity.title || "Illustration de l’activité")}" data-card-image>
            </div>
          ` : ""}
          <div class="resource-card__back-body">
            <h2>${escapeHtml(displayedCardTitle)}</h2>
            <p>${escapeHtml(backDescription)}</p>
          </div>
          <footer class="resource-card__footer">
            <div class="resource-card__actions">
              ${detailAction}
              ${action}
            </div>
          </footer>
        </div>
      </div>
    `;

    return article;
  }

  function renderActivityDetail(detail, apiBaseUrl) {
    const shortDescription = firstValue(detail, ["short_description", "description", "summary"]);
    const title = displayTitleFromActivity(detail);
    const longDescription = firstValue(detail, ["long_description", "body", "content"]);
    const additInfo = firstValue(detail, ["addit_info", "additional_info"]);
    const type = firstValue(detail, ["type", "resource_type", "activity_type", "category"]);
    const normalizedType = normalize(`${optionValue(type)} ${labelFromValue(type)}`);
    const isWorkshop = normalizedType.includes("workshop") || normalizedType.includes("atelier");
    const isConference = normalizedType.includes("conference");

    const technicalInfo = renderTechnicalInfo(additInfo, {
      levels: firstValue(detail, ["levels", "level", "niveau", "school_level", "audience", "public"]),
      mergeSpeakerDetails: isConference,
      subjects: firstValue(detail, ["related_subjects", "subjects", "themes", "topics", "tags", "keywords"]),
    });
    const resources = [
      detailLinkList(firstValue(detail, ["attachments", "documents"]), apiBaseUrl, { iconOnly: true }),
      detailLinkList(firstValue(detail, ["see_also_links", "links"]), null, { iconOnly: true, iconType: "external" }),
    ].filter(Boolean).join("");
    const illustrations = detailIllustrations(illustrationItemsFromSource(detail), apiBaseUrl);
    const illustrationsSection = illustrations ? `<section class="activity-detail__illustrations">${illustrations}</section>` : "";
    const combinedActivities = detailReferenceList(firstValue(detail, ["activities"]));
    const sequence = detailReferenceList(firstValue(detail, ["sequence"]));

    return `
      <div class="activity-detail">
        ${isWorkshop ? illustrationsSection : ""}
        <h3>${escapeHtml(title)}</h3>
        ${longDescription ? `<section><div class="activity-detail__markdown">${renderMarkdown(longDescription)}</div></section>` : ""}
        ${technicalInfo ? `<section><h4>Modalité pratique</h4>${technicalInfo}</section>` : ""}
        ${isWorkshop || isConference ? "" : illustrationsSection}
        ${resources ? `<section><h4>Ressources complémentaires</h4><div class="activity-detail__resources">${resources}</div></section>` : ""}
        ${combinedActivities ? `<section><h4>Activités liées</h4>${combinedActivities}</section>` : ""}
        ${sequence ? `<section><h4>Séquence</h4>${sequence}</section>` : ""}
        ${isConference ? illustrationsSection : ""}
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
      clearCardChipPagers();
      grid.replaceChildren(...activities.map((activity) => renderActivity(activity, eventsBaseUrl, eventsPublicBaseUrl, eventsBySlug, activityDetailUrl, apiBaseUrl)));
      applyCardImageFit(grid);
      applyCardBackTextFit(grid);
      initCardChipPagers(grid);
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
        activities = await enrichActivitiesForCards(asArray(payload).map(mapActivity), apiBaseUrl);
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
    window.addEventListener("resize", () => applyCardBackTextFit(grid));

    Promise.all([
      loadTypeFilters(app.dataset.typesUrl || apiUrl(apiBaseUrl, "enum/types")),
      fetchJson(withQueryArgs(catalogueUrl, [CATALOG_COLLECTION_QUERY, CATALOG_STATUS_QUERY, "limit=1000"])).catch(() => null),
      loadQueryArgFilters(subjectsUrl, [], "subject"),
      loadQueryArgFilters(levelsUrl, [], "level"),
    ]).then(async ([typeFilters, typeAvailabilityPayload, subjectFilters, levelFilters]) => {
      const availableActivities = await enrichActivitiesForCards(asArray(typeAvailabilityPayload).map(mapActivity), apiBaseUrl);
      fillQueryArgSelect(typeSelect, filterTypeOptionsForAvailableActivities(typeFilters, availableActivities));
      fillQueryArgSelect(subjectSelect, filterSubjectOptionsForAvailableActivities(subjectFilters, availableActivities));
      fillQueryArgSelect(levelSelect, levelFilters);
      loadActivities();
    });
    loadEvents();
  }

  async function initActivityDetailPage(page) {
    const apiBaseUrl = page.dataset.apiBaseUrl || "https://portail.terra-numerica.org/prpact/api/";
    const catalogueUrl = page.dataset.catalogueUrl || apiUrl(apiBaseUrl, "act/");
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    const uuid = params.get("uuid") || params.get("id");
    const loading = page.querySelector("[data-activity-page-loading]");
    const error = page.querySelector("[data-activity-page-error]");
    const content = page.querySelector("[data-activity-page-content]");

    if (!uuid && !slug) {
      loading.hidden = true;
      error.textContent = "Identifiant d’activité manquant dans l’URL.";
      error.hidden = false;
      return;
    }

    try {
      const activityId = uuid || await activityIdFromSlug(slug, catalogueUrl);
      if (!activityId) {
        throw new Error(`Aucune activité trouvée pour le slug "${slug}".`);
      }
      const detail = await fetchJson(apiUrl(apiBaseUrl, `act/${activityId}`));
      const title = displayTitleFromActivity(detail);
      if (title) document.title = `${title} - ${document.title}`;
      loading.hidden = true;
      content.innerHTML = renderActivityDetail(detail, apiBaseUrl);
      initIllustrationCarousels(content);
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
