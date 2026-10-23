const LEVEL_COLOR = { low: "var(--teal)", medium: "var(--amber)", high: "var(--red)" };
const LEVEL_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk" };
const els = {
  expandBtn: document.getElementById("expandBtn"),
  emptyState: document.getElementById("emptyState"),
  loadingState: document.getElementById("loadingState"),
  resultState: document.getElementById("resultState"),
  jobTitle: document.getElementById("jobTitle"),
  jobCompany: document.getElementById("jobCompany"),
  dial: document.getElementById("dial"),
  scoreNumber: document.getElementById("scoreNumber"),
  scoreLevel: document.getElementById("scoreLevel"),
  scoreSummary: document.getElementById("scoreSummary"),
  statAge: document.getElementById("statAge"),
  statApplicants: document.getElementById("statApplicants"),
  statSalary: document.getElementById("statSalary"),
  flagList: document.getElementById("flagList"),
  rescanBtn: document.getElementById("rescanBtn")
};

let currentJob = null;

function isLinkedInJobsPage(url) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "linkedin.com" || parsed.hostname.endsWith(".linkedin.com")) &&
      (parsed.pathname === "/jobs" || parsed.pathname.startsWith("/jobs/"))
    );
  } catch (err) {
    return false;
  }
}

function showState(name) {
  ["emptyState", "loadingState", "resultState"].forEach((s) => {
    els[s].classList.toggle("hidden", s !== name);
  });
}

function renderFlags(flags) {
  els.flagList.innerHTML = "";
  const real = flags.filter((f) => !f.neutral);
  if (real.length === 0) {
    const p = document.createElement("p");
    p.className = "no-flags";
    p.textContent = "No strong red flags detected in the heuristic scan.";
    els.flagList.appendChild(p);
    return;
  }
  flags.forEach((f) => {
    const row = document.createElement("div");
    row.className = "flag" + (f.neutral ? " flag--neutral" : "");

    const bar = document.createElement("div");
    bar.className = "flag__bar";
    bar.style.background = f.neutral ? "var(--faint)" : f.weight >= 15 ? "var(--red)" : "var(--amber)";
    row.appendChild(bar);

    const body = document.createElement("div");
    body.className = "flag__body";
    const label = document.createElement("p");
    label.className = "flag__label";
    label.textContent = f.label;
    const detail = document.createElement("p");
    detail.className = "flag__detail";
    detail.textContent = f.detail;
    body.appendChild(label);
    body.appendChild(detail);
    row.appendChild(body);

    els.flagList.appendChild(row);
  });
}

function render(job, result) {
  currentJob = job;
  els.jobTitle.textContent = job.title || "Untitled posting";
  els.jobCompany.textContent = job.company || "Unknown company";

  els.scoreNumber.textContent = result.score;
  els.scoreLevel.textContent = LEVEL_LABEL[result.level];
  els.scoreLevel.style.color = LEVEL_COLOR[result.level];
  els.dial.style.borderColor = LEVEL_COLOR[result.level];
  els.scoreSummary.textContent =
    result.level === "high"
      ? "Several signals consistent with a stale or non-active posting."
      : result.level === "medium"
      ? "A few signals worth a second look before applying."
      : "Few or no ghost-job signals detected.";

  els.statAge.textContent = job.postedDaysAgo != null ? job.postedDaysAgo : "—";
  els.statAge.classList.remove("stat__value--low", "stat__value--medium", "stat__value--high");
  if (job.postedDaysAgo != null) {
    els.statAge.classList.add(
      job.postedDaysAgo >= 30
        ? "stat__value--high"
        : job.postedDaysAgo >= 14
        ? "stat__value--medium"
        : "stat__value--low"
    );
  }
  els.statApplicants.textContent = job.applicantCount != null
    ? `${job.applicantCount}${job.applicantCountIsMinimum ? "+" : ""}`
    : "—";
  els.statApplicants.classList.remove("stat__value--low", "stat__value--medium", "stat__value--high");
  if (job.applicantCount != null) {
    els.statApplicants.classList.add(
      job.applicantCount >= 100
        ? "stat__value--high"
        : job.applicantCount >= 70
        ? "stat__value--medium"
        : "stat__value--low"
    );
  }
  els.statSalary.textContent = job.hasSalary ? "Yes" : "No";

  renderFlags(result.flags);

  showState("resultState");
}

async function scanActiveTab(waitForPreview = false) {
  showState("loadingState");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id || !tab.url || !isLinkedInJobsPage(tab.url)) {
    showState("emptyState");
    return;
  }

  const handleResponse = (response) => {
    if (!response || !response.ok) {
      const detail = response && response.error ? ` (${response.error})` : "";
      els.emptyState.querySelector(".state__body").textContent =
        `The job preview could not be read${detail}. Reload LinkedIn and try again.`;
      showState("emptyState");
      return;
    }
    const job = response.data;
    const result = scoreJob(job);
    render(job, result);
  };

  if (waitForPreview) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const currentJobId = new URL(tab.url).searchParams.get("currentJobId");

  try {
    let results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (jobId) => {
        const scrape = globalThis.__ghostJobDetectorScrapeJob;
        return scrape ? { ok: true, data: scrape(jobId) } : { ok: false, error: "Scraper not loaded" };
      },
      args: [currentJobId]
    });

    if (!results[0] || !results[0].result || !results[0].result.ok) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (jobId) => ({ ok: true, data: globalThis.__ghostJobDetectorScrapeJob(jobId) }),
        args: [currentJobId]
      });
    }

    handleResponse(results[0].result);
  } catch (err) {
    els.emptyState.querySelector(".state__body").textContent =
      `The page could not be accessed (${err.message}). Check the extension permissions and try again.`;
    showState("emptyState");
  }
}

globalThis.scanActiveTab = scanActiveTab;

els.expandBtn.addEventListener("click", () => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab && tab.windowId != null) {
        chrome.sidePanel.open({ windowId: tab.windowId }).then(() => window.close());
      }
    });
    return;
  }

  const expanded = document.body.classList.toggle("expanded");
  els.expandBtn.setAttribute("aria-pressed", String(expanded));
  els.expandBtn.title = expanded ? "Collapse panel" : "Expand panel";
  els.expandBtn.setAttribute("aria-label", expanded ? "Collapse panel" : "Expand panel");
});

els.rescanBtn.addEventListener("click", () => scanActiveTab(true));

scanActiveTab();
