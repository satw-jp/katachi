# hikari — web publishing

Status: active
UpdatedAt: 2026-08-01

## Current surface

Hikari is currently published as the `HIKARI` workspace on the Cloud Sculpt root page, not as a separate route.

- Production: <https://katachi.a-8c3.workers.dev/>
- Build output: `dist/`
- Cloudflare Worker: `katachi`
- Configuration: `wrangler.jsonc`

The production page must be built and deployed from a committed revision. Do not deploy directly from a dirty working tree, because the Katachi repository can contain several unrelated studies in progress.

## Release procedure

1. Confirm the intended commit and working-tree scope.
2. Run `npm run build` at that commit.
3. Verify the root page locally with real clicks:
   - `HIKARI` opens;
   - `optics` opens;
   - normal mode reports WebGPU where available;
   - `?safe=1` reports CPU preview;
   - no browser errors are emitted.
4. Confirm GitHub contains the exact commit.
5. From a clean worktree at that commit, run `wrangler deploy --config wrangler.jsonc`.
6. Open production and confirm the visible version, `HIKARI` control, Optics view, and browser error log.
7. Record the deployment URL, Cloudflare version ID, Git commit, and validation result in the release note.

## Rollback

Redeploy the last known-good committed revision. Do not repair production by building an unknown dirty tree.

## Current observation

On 2026-08-01, production still showed Cloud Sculpt v0.2.0, updated 2026-07-17, and did not contain the `HIKARI` button. The local committed Hikari branch built successfully and passed normal WebGPU plus forced CPU-safe interaction checks. Production remains pending until Cloudflare authentication is restored and a clean commit is deployed.
