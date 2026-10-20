# Rhyzomind

Minimal force-directed mindmaps in the browser. Installable as an app and works offline.

## Use

| Action | Mouse | Touch |
| --- | --- | --- |
| Add node | double-click empty space | double-tap |
| Edit text | double-click node / Enter | double-tap node |
| Connect A → B | shift-drag from A to B | long-press A, then drag |
| Remove / flip connection | shift-drag again (same way removes, opposite way flips) | same, with long-press |
| Move | drag node (pins it if *pin on drag* is on) | drag node |
| Pin / unpin | alt-click, or panel → pin | panel → pin |
| Colour | select node → swatch or `+` in the panel | tap node, then panel |
| Delete | select + Backspace/Delete | panel → delete |
| Zoom / pan | wheel / drag background | pinch / drag |
| Fit | `F` or *fit* | *fit* |

Bubbles grow with the number of connections, in either direction. Colours flow along
connections: a node takes on the colours of the nodes connecting into it (the
*blend* slider sets how much), while source nodes keep their own colour.

## Files

- **`.canvas`** ([JSON Canvas](https://jsoncanvas.org)): the save format. Opens in
  Obsidian Canvas; Rhyzomind-specific data (pinning, slider settings) lives in
  `rhyzomind` fields that other apps ignore.
- **GraphML**: export for yEd, Gephi, Cytoscape.
- **SVG**: *text* mode embeds the font and keeps labels editable; *outlines* mode
  converts text to paths so it looks identical everywhere.
- **PNG / PDF**: vector PDF, text as outlines.

Maps are stored in the browser (IndexedDB). Export `.canvas` files to back them up
or move them between devices.

## Develop

```bash
npm install
npm run dev
```

`npm run build` type-checks and builds to `dist/`. Pushing to `main` on GitHub
deploys to GitHub Pages via `.github/workflows/deploy.yml`. In the repo settings,
set Pages → Source to **GitHub Actions**.

Stack: Svelte 5, d3-force (physics only), opentype.js (text outlines), jsPDF + svg2pdf.js.
