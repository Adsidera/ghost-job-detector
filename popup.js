const LEVEL_COLOR = { low: "var(--teal)", medium: "var(--amber)", high: "var(--red)" };
const LEVEL_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk" };
const AI_MODEL = "claude-sonnet-5";

const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  expandBtn: document.getElementById("expandBtn"),
  settingsPanel: document.getElementById("settingsPanel"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveKeyBtn: document.getElementById("saveKeyBtn"),
  clearKeyBtn: document.getElementById("clearKeyBtn"),
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
  aiBtn: document.getElementById("aiBtn"),
  aiResult: document.getElementById("aiResult"),
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
  els.statApplicants.textContent = job.applicantCount != null ? job.applicantCount : "—";
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
  els.aiResult.classList.add("hidden");
  els.aiResult.textContent = "";

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

async function loadApiKey() {
  const { anthropicApiKey } = await chrome.storage.local.get("anthropicApiKey");
  return anthropicApiKey || "";
}

function buildAiPrompt(job) {
  return `You are helping a job seeker assess whether a LinkedIn posting is likely a "ghost job" (a listing that isn't actively being hired for). Here is the scraped posting data:

Title: ${job.title || "unknown"}
Company: ${job.company || "unknown"}
Posted: ${job.postedDaysAgo != null ? job.postedDaysAgo + " days ago" : "unknown"}${job.reposted ? " (marked reposted)" : ""}
Promoted listing: ${job.promoted ? "yes" : "no"}
Applicant count: ${job.applicantCount != null ? job.applicantCount : "unknown"}
Salary listed: ${job.hasSalary ? "yes" : "no"}
Workplace type: ${job.workplaceType || "unknown"}
"Urgently hiring" language present: ${job.urgentFlag ? "yes" : "no"}

Job description (may be truncated):
${job.description ? job.description.slice(0, 3000) : "not available"}

In under 120 words: give a plain-language read on how likely this is to be a real, actively-filled role versus a ghost/pipeline posting, and name the 1-2 strongest signals either way. Be direct and specific to this posting, not generic advice.`;
}

async function runAiAnalysis() {
  if (!currentJob) return;
  const apiKey = await loadApiKey();
  if (!apiKey) {
    els.settingsPanel.classList.remove("hidden");
    els.apiKeyInput.focus();
    return;
  }

  els.aiBtn.disabled = true;
  els.aiBtn.textContent = "Analyzing…";
  els.aiResult.classList.remove("hidden");
  els.aiResult.classList.remove("ai-result--error");
  els.aiResult.textContent = "Contacting Claude…";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: buildAiPrompt(currentJob) }]
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    els.aiResult.textContent = textBlock ? textBlock.text.trim() : "No response text returned.";
  } catch (err) {
    els.aiResult.classList.add("ai-result--error");
    els.aiResult.textContent = "Couldn't complete AI analysis: " + err.message;
  } finally {
    els.aiBtn.disabled = false;
    els.aiBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="13" height="13" class="btn__icon"><path fill="currentColor" d="M12 2.5 13.8 9l6.5 1.8-6.5 1.8L12 19l-1.8-6.4L3.7 10.8 10.2 9 12 2.5Z"/></svg> Run AI deep analysis';
  }
}

// --- Settings wiring ---
els.settingsBtn.addEventListener("click", () => {
  els.settingsPanel.classList.toggle("hidden");
});

els.expandBtn.addEventListener("click", () => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab && tab.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId });
    });
    return;
  }

  const expanded = document.body.classList.toggle("expanded");
  els.expandBtn.setAttribute("aria-pressed", String(expanded));
  els.expandBtn.title = expanded ? "Collapse panel" : "Expand panel";
  els.expandBtn.setAttribute("aria-label", expanded ? "Collapse panel" : "Expand panel");
});

loadApiKey().then((key) => {
  if (key) els.apiKeyInput.value = key;
});

els.saveKeyBtn.addEventListener("click", async () => {
  const val = els.apiKeyInput.value.trim();
  await chrome.storage.local.set({ anthropicApiKey: val });
  els.settingsPanel.classList.add("hidden");
});

els.clearKeyBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("anthropicApiKey");
  els.apiKeyInput.value = "";
});

els.aiBtn.addEventListener("click", runAiAnalysis);
els.rescanBtn.addEventListener("click", () => scanActiveTab(true));

scanActiveTab();
