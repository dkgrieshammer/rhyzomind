import { DEFAULT_SETTINGS, PALETTE, uid, type MapDoc } from './types';

/** The first map a new visitor sees; it doubles as the manual. */
export function welcomeMap(): MapDoc {
  const labels: [string, string][] = [
    ['root', 'This is Rhyzomind'],
    ['add', 'double-click empty space to add a node'],
    ['edit', 'double-click a node to edit its text'],
    ['link', 'shift-drag from one node to another to connect them (long-press on touch)'],
    ['unlink', 'shift-drag the same way again to remove a connection'],
    ['big', 'nodes with more incoming connections grow bigger'],
    ['pin', 'alt-click a node to pin it in place'],
    ['color', 'select a node to change its colour in the panel'],
    ['mix', 'colours flow along connections into the target node'],
    ['export', 'export as SVG, PNG or PDF'],
    ['save', 'save as .canvas - opens in Obsidian too'],
  ];
  const ids = Object.fromEntries(labels.map(([k]) => [k, uid()]));
  const nodes = labels.map(([k, label], i) => {
    const a = (i / labels.length) * Math.PI * 2;
    return {
      id: ids[k],
      label,
      color: PALETTE[i % PALETTE.length],
      x: i === 0 ? 0 : Math.cos(a) * 160,
      y: i === 0 ? 0 : Math.sin(a) * 160,
      pinned: false,
    };
  });
  const links: [string, string][] = [
    ['add', 'root'],
    ['edit', 'add'],
    ['link', 'root'],
    ['unlink', 'link'],
    ['big', 'root'],
    ['big', 'link'],
    ['pin', 'root'],
    ['color', 'root'],
    ['mix', 'color'],
    ['export', 'root'],
    ['save', 'export'],
  ];
  return {
    id: uid(),
    name: 'Welcome',
    updated: Date.now(),
    nodes,
    edges: links.map(([s, t]) => ({ id: uid(), source: ids[s], target: ids[t] })),
    settings: { ...DEFAULT_SETTINGS },
  };
}
