# 020 — Design

- `engine/package/schema.ts` — Zod `ClientPackage` (pages, notes, overrides, cards, snapshot, info,
  revisions, pinned `sources` = project files of the revisions pages show), `PACKAGE_VERSION`,
  `MIGRATIONS`, `serializePackage` / `parsePackageFile`; strings capped and control characters removed.
- `engine/package/compose.ts` — `composePage(pkg, page, ctx)` → `{ sheet, handles, status, reasons,
  orphaned }`. Technical pages are built with `planView` / `elevationView` / `scheduleRows` from the
  pinned revision; keys are added (`dim:<role>:<axis>:<a>:<b>`, `tag:<elementId>`, `text:<text>`,
  `marker:<letter>`); overrides (paper mm) move text along / the line away from the object, or move
  tags; values never change. `pageContentHash` (content at a fixed scale) drives staleness.
- `engine/package/commands.ts` — `executePackageCommand` (pure, immer), `createPackage`.
- `engine/deliverables/drawing.ts` — portrait paper, `sheetArea`, studio title block (`ClientTitle`),
  heading, sheet notes, `board` and `image` bodies, `Painter.image`, `text` colour; `pdf.ts` writes
  DCTDecode image XObjects (one per image), `svg.ts` writes `<image>` data URIs.
- `persistence/projectDb.ts` — DB v3: `packages` and `assets` stores (by project), removed with the project.
- `state/packageStore.ts` — load per project, dispatch, undo/redo, images, exports.
- `features/deliverables/package/*` — `PackageStudio` (page list, toolbar, stale banner),
  `PageCanvas` (exported SVG + handle overlay, drag → one command), `PackageInspector`, `images.ts`
  (JPEG re-encoding, 3D capture).
