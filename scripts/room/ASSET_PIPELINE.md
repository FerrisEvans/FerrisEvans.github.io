# Asset pipeline moved

The island pipeline is documented in
[`scripts/island/ASSET_PIPELINE.md`](../island/ASSET_PIPELINE.md).

The former rainy study was replaced after the island browser flow passed.
Its original model, bakes, authoring scripts and shape-specific tests remain
recoverable at Git commit `08844b2`:

```sh
git show 08844b2:scripts/room/ASSET_PIPELINE.md
```

[`docs/island/migration.md`](../../docs/island/migration.md) maps the removed
assertions to preserved generic contracts and island-specific replacements.
The three reused runtime modules (`assets.ts`, `asset-cache.ts`,
`load-timings.ts`), their generic tests and the isolated cache browser check
remain in their existing paths. Ignored `.room-build/` source snapshots were
not touched.
