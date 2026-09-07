# Ghost Job Detector

A Chrome extension that scans LinkedIn job postings for signals of "ghost jobs"
(listings that aren't actively being hired for), plus an optional AI deep-analysis
pass using your own Anthropic API key.

## Install (unpacked)

1. Unzip this folder somewhere on your machine.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `ghost-job-detector` folder.
5. Pin the extension (puzzle-piece icon in the toolbar → pin) so it's easy to reach.

## Use it

1. Open any job posting on LinkedIn, e.g. `linkedin.com/jobs/view/...`.
2. Click the extension icon.
3. It scans the page automatically and shows:
   - A 0–100 heuristic risk score with a level (low / medium / high)
   - Posting age, applicant count, and whether a salary is listed
   - A breakdown of exactly which red flags were triggered and why

## Optional: AI deep analysis

Click the gear icon and paste an Anthropic API key (get one at
[console.anthropic.com](https://console.anthropic.com)). It's stored only in
your browser's local extension storage — never sent anywhere except directly
to Anthropic's API when you click "Run AI deep analysis."

The AI pass reads the job title, company, posting stats, and description, and
gives a short plain-language read that's more nuanced than the fixed heuristic
rules (e.g. it can notice a description that's internally inconsistent, or
reads like a template, in ways fixed rules can't).

Costs: each analysis is one small API call (a few cents at most on
Claude Sonnet, using your own API key/billing).

## What the heuristic score checks

- **Posting age** — 30+ days is a mild flag, 60+ days is a stronger one
- **Reposted** — LinkedIn's "reposted" marker
- **Applicant count vs. age** — high applicant count with no closure over time
- **Salary transparency** — no pay range listed
- **Urgency language** — "urgently hiring" on a listing open for weeks
- **Description quality** — very short descriptions, heavy generic buzzwords

None of these alone proves a posting is fake — they're the same checklist a
careful human would run through manually, just automated. Always sanity-check
a "high risk" score against the company's own careers page before writing
off a role.

## Limitations

- LinkedIn changes its page markup periodically; if scraping stops working,
  the selectors in `content.js` need updating.
- Only reads what's visible in your current LinkedIn session — it doesn't
  cross-check the company's careers page or Glassdoor for you (see the
  original checklist for that manual step).
- The AI analysis calls stop if you close the popup before the response
  returns — keep the popup open for a few seconds while it runs.
- Currently scoped to LinkedIn job pages. Indeed/other boards would need
  their own scraping selectors added to a new content script.

## Files

```
manifest.json    Extension config (Manifest V3)
content.js       Scrapes the LinkedIn job page DOM
scorer.js        Pure heuristic scoring function
popup.html/css/js  Popup UI, settings, and AI call
icons/           Extension icons
```
