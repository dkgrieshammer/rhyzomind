import { download, fromJsonCanvas, safeFileName, toGraphML, toJsonCanvas } from './formats';
import { Physics } from './physics';
import { buildScene, sceneBounds } from './scene';
import * as storage from './storage';
import { DEFAULT_SETTINGS, PALETTE, uid, type MapDoc, type MapMeta, type MapNode, type MapSettings } from './types';
import { welcomeMap } from './welcome';

export type Selection = { kind: 'node' | 'edge'; id: string } | null;
export type ThemePref = 'auto' | 'light' | 'dark';

const emptyDoc = (name = 'Untitled map'): MapDoc => ({
  id: uid(),
  name,
  updated: Date.now(),
  nodes: [],
  edges: [],
  settings: { ...DEFAULT_SETTINGS },
});

/**
 * Single app store. The document is a plain (non-proxied) object so d3-force can
 * mutate positions cheaply; `version` is bumped whenever anything changes and
 * everything derived from the document re-reads it.
 */
class AppState {
  maps = $state<MapMeta[]>([]);
  doc = $state.raw<MapDoc>(emptyDoc());
  version = $state(0);
  private _selection = $state<Selection>(null);
  /** Colour for new nodes: the last colour picked or the last node selected. */
  lastColor: string | null = null;

  get selection() {
    return this._selection;
  }
  set selection(sel: Selection) {
    this._selection = sel;
    if (sel?.kind === 'node') {
      const n = this.node(sel.id);
      if (n) this.lastColor = n.color;
    }
  }
  editingId = $state<string | null>(null);
  view = $state({ x: 0, y: 0, k: 1 });
  viewport = { w: 800, h: 600 };
  outlineText = $state(false);
  /** When on, dropping a dragged node pins it in place. */
  pinOnDrag = $state(false);
  theme = $state<ThemePref>('auto');
  sidebarOpen = $state(false);
  ready = $state(false);

  scene = $derived.by(() => {
    this.version;
    return buildScene(this.doc.nodes, this.doc.edges, this.doc.settings);
  });

  private physics = new Physics(
    () => this.version++,
    () => {
      this.scheduleSave();
      if (this.fitOnSettle) (this.fitOnSettle = false), this.fit();
    },
  );
  private fitOnSettle = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  async init() {
    try {
      this.theme = (localStorage.getItem('rhyzomind:theme') as ThemePref) ?? 'auto';
      this.outlineText = localStorage.getItem('rhyzomind:outline') === '1';
      this.pinOnDrag = localStorage.getItem('rhyzomind:pinOnDrag') === '1';
    } catch {}
    this.applyTheme();
    let maps = await storage.listMaps();
    if (!maps.length) {
      await storage.saveMap(welcomeMap());
      maps = await storage.listMaps();
    }
    this.maps = maps;
    let last: string | null = null;
    try {
      last = localStorage.getItem('rhyzomind:last');
    } catch {}
    await this.open(maps.find((m) => m.id === last)?.id ?? maps[0].id);
    this.ready = true;
  }

  // ---------- maps ----------

  async open(id: string) {
    await this.flushSave();
    const doc = await storage.loadMap(id);
    if (!doc) return;
    doc.settings = { ...DEFAULT_SETTINGS, ...doc.settings };
    this.setDoc(doc);
  }

  private setDoc(doc: MapDoc) {
    this.doc = doc;
    this.selection = null;
    this.editingId = null;
    try {
      localStorage.setItem('rhyzomind:last', doc.id);
    } catch {}
    this.physics.sync(doc.nodes, doc.edges, doc.settings, doc.nodes.some((n) => !n.pinned) ? 0.3 : 0);
    this.version++;
    this.fitOnSettle = true;
    requestAnimationFrame(() => this.fit(false));
  }

  async createMap() {
    await this.flushSave();
    const doc = emptyDoc(this.uniqueName('Untitled map'));
    await storage.saveMap(doc);
    this.maps = await storage.listMaps();
    this.setDoc(doc);
  }

  async duplicateMap(id: string) {
    await this.flushSave();
    const src = await storage.loadMap(id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: uid(), name: this.uniqueName(src.name + ' copy'), updated: Date.now() };
    await storage.saveMap(copy);
    this.maps = await storage.listMaps();
    this.setDoc(copy);
  }

  async renameMap(id: string, name: string) {
    name = name.trim();
    if (!name) return;
    if (id === this.doc.id) {
      this.doc.name = name;
      this.changed(0);
      await this.flushSave();
    } else {
      const doc = await storage.loadMap(id);
      if (!doc) return;
      doc.name = name;
      await storage.saveMap(doc);
      this.maps = await storage.listMaps();
    }
  }

  async deleteMap(id: string) {
    await storage.deleteMap(id);
    this.maps = await storage.listMaps();
    if (id === this.doc.id) {
      if (this.maps.length) await this.open(this.maps[0].id);
      else await this.createMap();
    }
  }

  private uniqueName(base: string) {
    const names = new Set(this.maps.map((m) => m.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  // ---------- persistence ----------

  /** Call after any document mutation. `heat` re-energises the physics. */
  changed(heat = 0.3) {
    this.doc.updated = Date.now();
    this.physics.sync(this.doc.nodes, this.doc.edges, this.doc.settings, heat);
    this.version++;
    this.scheduleSave();
  }

  private scheduleSave() {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 500);
  }

  private async flushSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.dirty) return;
    this.dirty = false;
    await storage.saveMap(this.doc);
    const meta = { id: this.doc.id, name: this.doc.name, updated: this.doc.updated };
    const i = this.maps.findIndex((m) => m.id === meta.id);
    if (i < 0 || this.maps[i].name !== meta.name || this.maps[i].updated !== meta.updated) {
      this.maps = await storage.listMaps();
    }
  }

