import { createStore, del, get, set } from 'idb-keyval';
import type { MapDoc, MapMeta } from './types';

// Maps live in IndexedDB in this browser only; files are the way to move them around.
const store = createStore('rhyzomind', 'maps');
const INDEX = 'index';

export const listMaps = async () => ((await get<MapMeta[]>(INDEX, store)) ?? []).sort((a, b) => b.updated - a.updated);

export const loadMap = (id: string) => get<MapDoc>(`map:${id}`, store);

/** Strips simulation fields (vx, vy, fx, …) so only the document is stored. */
export function cleanDoc(doc: MapDoc): MapDoc {
  return {
    id: doc.id,
    name: doc.name,
    updated: doc.updated,
    settings: { ...doc.settings },
    nodes: doc.nodes.map(({ id, label, color, x, y, pinned }) => ({
      id,
      label,
      color,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      pinned,
    })),
    edges: doc.edges.map(({ id, source, target }) => ({ id, source, target })),
  };
}

export async function saveMap(doc: MapDoc) {
  const clean = cleanDoc(doc);
  await set(`map:${doc.id}`, clean, store);
  const index = (await get<MapMeta[]>(INDEX, store)) ?? [];
  const meta = { id: doc.id, name: doc.name, updated: doc.updated };
  const i = index.findIndex((m) => m.id === doc.id);
  if (i >= 0) index[i] = meta;
  else index.push(meta);
  await set(INDEX, index, store);
}

export async function deleteMap(id: string) {
  await del(`map:${id}`, store);
  const index = ((await get<MapMeta[]>(INDEX, store)) ?? []).filter((m) => m.id !== id);
  await set(INDEX, index, store);
}
