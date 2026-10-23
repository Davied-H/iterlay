# Iterlay Visual QA

Use this checklist for multi-image batches, UI screens, exact-size requests, edited versions, and any task where clipping matters.

## Output Contract

Record these values before generation:

- Expected result count.
- One canonical pixel size when exact dimensions matter; otherwise one canonical aspect ratio.
- Whether every result must have identical pixel dimensions. Default to yes for a batch.
- Critical-content safe area. When the user does not specify one, keep critical text and controls outside the outer 4% of image width and 3% of image height.
- Which existing image, if any, defines the source dimensions and visual system.

Use a single source of truth. Do not combine a `size` argument such as `1024x1536` with a prompt requesting a different ratio such as `375x812`.

## Dimension Validation

1. Read the output paths and reported node/version dimensions from `get_generation_status` and `get_board`.
2. Read physical file dimensions with the bundled validator. Compare them with the corresponding node and active-version metadata. Any mismatch is a hard failure because the board can fit the new pixels into a stale frame and crop the result.
3. Compare active-version dimensions with their source versions after every edit.
4. For a batch, run the bundled validator:

```bash
node scripts/validate-image-batch.mjs --expected 1080x1920 image-1.png image-2.png
node scripts/validate-image-batch.mjs --ratio 9:16 image-1.png image-2.png
```

The validator requires identical dimensions by default. Use `--allow-mixed-dimensions` only when the user explicitly accepts variable sizes.

5. Treat a nonzero validator exit as a delivery failure. Report physical and metadata dimensions separately and do not retry a paid operation automatically.

## Full-Resolution Visual Check

Inspect every output at original resolution when an image inspection tool is available. Check:

- All four edges for clipped glyphs, status indicators, labels, menus, and controls.
- Critical content stays inside the declared safe area.
- The first and last rows, bottom navigation, and primary action are fully visible.
- Text does not overflow, wrap unexpectedly, merge with adjacent content, or become unreadable.
- Edited versions do not shift, zoom, or crop compared with their source frame.
- Repeated screens use consistent status-bar, content, and navigation insets.

Do not infer these properties from prompt wording.

## Board Check

1. Call `get_board_layout` and require no overlapping node pairs.
2. Compare every node's `width`, `height`, `displayWidth`, active version, and version dimensions with the physical file dimensions. Do not accept stale frame metadata.
3. Open or fit the board, then inspect the board presentation at a useful zoom when a visual control tool is available.
4. Verify that the board preview uses the complete image rather than a cropped frame. Pay special attention to outputs with a different aspect ratio from their neighbors.

`overlappingNodePairs: []` proves only that node rectangles do not overlap. It says nothing about internal image cropping.

## Acceptance States

- **Pass:** Tasks succeeded, dimensions match the contract, full-resolution checks pass, and board presentation is complete.
- **Validation failed:** The provider returned images, but dimensions, safe areas, version framing, or visual integrity failed.
- **Unverified:** Required visual inspection was unavailable. Report the missing check; do not describe the output as uncropped or delivery-ready.
