import { cleanDoc } from './storage';
import { DEFAULT_SETTINGS, PALETTE, uid, type MapDoc, type MapEdge, type MapNode } from './types';

// Native file format is JSON Canvas (https://jsoncanvas.org), the open format
// behind Obsidian Canvas. Rhyzomind-only data rides along in `rhyzomind` fields,
// which other apps ignore.

/** Obsidian cards are much larger than our bubbles, so positions are spread out on export. */
const CANVAS_SCALE = 3;

const PRESETS: Record<string, string> = {
  '1': '#fb464c',
  '2': '#e9973f',
  '3': '#e0de71',
  '4': '#44cf6e',
  '5': '#53dfdd',
  '6': '#a882ff',
};

interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  rhyzomind?: { pinned?: boolean };
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromEnd?: 'none' | 'arrow';
  toEnd?: 'none' | 'arrow';
}

interface CanvasFile {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  rhyzomind?: { version: number; name?: string; settings?: MapDoc['settings'] };
}

export function toJsonCanvas(doc: MapDoc): string {
  const d = cleanDoc(doc);
  const file: CanvasFile = {
    nodes: d.nodes.map((n) => {
      const lines = Math.max(1, Math.ceil(n.label.length / 30));
      const width = 260;
      const height = 30 + lines * 26;
      return {
        id: n.id,
        type: 'text',
        text: n.label,
        x: Math.round(n.x * CANVAS_SCALE - width / 2),
        y: Math.round(n.y * CANVAS_SCALE - height / 2),
        width,
        height,
        color: n.color,
        rhyzomind: { pinned: n.pinned },
      };
    }),
    edges: d.edges.map((e) => ({ id: e.id, fromNode: e.source, toNode: e.target, toEnd: 'arrow' })),
    rhyzomind: { version: 1, name: d.name, settings: d.settings },
  };
  return JSON.stringify(file, null, 2);
}

export function fromJsonCanvas(text: string, fallbackName: string): MapDoc {
  const file = JSON.parse(text) as CanvasFile;
  if (!Array.isArray(file.nodes)) throw new Error('Not a JSON Canvas file (no "nodes" array).');
  const nodes: MapNode[] = [];
  let i = 0;
  for (const n of file.nodes) {
    if (n.type === 'group') continue;
    const label =
      n.type === 'file' ? (n.file ?? '').split('/').pop()!.replace(/\.md$/, '') : n.type === 'link' ? (n.url ?? '') : (n.text ?? '');
    const color = n.color ? (PRESETS[n.color] ?? (/^#[0-9a-f]{3,6}$/i.test(n.color) ? n.color : undefined)) : undefined;
    nodes.push({
      id: String(n.id),
      label: label.trim(),
      color: color ?? PALETTE[i++ % PALETTE.length],
      x: (n.x + (n.width ?? 0) / 2) / CANVAS_SCALE,
      y: (n.y + (n.height ?? 0) / 2) / CANVAS_SCALE,
      pinned: !!n.rhyzomind?.pinned,
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: MapEdge[] = [];
  for (const e of file.edges ?? []) {
    // An arrow only at the start means the edge points the other way.
    const reversed = e.fromEnd === 'arrow' && e.toEnd === 'none';
    const source = String(reversed ? e.toNode : e.fromNode);
    const target = String(reversed ? e.fromNode : e.toNode);
    const key = [source, target].sort().join('|');
    if (!ids.has(source) || !ids.has(target) || source === target || seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: String(e.id ?? uid()), source, target });
  }
  return {
    id: uid(),
    name: file.rhyzomind?.name ?? fallbackName,
    updated: Date.now(),
    nodes,
    edges,
    settings: { ...DEFAULT_SETTINGS, ...file.rhyzomind?.settings },
  };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GraphML for yEd, Gephi, Cytoscape and friends. */
export function toGraphML(doc: MapDoc): string {
  const d = cleanDoc(doc);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="color" for="node" attr.name="color" attr.type="string"/>',
    '  <key id="x" for="node" attr.name="x" attr.type="double"/>',
    '  <key id="y" for="node" attr.name="y" attr.type="double"/>',
    '  <key id="pinned" for="node" attr.name="pinned" attr.type="boolean"/>',
    `  <graph id="${esc(d.name)}" edgedefault="directed">`,
  ];
  for (const n of d.nodes) {
    out.push(
      `    <node id="${esc(n.id)}"><data key="label">${esc(n.label)}</data><data key="color">${n.color}</data><data key="x">${n.x}</data><data key="y">${n.y}</data><data key="pinned">${n.pinned}</data></node>`,
    );
  }
  for (const e of d.edges) out.push(`    <edge id="${esc(e.id)}" source="${esc(e.source)}" target="${esc(e.target)}"/>`);
  out.push('  </graph>', '</graphml>');
  return out.join('\n');
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (s: string) => s.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'rhyzomind';
