#!/usr/bin/env bun
/**
 * ghx — a minimal `gh` replacement for the Claude Code sandbox.
 *
 * Why this exists:
 *   `gh` is a Go binary. Go on macOS verifies TLS certificates exclusively
 *   through the platform verifier (SecTrustEvaluateWithError), which needs the
 *   keychain layer. The sandbox denies reading ~/Library/Keychains, so the
 *   Security framework reports "no keychain is available" and Go surfaces it as
 *      tls: failed to verify certificate: x509: OSStatus -26276
 *   (-26276 = errSecInternalComponent). It is intermittent only because trustd
 *   caches successful evaluations out-of-process for a few minutes.
 *
 *   Bun uses BoringSSL with its own bundled root store and never touches the
 *   keychain, so it works regardless. Auth token still comes from `gh auth token`,
 *   which is a purely local read and always works.
 *
 * Usage:
 *   bun scripts/ghx.ts api <path> [METHOD] [json-body]
 *   bun scripts/ghx.ts graphql '<query>'
 *   bun scripts/ghx.ts merge <owner/repo> <pr#> [--squash|--merge|--rebase] [--delete-branch]
 *   bun scripts/ghx.ts create <owner/repo> <head> <base> <title> [body]
 */

async function token(): Promise<string> {
  const p = Bun.spawn(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(p.stdout).text()).trim();
  if (!out) throw new Error("could not read token from `gh auth token`");
  return out;
}

async function call(path: string, method = "GET", body?: unknown) {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `bearer ${await token()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "ghx",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, body: parsed };
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "api") {
  const [path, method = "GET", raw] = args;
  if (!path) die("usage: ghx api <path> [METHOD] [json-body]");
  const r = await call(path, method, raw ? JSON.parse(raw) : undefined);
  console.log(JSON.stringify(r.body, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === "graphql") {
  const query = args[0];
  if (!query) die("usage: ghx graphql '<query>'");
  const r = await call("/graphql", "POST", { query });
  console.log(JSON.stringify(r.body, null, 2));
  process.exit(r.ok && !r.body?.errors ? 0 : 1);
}

if (cmd === "merge") {
  const repo = args[0];
  const num = args[1];
  if (!repo || !num) die("usage: ghx merge <owner/repo> <pr#> [--squash|--merge|--rebase] [--delete-branch]");
  const method = args.includes("--rebase") ? "rebase" : args.includes("--merge") ? "merge" : "squash";
  const deleteBranch = args.includes("--delete-branch");

  const pr = await call(`/repos/${repo}/pulls/${num}`);
  if (!pr.ok) die(`could not read PR: ${pr.status} ${JSON.stringify(pr.body)}`);
  if (pr.body.merged) die(`PR #${num} is already merged.`);
  if (pr.body.state !== "open") die(`PR #${num} is ${pr.body.state}, not open.`);

  const merged = await call(`/repos/${repo}/pulls/${num}/merge`, "PUT", { merge_method: method });
  if (!merged.ok) die(`merge failed: ${merged.status} ${JSON.stringify(merged.body)}`);
  console.log(`merged #${num} (${method}): ${merged.body.message ?? "ok"}`);

  if (deleteBranch) {
    const ref = pr.body.head.ref;
    const sameRepo = pr.body.head.repo?.full_name === pr.body.base.repo.full_name;
    if (!sameRepo) {
      console.log(`skipped branch delete: ${ref} lives in a fork`);
    } else {
      const del = await call(`/repos/${repo}/git/refs/heads/${ref}`, "DELETE");
      console.log(del.ok || del.status === 204 ? `deleted branch ${ref}` : `branch delete failed: ${del.status}`);
    }
  }
  process.exit(0);
}

if (cmd === "create") {
  const [repo, head, base, title, body] = args;
  if (!repo || !head || !base || !title) {
    die("usage: ghx create <owner/repo> <head> <base> <title> [body]");
  }
  const pr = await call(`/repos/${repo}/pulls`, "POST", { head, base, title, body });
  if (!pr.ok) die(`create failed: ${pr.status} ${JSON.stringify(pr.body)}`);
  console.log(pr.body.html_url);
  process.exit(0);
}

die("usage: ghx <api|graphql|merge|create> ...");
