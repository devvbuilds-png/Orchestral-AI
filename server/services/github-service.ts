import axios from "axios";

// ──────────────────────────────────────────────────────────────────────────────
// GitHub connector — reads PUBLIC repo data via the REST API.
//
// Auth is optional: unauthenticated calls are limited to 60 req/hr, which is
// exhausted quickly when ingesting a developer with many repos. Set GITHUB_TOKEN
// (a fine-grained or classic PAT with public-repo read) to lift this to 5000/hr.
// A per-request token can also be passed (e.g. a user-provided PAT).
// ──────────────────────────────────────────────────────────────────────────────

const API = "https://api.github.com";

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  languages_url: string;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  disabled?: boolean;
  pushed_at: string;
  created_at: string;
  updated_at: string;
  license?: { spdx_id?: string; name?: string } | null;
  default_branch: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string;
  html_url: string;
  blog: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
}

function headers(token?: string): Record<string, string> {
  const t = token || process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Kaizen-VibeCoder/1.0",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

function normalizeUsername(input: string): string {
  // Accept a bare username or a full profile URL.
  const trimmed = input.trim().replace(/\/+$/, "");
  const m = trimmed.match(/github\.com\/([^/]+)/i);
  return (m ? m[1] : trimmed).replace(/^@/, "");
}

export async function getUser(usernameOrUrl: string, token?: string): Promise<GitHubUser> {
  const username = normalizeUsername(usernameOrUrl);
  try {
    const { data } = await axios.get(`${API}/users/${encodeURIComponent(username)}`, {
      headers: headers(token), timeout: 15000,
    });
    return data as GitHubUser;
  } catch (err: any) {
    if (err?.response?.status === 404) throw new Error(`GitHub user "${username}" not found`);
    if (err?.response?.status === 403) throw new Error("GitHub rate limit hit — set GITHUB_TOKEN to raise the limit");
    throw new Error(`Failed to load GitHub user: ${err?.message ?? "unknown error"}`);
  }
}

export async function listUserRepos(usernameOrUrl: string, token?: string): Promise<GitHubRepo[]> {
  const username = normalizeUsername(usernameOrUrl);
  const repos: GitHubRepo[] = [];
  // Paginate, sorted by most-recently-pushed, up to 300 repos (3 pages).
  for (let page = 1; page <= 3; page++) {
    const { data } = await axios.get(`${API}/users/${encodeURIComponent(username)}/repos`, {
      headers: headers(token),
      params: { type: "owner", sort: "pushed", direction: "desc", per_page: 100, page },
      timeout: 20000,
    });
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...(data as GitHubRepo[]));
    if (data.length < 100) break;
  }
  return repos;
}

export async function getReadme(fullName: string, token?: string): Promise<string | null> {
  try {
    const { data } = await axios.get(`${API}/repos/${fullName}/readme`, {
      headers: { ...headers(token), Accept: "application/vnd.github.raw+json" },
      timeout: 15000,
      transformResponse: [(d) => d], // keep raw text
    });
    return typeof data === "string" ? data : String(data ?? "");
  } catch {
    return null; // no README — fine
  }
}

export async function getLanguages(fullName: string, token?: string): Promise<Record<string, number>> {
  try {
    const { data } = await axios.get(`${API}/repos/${fullName}/languages`, {
      headers: headers(token), timeout: 15000,
    });
    return (data && typeof data === "object") ? data as Record<string, number> : {};
  } catch {
    return {};
  }
}

// ── Heuristic ranking — approximate "pinned"/featured repos without GraphQL ───
export function scoreRepo(repo: GitHubRepo): number {
  if (repo.fork || repo.archived || repo.disabled) return -Infinity;
  const stars = Math.log10(repo.stargazers_count + 1) * 4;
  const forks = Math.log10(repo.forks_count + 1) * 2;
  const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86_400_000;
  const recency = Math.max(0, 3 - ageDays / 120);            // recent pushes weigh up
  const hasHome = repo.homepage ? 1.5 : 0;
  const hasTopics = (repo.topics?.length ?? 0) > 0 ? 1 : 0;
  const hasDesc = repo.description ? 0.5 : 0;
  return stars + forks + recency + hasHome + hasTopics + hasDesc;
}

/** Return non-fork, non-archived repos sorted by descending score. */
export function rankRepos(repos: GitHubRepo[]): GitHubRepo[] {
  return repos
    .filter((r) => !r.fork && !r.archived && !r.disabled)
    .map((r) => ({ r, s: scoreRepo(r) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

/** Byte-weighted language totals across many repos → sorted [lang, pct]. */
export function aggregateLanguages(perRepo: Record<string, number>[]): Array<{ language: string; pct: number }> {
  const totals: Record<string, number> = {};
  let grand = 0;
  for (const langs of perRepo) {
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] ?? 0) + bytes;
      grand += bytes;
    }
  }
  if (grand === 0) return [];
  return Object.entries(totals)
    .map(([language, bytes]) => ({ language, pct: Math.round((bytes / grand) * 100) }))
    .filter((x) => x.pct > 0)
    .sort((a, b) => b.pct - a.pct);
}
