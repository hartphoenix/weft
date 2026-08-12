# ghx.ts — gh replacement for the sandbox

`gh` is a Go binary. Go on macOS verifies TLS exclusively through the
platform verifier (`SecTrustEvaluateWithError`), which needs keychain
access. The sandbox denies `Read(//Users/rhhart/Library/Keychains/**)`,
so the verifier can't initialize and `gh` fails with:

```
tls: failed to verify certificate: x509: OSStatus -26276
```

(-26276 = `errSecInternalComponent`.) It looks intermittent because
`trustd` caches successful evaluations from other, non-sandboxed
processes on the machine for a few minutes — so a call can succeed
right after some unrelated process on the Mac primed the cache, then
fail again once that expires.

`gh api`/`gh pr create`/`gh pr merge` are all affected, not just
GraphQL calls — REST GET/POST hit the same code path.

`scripts/ghx.ts` (in this repo) works around it: it reads the token
via `gh auth token` (a local read, unaffected) and makes the actual
API calls with Bun's `fetch`, which uses BoringSSL and its own bundled
root store — no keychain dependency.

```
bun scripts/ghx.ts api <path> [METHOD] [json-body]
bun scripts/ghx.ts graphql '<query>'
bun scripts/ghx.ts create <owner/repo> <head> <base> <title> [body]
bun scripts/ghx.ts merge <owner/repo> <pr#> [--squash|--merge|--rebase] [--delete-branch]
```

Verified 2026-08-12 against a disposable private test repo
(`solo-test-site`): auth, REST GET, GraphQL, `create`, and
`merge --delete-branch` all confirmed working with no side effects
beyond the intended ones.

The underlying deny rule (`settings.json` line ~205,
`Read(//Users/rhhart/Library/Keychains/**)`) was left in place — it's
a real defense layer, not just an obstacle. `gh` for reads still works
often enough (cache luck) to be worth trying first; fall back to `ghx`
when it fails, or use `ghx` directly for merges, which fail reliably.
