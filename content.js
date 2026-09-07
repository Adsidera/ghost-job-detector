// Ghost Job Detector — content script
// Scrapes the visible LinkedIn job posting page for signals used by the scorer.
// Selectors are best-effort: LinkedIn changes its DOM often, so every read
// falls back gracefully to null rather than throwing.

function text(el) {
  return el && el.textContent ? el.textContent.trim().replace(/\s+/g, " ") : null;
}

function value(el) {
  return text(el) || (el && el.getAttribute("aria-label")) || (el && el.getAttribute("title")) || null;
}

function usableValue(raw) {
  return raw && !/^(not found|unknown(?:\s+company)?|company\s+not\s+found|n\/a|—|-)$/.test(raw.trim().toLowerCase())
    ? raw
    : null;
}

function firstMatch(selectors, root = document) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function isVisible(el) {
  return !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function firstVisibleMatch(selectors, root = document) {
  for (const sel of selectors) {
    for (const el of root.querySelectorAll(sel)) {
      if (isVisible(el)) return el;
    }
  }
  return null;
}

function firstVisibleValue(selectors, root = document) {
  const el = firstVisibleMatch(selectors, root);
  return value(el);
}

function findVisibleDateText(root) {
  const candidates = root.querySelectorAll("span, div, p, li");
  for (const el of candidates) {
    const raw = text(el);
    if (isVisible(el) && raw && extractPostedDaysAgo(raw)) return raw;
  }
  return "";
}

function findSelectedMetadataText(title) {
  if (!title) return "";
  const candidates = document.querySelectorAll("span, div, p, li");
  for (const el of candidates) {
    const raw = text(el);
    if (
      isVisible(el) &&
      raw &&
      raw.includes(title) &&
      (extractPostedDaysAgo(raw) || /\bpromoted\b/i.test(raw))
    ) {
      return raw;
    }
  }
  return "";
}

function findSelectedJobContext(jobId) {
  if (!jobId) return null;
  const links = document.querySelectorAll("a[href*='/jobs/view/']");
  for (const link of links) {
    if (!isVisible(link) || !link.href.includes(`/jobs/view/${jobId}`)) continue;
    let node = link;
    for (let level = 0; node && level < 8; level += 1, node = node.parentElement) {
      const raw = text(node);
      if (raw && (extractPostedDaysAgo(raw) || /\bpromoted\b/i.test(raw))) return node;
    }
  }
  return null;
}

function findActiveResult(currentJobIdOverride) {
  const currentJobId =
    currentJobIdOverride || getCurrentJobId() || globalThis.__ghostJobDetectorSelectedJobId;
  if (currentJobId) {
    const jobElements = document.querySelectorAll(
      "[data-occludable-job-id], [data-job-id]"
    );
    for (const el of jobElements) {
      if (
        (el.getAttribute("data-occludable-job-id") === currentJobId ||
          el.getAttribute("data-job-id") === currentJobId) &&
        isVisible(el)
      ) {
        return el.closest("li") || el;
      }
    }
  }

  return firstVisibleMatch([
    ".jobs-search-results__list-item[aria-selected=\"true\"]",
    ".jobs-search-results__list-item--active",
    ".jobs-search-results__list-item.is-selected",
    "li[data-occludable-job-id].active",
    "li[data-occludable-job-id][aria-current=\"true\"]"
  ]);
}

function getCurrentJobId() {
  return new URL(window.location.href).searchParams.get("currentJobId");
}

function extractApplicantCount(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d[\d,]*)\+?\s*applicants?/i);
  if (m) return parseInt(m[1].replace(/,/g, ""), 10);
  const clickedApply = raw.match(/(?:over\s+)?(\d[\d,]*)\+?\s+people\s+clicked\s+apply/i);
  if (clickedApply) return parseInt(clickedApply[1].replace(/,/g, ""), 10);
  if (/over\s+100\s+people\s+clicked\s+apply/i.test(raw)) return 100;
  if (/be among the first/i.test(raw)) return 0;
  return null;
}

