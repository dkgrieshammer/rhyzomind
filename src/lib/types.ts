export interface MapNode {
  id: string;
  label: string;
  /** The colour the user picked (hex). The displayed ring colour is blended with neighbours. */
  color: string;
  x: number;
  y: number;
  pinned: boolean;
}

/** A directed connection: `source` is the node the drag started on. */
export interface MapEdge {
  id: string;
  source: string;
  target: string;
}

export interface MapSettings {
  /** Base radius of a node without connections. */
  baseSize: number;
  /** Multiplier for link length and repulsion. */
  spacing: number;
  /** 0..1 — how strongly a node's ring takes on its neighbours' colours. */
  blend: number;
}

export interface MapDoc {
  id: string;
  name: string;
  updated: number;
  nodes: MapNode[];
  edges: MapEdge[];
  settings: MapSettings;
}

export interface MapMeta {
  id: string;
  name: string;
  updated: number;
}

export const DEFAULT_SETTINGS: MapSettings = { baseSize: 7, spacing: 1, blend: 0.5 };

export const PALETTE = [
  '#9bc53d', // green
  '#5fa8d3', // blue
  '#8e7cc3', // violet
  '#e07a5f', // terracotta
  '#c9a227', // ochre
  '#d1495b', // red
  '#3d7068', // teal
  '#8a8f98', // grey
];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
