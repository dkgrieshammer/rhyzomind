// Exporters. Loaded lazily, so fonts and PDF code only download when needed.

import { parse, type Font } from 'opentype.js';
import latinWoff from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import extWoff from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff?url';
import latinWoff2 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?inline';
import extWoff2 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff2?inline';
import { CENTER_DOT_COLOR, CENTER_DOT_R, CHAR_W, EDGE_DASH, EDGE_WIDTH, FONT_FAMILY, FONT_SIZE, LINE_H, labelBox, sceneBounds, type Scene } from './scene';

export interface ExportColors {
  bg: string;
  edge: string;
  label: string;
  /** Label background box, as styled by `.txt-bg` on screen. */
  labelBg: string;
  labelBgOpacity: number;
}

export interface SvgOptions {
  /** true: text becomes vector outlines (renders identically everywhere, not editable). */
  outline: boolean;
  colors: ExportColors;
}

let fonts: Promise<Font[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all(
    [latinWoff, extWoff].map((u) =>
      fetch(u)
        .then((r) => r.arrayBuffer())
        .then((b) => parse(b)),
    ),
  ));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f = (v: number) => +v.toFixed(2);

function outlineText(text: string, x: number, y: number, fontList: Font[]): string {
  let d = '';
  [...text].forEach((ch, i) => {
    if (ch === ' ') return;
    const font = fontList.find((fo) => fo.charToGlyphIndex(ch) > 0) ?? fontList[0];
    d += font.getPath(ch, x + i * CHAR_W, y, FONT_SIZE).toPathData(1);
  });
  return d;
}

export async function buildSvg(scene: Scene, opts: SvgOptions): Promise<{ svg: string; width: number; height: number }> {
  const b = sceneBounds(scene);
  const { bg, edge, label, labelBg, labelBgOpacity } = opts.colors;
  const fontList = opts.outline ? await loadFonts() : [];
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(b.w)}" height="${f(b.h)}" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}">`,
  );
  if (!opts.outline) {
    out.push(
      `<defs><style>` +
        `@font-face{font-family:'${FONT_FAMILY}';src:url(${latinWoff2}) format('woff2');}` +
        `@font-face{font-family:'${FONT_FAMILY} Ext';src:url(${extWoff2}) format('woff2');}` +
        `</style></defs>`,
    );
  }
  out.push(`<rect id="background" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="${bg}"/>`);

  out.push(`<g id="connections" stroke="${edge}" stroke-width="${EDGE_WIDTH}" stroke-dasharray="${EDGE_DASH}" fill="none">`);
  for (const e of scene.edges) out.push(`<line x1="${f(e.x1)}" y1="${f(e.y1)}" x2="${f(e.x2)}" y2="${f(e.y2)}"/>`);
  out.push(`</g><g id="arrows" stroke="${edge}" stroke-width="${EDGE_WIDTH}" stroke-linejoin="round" stroke-linecap="round" fill="none">`);
  for (const e of scene.edges) out.push(`<path d="${e.arrow}"/>`);
  out.push('</g>');

  out.push('<g id="nodes">');
  for (const n of scene.nodes) {
    const { x, y } = n.node;
    out.push(
      `<g id="node-${esc(n.node.id)}">` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(n.r)}" fill="none" stroke="${n.ring}" stroke-width="${f(n.ringWidth)}"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(n.dotR)}" fill="${n.ring}"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${CENTER_DOT_R}" fill="${CENTER_DOT_COLOR}"/>`,
    );
    out.push('</g>');
  }
  out.push('</g>');

  // Labels after all nodes, so text is always in front.
  out.push('<g id="labels">');
  for (const n of scene.nodes) {
    if (!n.node.label) continue;
    const box = labelBox(n);
    out.push(
      `<rect class="txt-bg" x="${f(box.x)}" y="${f(box.y)}" width="${f(box.w)}" height="${f(box.h)}" fill="${labelBg}" fill-opacity="${labelBgOpacity}"/>`,
    );
    if (opts.outline) {
      const d = n.lines.map((l, i) => outlineText(l, n.labelX, n.labelY + i * LINE_H, fontList)).join('');
      if (d) out.push(`<path id="label-${esc(n.node.id)}" d="${d}" fill="${label}"/>`);
    } else {
      out.push(
        `<text id="label-${esc(n.node.id)}" font-family="'${FONT_FAMILY}', '${FONT_FAMILY} Ext', monospace" font-size="${FONT_SIZE}" fill="${label}">` +
          n.lines.map((l, i) => `<tspan x="${f(n.labelX)}" y="${f(n.labelY + i * LINE_H)}">${esc(l)}</tspan>`).join('') +
          `</text>`,
      );
    }
  }
  out.push('</g></svg>');
  return { svg: out.join('\n'), width: b.w, height: b.h };
}

export async function toPng(scene: Scene, colors: ExportColors, scale = 3): Promise<Blob> {
  // Outlined text: fonts inside SVG-as-image are unreliable across browsers.
  const { svg, width, height } = await buildSvg(scene, { outline: true, colors });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function toPdf(scene: Scene, colors: ExportColors): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  // Outlined text keeps the PDF fully vector without embedding a font.
  const { svg, width, height } = await buildSvg(scene, { outline: true, colors });
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden';
  host.appendChild(el);
  document.body.appendChild(host);
  try {
    const doc = new jsPDF({ orientation: width > height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height] });
    await svg2pdf(el, doc, { x: 0, y: 0, width, height });
    return doc.output('blob');
  } finally {
    host.remove();
  }
}
