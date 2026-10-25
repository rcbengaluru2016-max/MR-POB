# Dependency review

The initial dependency audit on 2026-10-22 identified advisories in image decoding and transitive build/documentation dependencies. The final lockfile uses:

* Sharp 0.35.5 or newer, including patched bundled native dependencies. See [the upstream release](https://sharp.pixelplumbing.com/changelog/v0.35.5/).
* A scoped override of Swagger's js-yaml to 5.5.0. [The advisory](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm) identifies 5.4.1 as the minimum patched release.
* A scoped override of Prisma config's deepmerge-ts to 8.0.2. [The advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) requires version 8. The [upstream version 8 changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) preserve `deepmerge` while changing Map merging; this application has no custom Prisma config or Map-based configuration. Prisma schema validation and migrations must continue to run with this override in CI.

The overrides preserve the existing Prisma 6 schema/migration interfaces and NestJS 11 compatibility. Reassess them when upgrading those direct dependencies. Use `npm audit --omit=dev` to check the installed graph; this is a dated advisory check, not a guarantee about future advisories.

See `verification.md` for final executed audit and test results.
