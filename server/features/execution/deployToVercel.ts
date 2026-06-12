import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileRaw = promisify(execFileCb);

const BRANCH = "main";
const GIT_TIMEOUT = 30_000;

function git(args: string[]) {
  return execFileRaw("git", args, { timeout: GIT_TIMEOUT });
}

interface VercelDeployment {
  uid: string;
  url: string;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  createdAt: number;
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 12_000): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function deployToVercel(
  workspacePath: string,
  signal: AbortSignal
): Promise<string> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  const pushTime = Date.now();
  const commitMsg = `dispatch: ${new Date().toISOString()}`;

  // Stage workspace files (doesn't affect working branch)
  try {
    await git(["add", workspacePath]);
  } catch {
    // nothing to stage — continue with current index
  }

  // Write index to a tree object
  const { stdout: treeOut } = await git(["write-tree"]);
  const treeHash = treeOut.trim();

  // Parent = tip of remote main if exists, else local HEAD
  let parentHash: string;
  try {
    const { stdout } = await git(["rev-parse", `origin/${BRANCH}`]);
    parentHash = stdout.trim();
  } catch {
    const { stdout } = await git(["rev-parse", "HEAD"]);
    parentHash = stdout.trim();
  }

  // Create commit object without touching any local branch ref
  const { stdout: commitOut } = await git([
    "commit-tree", treeHash, "-p", parentHash, "-m", commitMsg,
  ]);
  const commitHash = commitOut.trim();

  // Force-push that commit to remote main (no local branch switch)
  await git(["push", "-f", "origin", `${commitHash}:refs/heads/${BRANCH}`]);

  // Restore index so current branch is unaffected
  try {
    await git(["reset", "HEAD", "--", workspacePath]);
  } catch {
    // ignore
  }

  if (!token || !projectId) {
    return `Pushed to ${BRANCH}.\n\n(Set VERCEL_TOKEN + VERCEL_PROJECT_ID in .env to get the deployment URL automatically.)`;
  }

  // Poll Vercel for the deployment triggered by our push.
  // Match by recency only — any deployment created around our push time.
  // Preview deployments don't always have meta.githubCommitRef set.
  const WINDOW_MS = 90_000; // look back 90s to account for Vercel queue delay

  for (let attempt = 0; attempt < 40; attempt++) {
    if (signal.aborted) throw new Error("Aborted");
    await new Promise<void>((resolve) => setTimeout(resolve, 4_000));

    let deployments: VercelDeployment[];
    try {
      const res = await fetchWithTimeout(
        `https://api.vercel.com/v9/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) continue;
      const data = await res.json() as { deployments: VercelDeployment[] };
      deployments = data.deployments ?? [];
    } catch {
      continue;
    }

    // Find the most recent deployment that started after (or just before) our push
    const match = deployments
      .filter((d) => d.createdAt >= pushTime - WINDOW_MS)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!match) continue;

    const url = `https://${match.url}`;
    if (match.state === "READY") return `Deployed!\n\n${url}`;
    if (match.state === "ERROR" || match.state === "CANCELED") {
      return `Deployment ${match.state.toLowerCase()}.\n\nCheck Vercel dashboard: ${url}`;
    }
    // BUILDING / INITIALIZING / QUEUED — keep polling
  }

  return `Pushed to ${BRANCH}. Deployment is taking longer than expected — check your Vercel dashboard.`;
}