  // ---------- nodes & edges ----------

  addNode(x: number, y: number) {
    const color = this.lastColor ?? PALETTE[this.doc.nodes.length % PALETTE.length];
    const node = { id: uid(), label: '', color, x, y, pinned: false };
    this.doc.nodes.push(node);
    this.changed(0.2);
    this.selection = { kind: 'node', id: node.id };
    this.editingId = node.id;
    return node;
  }

  node(id: string) {
    return this.doc.nodes.find((n) => n.id === id);
  }

  setLabel(id: string, label: string) {
    const n = this.node(id);
    if (!n) return;
    n.label = label;
    this.changed(0.1);
  }

  setColor(id: string, color: string) {
    const n = this.node(id);
    if (!n) return;
    n.color = color;
    this.lastColor = color;
    this.changed(0);
  }

  setPinned(id: string, pinned: boolean) {
    const n = this.node(id);
    if (!n) return;
    n.pinned = pinned;
    this.changed(pinned ? 0 : 0.3);
  }

  /**
   * Shift-drag result: creates source→target; dragging the same way again removes it;
   * dragging against an existing connection flips its direction.
   */
  connect(source: string, target: string) {
    if (source === target) return;
    const edges = this.doc.edges;
    const i = edges.findIndex(
      (e) => (e.source === source && e.target === target) || (e.source === target && e.target === source),
    );
    if (i < 0) edges.push({ id: uid(), source, target });
    else if (edges[i].source === source) {
      if (this.selection?.id === edges[i].id) this.selection = null;
      edges.splice(i, 1);
    } else edges[i] = { ...edges[i], source, target };
    this.changed(0.4);
  }

  deleteSelected() {
    const sel = this.selection;
    if (!sel) return;
    if (sel.kind === 'node') {
      this.doc.nodes = this.doc.nodes.filter((n) => n.id !== sel.id);
      this.doc.edges = this.doc.edges.filter((e) => e.source !== sel.id && e.target !== sel.id);
    } else {
      this.doc.edges = this.doc.edges.filter((e) => e.id !== sel.id);
    }
    this.selection = null;
    this.changed(0.3);
  }

  setSettings(patch: Partial<MapSettings>) {
    Object.assign(this.doc.settings, patch);
    this.changed('blend' in patch && Object.keys(patch).length === 1 ? 0 : 0.5);
  }

  // ---------- dragging (physics stays live) ----------

  dragStart() {
    this.physics.hold(true);
  }

  dragMove(id: string, x: number, y: number) {
    const n = this.node(id) as (MapNode & { fx?: number | null; fy?: number | null }) | undefined;
    if (!n) return;
    n.fx = n.x = x;
    n.fy = n.y = y;
    this.version++;
  }

  dragEnd(id: string, moved: boolean) {
    this.physics.hold(false);
    const n = this.node(id);
    if (n && moved && this.pinOnDrag) n.pinned = true;
    // A released, unpinned node glides back into the layout.
    this.changed(n && !n.pinned ? 0.3 : 0);
  }

  // ---------- view ----------

  screenToWorld(sx: number, sy: number) {
    const { x, y, k } = this.view;
    return { x: (sx - x) / k, y: (sy - y) / k };
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const { x, y, k } = this.view;
    const nk = Math.min(6, Math.max(0.1, k * factor));
    const f = nk / k;
    this.view = { k: nk, x: sx - (sx - x) * f, y: sy - (sy - y) * f };
  }

  /** Fit-to-screen. Waits a moment when the layout is still settling. */
  fit(animate = true) {
    const b = sceneBounds(this.scene, 40);
    const { w, h } = this.viewport;
    const k = Math.min(1.5, Math.max(0.1, Math.min(w / b.w, h / b.h)));
    const target = { k, x: w / 2 - (b.x + b.w / 2) * k, y: h / 2 - (b.y + b.h / 2) * k };
    if (!animate) {
      this.view = target;
      return;
    }
    const from = { ...this.view };
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 350);
      const e = 1 - (1 - p) ** 3;
      this.view = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- files ----------

  saveCanvasFile() {
    download(`${safeFileName(this.doc.name)}.canvas`, toJsonCanvas(this.doc), 'application/json');
  }

  saveGraphML() {
    download(`${safeFileName(this.doc.name)}.graphml`, toGraphML(this.doc), 'application/xml');
  }

  async importFile(file: File) {
    const doc = fromJsonCanvas(await file.text(), file.name.replace(/\.(canvas|json)$/i, ''));
    doc.name = this.uniqueName(doc.name);
    await this.flushSave();
    await storage.saveMap(doc);
    this.maps = await storage.listMaps();
    this.setDoc(doc);
  }

  // ---------- theme ----------

  setTheme(t: ThemePref) {
    this.theme = t;
    try {
      localStorage.setItem('rhyzomind:theme', t);
    } catch {}
    this.applyTheme();
  }

  setPinOnDrag(on: boolean) {
    this.pinOnDrag = on;
    try {
      localStorage.setItem('rhyzomind:pinOnDrag', on ? '1' : '0');
    } catch {}
  }

  /** Opens the label editor for a node (the canvas owns the text field). */
  startEdit(id: string) {
    this.selection = { kind: 'node', id };
    this.editingId = id;
  }

  setOutline(on: boolean) {
    this.outlineText = on;
    try {
      localStorage.setItem('rhyzomind:outline', on ? '1' : '0');
    } catch {}
  }

  private applyTheme() {
    if (this.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = this.theme;
  }
}


export const app = new AppState();
