// Pure geometry shared by the on-screen canvas and every exporter,
// so an export always matches what is drawn.

import { blendWithNeighbours } from './color';
import type { MapEdge, MapNode, MapSettings } from './types';

export const FONT_FAMILY = 'JetBrains Mono';
export const FONT_SIZE = 11;
/** JetBrains Mono advance width is exactly 600/1000 em. */
export const CHAR_W = FONT_SIZE * 0.6;
export const LINE_H = FONT_SIZE * 1.4;
export const WRAP_CHARS = 26;
const LABEL_GAP = 8;
const ARROW_LEN = 5;
const ARROW_HALF = 4;
const ARROW_GAP = 3;
/** Connection styling, shared by canvas and exports (world units). */
export const EDGE_WIDTH = 1;
export const EDGE_DASH = '1 2.5';
const EDGE_GAP = 5;
/** White centre dot; fixed in world units so the size slider does not affect it. */
export const CENTER_DOT_R = 1.4;
export const CENTER_DOT_COLOR = '#ffffff';

export interface SceneNode {
  node: MapNode;
  r: number;
  ringWidth: number;
  dotR: number;
  /** Own colour blended with neighbours; used for both ring and inner bubble. */
  ring: string;
  lines: string[];
  labelX: number;
  /** Baseline of the first line. */
  labelY: number;
}

export interface SceneEdge {
  edge: MapEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arrow: string;
}

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  byId: Map<string, SceneNode>;
}

export function radiusFor(incoming: number, base: number) {
  return base * (1 + 0.45 * Math.sqrt(incoming));
}

export function wrapLabel(text: string, max = WRAP_CHARS): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > max) {
        if (line) out.push(line), (line = '');
        out.push(word.slice(0, max));
        word = word.slice(max);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= max) line += ' ' + word;
      else out.push(line), (line = word);
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export function buildScene(nodes: MapNode[], edges: MapEdge[], settings: MapSettings): Scene {
  const incoming = new Map<string, number>();
  const neighbours = new Map<string, string[]>();
  const colorOf = new Map(nodes.map((n) => [n.id, n.color]));
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    const a = colorOf.get(e.source);
    const b = colorOf.get(e.target);
    if (a && b) {
      (neighbours.get(e.source) ?? neighbours.set(e.source, []).get(e.source)!).push(b);
      (neighbours.get(e.target) ?? neighbours.set(e.target, []).get(e.target)!).push(a);
    }
  }

  const byId = new Map<string, SceneNode>();
  const sNodes = nodes.map((node) => {
    const r = radiusFor(incoming.get(node.id) ?? 0, settings.baseSize);
    const lines = wrapLabel(node.label);
    const sn: SceneNode = {
      node,
      r,
      ringWidth: Math.max(1.4, r * 0.2),
      // Inner bubble sits just inside the ring with a narrow gap.
      dotR: r * 0.7,
      ring: blendWithNeighbours(node.color, neighbours.get(node.id) ?? [], settings.blend),
      lines,
      labelX: node.x + r + LABEL_GAP,
      labelY: node.y - ((lines.length - 1) * LINE_H) / 2 + FONT_SIZE * 0.35,
    };
    byId.set(node.id, sn);
    return sn;
  });

  const sEdges: SceneEdge[] = [];
  for (const edge of edges) {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (!s || !t) continue;
    const dx = t.node.x - s.node.x;
    const dy = t.node.y - s.node.y;
    const d = Math.hypot(dx, dy);
    // Gaps are measured from the outer edge of each ring.
    const startOff = s.r + s.ringWidth / 2 + EDGE_GAP;
    const endOff = t.r + t.ringWidth / 2 + EDGE_GAP;
    if (d < startOff + endOff + ARROW_LEN + ARROW_GAP) continue; // too close — nothing sensible to draw
    const ux = dx / d;
    const uy = dy / d;
    const tipX = t.node.x - ux * endOff;
    const tipY = t.node.y - uy * endOff;
    const baseX = tipX - ux * ARROW_LEN;
    const baseY = tipY - uy * ARROW_LEN;
    const f = (v: number) => v.toFixed(2);
    sEdges.push({
      edge,
      x1: s.node.x + ux * startOff,
      y1: s.node.y + uy * startOff,
      // The dotted line stops a little short of the chevron.
      x2: baseX - ux * ARROW_GAP,
      y2: baseY - uy * ARROW_GAP,
      arrow: `M${f(baseX - uy * ARROW_HALF)},${f(baseY + ux * ARROW_HALF)}L${f(tipX)},${f(tipY)}L${f(baseX + uy * ARROW_HALF)},${f(baseY - ux * ARROW_HALF)}`,
    });
  }

  return { nodes: sNodes, edges: sEdges, byId };
}

/** World-space bounding box including labels. */
export function sceneBounds(scene: Scene, pad = 24) {
  if (!scene.nodes.length) return { x: -200, y: -150, w: 400, h: 300 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of scene.nodes) {
    const textW = Math.max(...n.lines.map((l) => l.length)) * CHAR_W;
    x0 = Math.min(x0, n.node.x - n.r - n.ringWidth);
    x1 = Math.max(x1, n.labelX + textW, n.node.x + n.r + n.ringWidth);
    y0 = Math.min(y0, n.node.y - n.r - n.ringWidth, n.labelY - FONT_SIZE);
    y1 = Math.max(y1, n.node.y + n.r + n.ringWidth, n.labelY + (n.lines.length - 1) * LINE_H + FONT_SIZE * 0.3);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