function extractPostedDaysAgo(raw) {
  if (!raw) return null;
  const italianMatch = raw.match(
    /(?:pubblicato\s+)?(\d+|un|una|un'|un’)?\s*(ora|ore|giorno|giorni|settimana|settimane|mese|mesi)\s+fa/i
  );
  if (italianMatch) {
    const amount = !italianMatch[1] || /^(un|una|un'|un’)$/i.test(italianMatch[1])
      ? 1
      : parseInt(italianMatch[1], 10);
    const unit = italianMatch[2].toLowerCase();
    const multiplier =
      unit.startsWith("ora") ? 1 / 24 :
      unit.startsWith("gior") ? 1 :
      unit.startsWith("sett") ? 7 : 30;
    return { days: Math.round(amount * multiplier), reposted: /reposted|ripubblicato/i.test(raw) };
  }

  const vagueEnglishMatch = raw.match(/\b(a|an)\s+(hour|day|week|month)\s+ago\b/i);
  if (vagueEnglishMatch) {
    const multiplier = { hour: 1 / 24, day: 1, week: 7, month: 30 };
    return {
      days: Math.round(multiplier[vagueEnglishMatch[2].toLowerCase()]),
      reposted: /reposted/i.test(raw)
    };
  }

  const m = raw.match(/(?:posted\s+)?(\d+)\+?\s*(hour|hr|day|d|week|wk|w|month|mo)s?(?:\s*ago)?/i);
  if (!m) {
    if (/today/i.test(raw)) return { days: 0, reposted: /reposted/i.test(raw) };
    if (/yesterday/i.test(raw)) return { days: 1, reposted: /reposted/i.test(raw) };
    const dateMatch = raw.match(/(?:posted\s+)?([A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{4})?)/i);
    if (dateMatch) {
      const date = new Date(dateMatch[1]);
      if (!Number.isNaN(date.getTime())) {
        const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
        return { days, reposted: /reposted/i.test(raw) };
      }
    }
    if (/reposted/i.test(raw)) return { days: null, reposted: true };
    return null;
  }
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = {
    hour: 1 / 24,
    hr: 1 / 24,
    day: 1,
    d: 1,
    week: 7,
    wk: 7,
    w: 7,
    month: 30,
    mo: 30
  };
  return { days: Math.round(n * mult[unit]), reposted: /reposted/i.test(raw) };
}

function scrapeJob(currentJobIdOverride) {
  const jobRoot = firstVisibleMatch([
    ".jobs-search__job-details--container",
    ".jobs-search__job-details",
    ".jobs-details",
    ".job-view-layout"
  ]) || document;
  const activeResult = findActiveResult(currentJobIdOverride);

  const selectedTitleEl = firstVisibleMatch([
    ".job-card-list__title",
    ".job-card-container__link",
    ".base-search-card__title",
    "a[data-control-name=\"job_card\"]",
    "a[href*='/jobs/view/']",
    ".artdeco-entity-lockup__title"
  ], activeResult || document);

  const selectedTitle = value(selectedTitleEl) || firstVisibleValue([
    "a[href*='/jobs/view/']",
    ".artdeco-entity-lockup__title"
  ], activeResult || document);

  const title = selectedTitle || firstVisibleValue([
    ".job-details-jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    "h1.t-24",
    "h1.top-card-layout__title",
    "h1"
  ], jobRoot);
  const selectedJobContext = findSelectedJobContext(currentJobIdOverride || getCurrentJobId());
  const selectedMetadataText = findSelectedMetadataText(title);

  const selectedCompanyEl = firstVisibleMatch([
    ".job-card-container__company-name",
    ".job-card-list__company-name",
    ".base-search-card__subtitle",
    ".artdeco-entity-lockup__subtitle",
    ".job-card-container__primary-description"
  ], activeResult || document);

  const contextCompany = usableValue(firstVisibleValue(["a[href*='/company/']"], selectedJobContext || document));
  const company = contextCompany || usableValue(value(selectedCompanyEl)) || usableValue(firstVisibleValue([
    ".artdeco-entity-lockup__subtitle",
    ".job-card-container__primary-description"
  ], activeResult || document)) || usableValue(firstVisibleValue([
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    "a.ember-view.t-black"
  ], jobRoot));

  const metaContainer = firstVisibleMatch([
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".job-details-jobs-unified-top-card__tertiary-description-container",
    ".jobs-unified-top-card__subtitle-primary-grouping"
  ], jobRoot);

  const metaText = text(metaContainer) || "";

  const descriptionEl = firstVisibleMatch([
    "#job-details",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".description__text"
  ], jobRoot);

  const applicantEl = firstVisibleMatch([
    ".job-details-jobs-unified-top-card__applicant-count",
    ".jobs-unified-top-card__applicant-count",
    ".jobs-unified-top-card__subtitle-secondary-grouping",
    ".num-applicants__caption"
  ], jobRoot);

  const workplaceTypeEl = firstVisibleMatch([
    ".job-details-jobs-unified-top-card__job-insight",
    ".job-details-jobs-unified-top-card__job-insight-item"
  ], jobRoot);

  const visibleJobText = [text(activeResult), text(jobRoot)].filter(Boolean).join(" ");
  const selectedResultText = text(activeResult) || "";
  const selectedDateInfo = extractPostedDaysAgo(selectedResultText);
  const dateText = [
    text(selectedJobContext),
    selectedMetadataText,
    findVisibleDateText(activeResult || jobRoot),
    metaText,
    text(activeResult),
    text(jobRoot)
  ].filter(Boolean);

  const postedInfo =
    selectedDateInfo || dateText.map(extractPostedDaysAgo).find(Boolean) || extractPostedDaysAgo(visibleJobText);
  const applicantCountFromElement = extractApplicantCount(text(applicantEl));
  const applicantCountFromContext = extractApplicantCount(text(selectedJobContext));
  const applicantCountFromMetadata = extractApplicantCount(selectedMetadataText);
  const applicantCountFromCard = extractApplicantCount(text(activeResult));
  const applicantCount =
    applicantCountFromElement != null
      ? applicantCountFromElement
      : applicantCountFromContext != null
      ? applicantCountFromContext
      : applicantCountFromMetadata != null
      ? applicantCountFromMetadata
      : applicantCountFromCard != null
      ? applicantCountFromCard
      : extractApplicantCount(visibleJobText);

  const description = text(descriptionEl) || "";

  const hasSalary = /\$[\d,]+|\€[\d,]+|£[\d,]+|\d{2,3}[,.]?\d{3}\s*(-|to)\s*\d{2,3}[,.]?\d{3}/i.test(
    metaText + " " + description
  );

  const urgentFlag = /urgently hiring|actively recruiting|actively reviewing applicants/i.test(
    visibleJobText
  );
  const signalText = text(selectedJobContext) || selectedMetadataText || (activeResult ? selectedResultText : visibleJobText);
  const promoted = /\bpromoted\b/i.test(signalText);

  return {
    url: window.location.href,
    currentJobId: currentJobIdOverride || getCurrentJobId(),
    title,
    company,
    postedDaysAgo: postedInfo ? postedInfo.days : null,
    reposted: postedInfo ? !!postedInfo.reposted : false,
    promoted,
    applicantCount,
    hasSalary,
    urgentFlag,
    workplaceType: text(workplaceTypeEl),
    description,
    descriptionLength: description.length,
    scrapedAt: new Date().toISOString()
  };
}

globalThis.__ghostJobDetectorScrapeJob = scrapeJob;

if (!globalThis.__ghostJobDetectorSelectionTrackingInstalled) {
  globalThis.__ghostJobDetectorSelectionTrackingInstalled = true;
  document.addEventListener("click", (event) => {
    const card = event.target.closest(
      "li[data-occludable-job-id], [data-job-id], a[href*='/jobs/view/']"
    );
    if (!card) return;

    const link = card.matches("a[href*='/jobs/view/']")
      ? card
      : card.querySelector("a[href*='/jobs/view/']");
    const href = link ? link.getAttribute("href") || "" : "";
    const hrefMatch = href.match(/\/jobs\/view\/(\d+)/);
    globalThis.__ghostJobDetectorSelectedJobId =
      card.getAttribute("data-occludable-job-id") ||
      card.getAttribute("data-job-id") ||
      (hrefMatch ? hrefMatch[1] : null);
  }, true);
}

if (!globalThis.__ghostJobDetectorListenerInstalled) {
  globalThis.__ghostJobDetectorListenerInstalled = true;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "SCRAPE_JOB") {
      try {
        sendResponse({ ok: true, data: scrapeJob() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    }
    return true;
  });
}
