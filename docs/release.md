# Release process

> No registry release is claimed until it is retrievable. Publishing requires configured authentication or trusted publishing and passing checks.

## Before release

- Recheck ownership and availability of the intended npm name and GitHub repository. Stop if a naming decision is needed.
- Verify the supported marimo export versions against authentic versioned fixtures, including malformed/security cases and missing-source exports. Confirm the documented feature matrix against actual results.
- Run lint, typecheck, unit/security/component tests, build, packed-package consumer checks, example builds and browser/accessibility tests. Verify React 18/19 and the intended Next consumer, no-Python build behavior, asset confinement and optional WASM inventory/source matching.
- Inspect `npm pack --dry-run` and the packed tarball for license/notice, declarations, styles/fonts and required runtime assets. Exclude private notebooks, data, credentials, caches and development fixtures.
- Review dependencies and bundled third-party license notices. Validate documentation and examples against the actual CLI and exported APIs, and update this pre-release status only when justified.
- Review the commits and release notes. Configure npm trusted publishing and provenance for the authorized release workflow; do not commit tokens.

The verification scripts are `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:package`, `npm run test:e2e`, and `npm run build:examples`. Local success does not replace reviewing the exact release commit and its CI result.

## Publish and verify

After approval and successful checks, publish a versioned public release using the configured trusted workflow. Verify that the exact version is retrievable from npm and that its repository/tag and package contents match the reviewed commit. Report failures or authentication blockers instead of claiming publication. Consumers should pin and test the actual version they install.
