// Ghost Job Detector — heuristic scorer
// Pure function: takes scraped job data, returns { score, level, flags }
// score: 0 (looks legit) to 100 (high ghost-job risk)

const VAGUE_PHRASES = [
  "fast-paced environment",
  "wear many hats",
  "rockstar",
  "ninja",
  "self-starter",
  "other duties as assigned",
  "competitive salary",
  "fast growing",
  "dynamic team",
  "unlimited earning potential",
  "work hard play hard"
];

function scoreJob(job) {
  const flags = [];
  let score = 0;

  // --- Posting age ---
  if (job.postedDaysAgo != null) {
    if (job.postedDaysAgo >= 60) {
      score += 25;
      flags.push({
        weight: 25,
        label: `Posted ${job.postedDaysAgo} days ago with no apparent update`,
        detail: "Postings open 2+ months are disproportionately likely to be stale or pipeline-building rather than actively hiring."
      });
    } else if (job.postedDaysAgo >= 30) {
      score += 12;
      flags.push({
        weight: 12,
        label: `Posted ${job.postedDaysAgo} days ago`,
        detail: "Over a month old — worth checking if it's still active on the company's own careers page."
      });
    }
  } else {
    flags.push({
      weight: 0,
      label: "Couldn't detect posting age",
      detail: "LinkedIn's markup may have changed, or the age wasn't visible on this view.",
      neutral: true
    });
  }

  if (job.reposted) {
    score += 10;
    flags.push({
      weight: 10,
      label: "Marked as reposted",
      detail: "Reposting without changes can indicate the role never got filled, or is being kept alive as a passive pipeline."
    });
  }

  if (job.promoted) {
    score += 8;
    flags.push({
      weight: 8,
      label: "Promoted job listing",
      detail: "Promoted listings are kept highly visible for longer and can be used to build a candidate pipeline, so verify that the role is still active on the company's careers page."
    });
  }

  // --- Applicant count vs age ---
  if (job.applicantCount != null && job.postedDaysAgo != null && job.postedDaysAgo > 0) {
    const rate = job.applicantCount / job.postedDaysAgo;
    const highApplicantVolume =
      job.applicantCount > 100 || (job.applicantCount === 100 && job.applicantCountIsMinimum);
    if (highApplicantVolume && job.postedDaysAgo > 21) {
      score += 15;
      flags.push({
        weight: 15,
        label: `${job.applicantCount}${job.applicantCountIsMinimum ? "+" : ""} applicants, still open after ${job.postedDaysAgo} days`,
        detail: "A large applicant pool with no closure suggests the role isn't moving toward a hire."
      });
    } else if (rate < 0.5 && job.postedDaysAgo > 14) {
      flags.push({
        weight: 0,
        label: "Low applicant volume for its age",
        detail: "Could mean low visibility rather than a fake posting — not a strong signal on its own.",
        neutral: true
      });
    }
  }

  // --- Salary transparency ---
  if (!job.hasSalary) {
    score += 12;
    flags.push({
      weight: 12,
      label: "No salary range detected",
      detail: "Missing pay info (where not legally required) correlates with lower posting quality and pipeline-building listings."
    });
  }

  // --- Urgency language ---
  if (job.urgentFlag && job.postedDaysAgo != null && job.postedDaysAgo >= 21) {
    score += 10;
    flags.push({
      weight: 10,
      label: "\"Urgently hiring\" on a listing that's been open weeks",
      detail: "Genuine urgency rarely stays unfilled this long — often a retention tactic to keep applicants flowing in."
    });
  }

  // --- Description quality ---
  if (job.descriptionLength && job.descriptionLength < 400) {
    score += 10;
    flags.push({
      weight: 10,
      label: "Very short job description",
      detail: "Thin descriptions are more common in low-effort or template postings than in roles with a real, immediate need."
    });
  }

  if (job.description) {
    const lower = job.description.toLowerCase();
    const hits = VAGUE_PHRASES.filter((p) => lower.includes(p));
    if (hits.length >= 3) {
      score += 8;
      flags.push({
        weight: 8,
        label: "Heavy use of generic buzzwords",
        detail: `Phrases like "${hits.slice(0, 3).join('", "')}" show up often in copy-pasted or filler listings.`
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  let level;
  if (score >= 55) level = "high";
  else if (score >= 30) level = "medium";
  else level = "low";

  return { score, level, flags };
}

if (typeof module !== "undefined") module.exports = { scoreJob };
