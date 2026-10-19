<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { CENTER_DOT_COLOR, CENTER_DOT_R, CHAR_W, EDGE_DASH, EDGE_WIDTH, FONT_SIZE, LINE_H, WRAP_CHARS } from '../lib/scene';

  type Mode =
    | { kind: 'idle' }
    | { kind: 'pan'; moved: boolean; sx: number; sy: number }
    | { kind: 'press'; id: string; sx: number; sy: number; dx: number; dy: number }
    | { kind: 'drag'; id: string; dx: number; dy: number }
    | { kind: 'connect'; from: string; x: number; y: number; over: string | null }
    | { kind: 'pinch' };

  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_MS = 450;
  const DOUBLE_TAP_MS = 320;

  let svg: SVGSVGElement;
  let w = $state(0);
  let h = $state(0);
  let fitted = false;
  let mode = $state<Mode>({ kind: 'idle' });
  let editText = $state('');

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart: { dist: number; cx: number; cy: number } | null = null;
  let longPress: ReturnType<typeof setTimeout> | undefined;
  let lastTap = { t: 0, x: 0, y: 0, target: '' };

  $effect(() => {
    if (!w || !h) return;
    app.viewport = { w, h };
    if (!fitted) (fitted = true), app.fit(false);
  });

  const scene = $derived(app.scene);
  const view = $derived(app.view);
  const editingNode = $derived(app.editingId ? scene.byId.get(app.editingId) : undefined);

  function local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function nodeAt(wx: number, wy: number, slack = 8) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const n of scene.nodes) {
      const d = Math.hypot(n.node.x - wx, n.node.y - wy) - n.r;
      if (d < slack && d < bestD) (best = n.node.id), (bestD = d);
    }
    return best;
  }

  const idFrom = (t: EventTarget | null, attr: string) =>
    (t as Element | null)?.closest?.(`[${attr}]`)?.getAttribute(attr) ?? null;

  /** Returns true when this tap completes a double tap on the same target. */
  function isDoubleTap(x: number, y: number, target: string) {
    const now = performance.now();
    const dbl = now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 20 && lastTap.target === target;
    lastTap = dbl ? { t: 0, x: 0, y: 0, target: '' } : { t: now, x, y, target };
    return dbl;
  }

  let editFor: string | null = null;

  function startEdit(id: string) {
    editFor = id;
    editText = app.node(id)?.label ?? '';
    app.startEdit(id);
  }

  // Editing can also be started from the controls panel.
  $effect(() => {
    const id = app.editingId;
    if (id && id !== editFor) {
      editText = untrack(() => app.node(id)?.label ?? '');
    }
    editFor = id;
  });

  function commitEdit() {
    const id = app.editingId;
    if (!id) return;
    app.editingId = null;
    const text = editText.trim();
    // Empty labels are fine: the node stays and can be edited later.
    if (text !== app.node(id)?.label) app.setLabel(id, text);
  }

  function cancelEdit() {
    app.editingId = null;
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (app.editingId) commitEdit();
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {}
    const p = local(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      clearTimeout(longPress);
      if (mode.kind === 'drag') app.dragEnd(mode.id, true);
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      mode = { kind: 'pinch' };
      return;
    }
    if (pointers.size > 2) return;

    const wpt = app.screenToWorld(p.x, p.y);
    // A bubble under the pointer wins over a neighbour's label hit area.
    const nodeId = nodeAt(wpt.x, wpt.y, 4) ?? idFrom(e.target, 'data-node-id');
    const edgeId = idFrom(e.target, 'data-edge-id');

    if (nodeId) {
      const n = app.node(nodeId)!;
      if (e.altKey) {
        app.setPinned(nodeId, !n.pinned);
        app.selection = { kind: 'node', id: nodeId };
        return;
      }
      if (e.shiftKey) {
        mode = { kind: 'connect', from: nodeId, x: wpt.x, y: wpt.y, over: null };
        return;
      }
      mode = { kind: 'press', id: nodeId, sx: p.x, sy: p.y, dx: n.x - wpt.x, dy: n.y - wpt.y };
      if (e.pointerType !== 'mouse') {
        longPress = setTimeout(() => {
          if (mode.kind === 'press' && mode.id === nodeId) {
            navigator.vibrate?.(15);
            mode = { kind: 'connect', from: nodeId, x: n.x, y: n.y, over: null };
          }
        }, LONG_PRESS_MS);
      }
      return;
    }
    if (edgeId) {
      app.selection = { kind: 'edge', id: edgeId };
      mode = { kind: 'idle' };
      return;
    }
    mode = { kind: 'pan', moved: false, sx: p.x, sy: p.y };
  }

  function onpointermove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId)!;
    const p = local(e);
    pointers.set(e.pointerId, p);

    if (mode.kind === 'pinch' && pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      app.view = { ...app.view, x: app.view.x + cx - pinchStart.cx, y: app.view.y + cy - pinchStart.cy };
      app.zoomAt(cx, cy, dist / pinchStart.dist);
      pinchStart = { dist, cx, cy };
      return;
    }
    const wpt = app.screenToWorld(p.x, p.y);
    switch (mode.kind) {
      case 'pan':
        if (!mode.moved && Math.hypot(p.x - mode.sx, p.y - mode.sy) < DRAG_THRESHOLD) return;
        mode.moved = true;
        app.view = { ...app.view, x: app.view.x + p.x - prev.x, y: app.view.y + p.y - prev.y };
        break;
      case 'press':
        if (Math.hypot(p.x - mode.sx, p.y - mode.sy) < DRAG_THRESHOLD) return;
        clearTimeout(longPress);
        mode = { kind: 'drag', id: mode.id, dx: mode.dx, dy: mode.dy };
        app.dragStart();
        app.dragMove(mode.id, wpt.x + mode.dx, wpt.y + mode.dy);
        break;
      case 'drag':
        app.dragMove(mode.id, wpt.x + mode.dx, wpt.y + mode.dy);
        break;
      case 'connect': {
        const over = nodeAt(wpt.x, wpt.y);
        mode = { ...mode, x: wpt.x, y: wpt.y, over: over !== mode.from ? over : null };
        break;
      }
    }
  }

  function onpointerup(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    clearTimeout(longPress);
    const p = local(e);

    if (mode.kind === 'pinch') {
      if (pointers.size === 0) (mode = { kind: 'idle' }), (pinchStart = null);
      return;
    }
    const m = mode;
    mode = { kind: 'idle' };
    switch (m.kind) {
      case 'press':
        app.selection = { kind: 'node', id: m.id };
        if (isDoubleTap(p.x, p.y, m.id)) startEdit(m.id);
        break;
      case 'drag':
        app.dragEnd(m.id, true);
        app.selection = { kind: 'node', id: m.id };
        break;
      case 'connect':
        if (m.over) app.connect(m.from, m.over);
        break;
      case 'pan':
        if (!m.moved) {
          app.selection = null;
          if (isDoubleTap(p.x, p.y, '')) {
            const wpt = app.screenToWorld(p.x, p.y);
            const n = app.addNode(wpt.x, wpt.y);
            startEdit(n.id);
          }
        }
        break;
    }
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const speed = e.ctrlKey ? 0.01 : 0.0015;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    app.zoomAt(p.x, p.y, Math.exp(-dy * speed));
  }

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest?.('input, textarea, [contenteditable]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && app.selection) {
      e.preventDefault();
      app.deleteSelected();
    } else if (e.key === 'Escape') {
      app.selection = null;
    } else if (e.key === 'Enter' && app.selection?.kind === 'node') {
      e.preventDefault();
      startEdit(app.selection.id);
    } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
      app.fit();
    }
  }

  function focusSelect(el: HTMLTextAreaElement) {
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
  }

  function onEditKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
    e.stopPropagation();
  }

  const connectFrom = $derived(mode.kind === 'connect' ? scene.byId.get(mode.from) : undefined);
</script>

<svelte:window {onkeydown} />

<div class="stage" bind:clientWidth={w} bind:clientHeight={h}>
  <svg
    bind:this={svg}
    class:connecting={mode.kind === 'connect'}
    class:panning={mode.kind === 'pan' && mode.moved}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onwheel}
    oncontextmenu={(e) => e.preventDefault()}
    role="application"
    aria-label="Mindmap canvas"
  >
    <g transform="translate({view.x} {view.y}) scale({view.k})">
      <g class="edges">
        {#each scene.edges as e (e.edge.id)}
          {@const sel = app.selection?.kind === 'edge' && app.selection.id === e.edge.id}
          <g class="edge" class:selected={sel} data-edge-id={e.edge.id}>
            <line class="hit" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke-width={12 / view.k} />
            <line class="line" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke-width={EDGE_WIDTH} stroke-dasharray={EDGE_DASH} />
            <path class="arrow" d={e.arrow} stroke-width={EDGE_WIDTH} />
          </g>
        {/each}
      </g>

      {#if mode.kind === 'connect' && connectFrom}
        <line
          class="pending"
          x1={connectFrom.node.x}
          y1={connectFrom.node.y}
          x2={mode.x}
          y2={mode.y}
          stroke-width={1.2 / view.k}
          stroke-dasharray="{4 / view.k} {3 / view.k}"
        />
      {/if}

      <g class="nodes">
        {#each scene.nodes as n (n.node.id)}
          {@const sel = app.selection?.kind === 'node' && app.selection.id === n.node.id}
          {@const target = mode.kind === 'connect' && (mode.over === n.node.id || mode.from === n.node.id)}
          <g class="node" data-node-id={n.node.id}>
            <circle class="hit" cx={n.node.x} cy={n.node.y} r={n.r + n.ringWidth + 6} />
            {#if n.lines.some(Boolean)}
              <rect
                class="hit"
                x={n.labelX - 4}
                y={n.labelY - FONT_SIZE}
                width={Math.max(...n.lines.map((l) => l.length)) * CHAR_W + 8}
                height={(n.lines.length - 1) * LINE_H + FONT_SIZE * 1.4}
              />
            {/if}
            {#if sel || target}
              <circle class="halo" cx={n.node.x} cy={n.node.y} r={n.r + n.ringWidth / 2 + 4} stroke-width={1 / view.k} />
            {/if}
            <circle cx={n.node.x} cy={n.node.y} r={n.r} fill="none" stroke={n.ring} stroke-width={n.ringWidth} />
            <circle cx={n.node.x} cy={n.node.y} r={n.dotR} fill={n.ring} />
            <circle cx={n.node.x} cy={n.node.y} r={CENTER_DOT_R} fill={CENTER_DOT_COLOR} />
            {#if n.node.pinned}
              <circle class="pin" cx={n.node.x} cy={n.node.y - n.r - n.ringWidth / 2 - 4} r="1.6" />
            {/if}
            {#if app.editingId !== n.node.id}
              <text class="label" font-size={FONT_SIZE}>
                {#each n.lines as line, i}
                  <tspan x={n.labelX} y={n.labelY + i * LINE_H}>{line}</tspan>
                {/each}
              </text>
            {/if}
          </g>
        {/each}
      </g>
    </g>
  </svg>

  {#if !scene.nodes.length}
    <p class="empty">double-click (or double-tap) to add the first node</p>
  {/if}

  {#if editingNode}
    <textarea
      class="editor"
      bind:value={editText}
      use:focusSelect
      onkeydown={onEditKey}
      onblur={commitEdit}
      rows={Math.max(1, Math.min(6, Math.ceil(editText.length / WRAP_CHARS) + (editText.match(/\n/g)?.length ?? 0)))}
      spellcheck="false"
      placeholder="label"
      style:left="{view.x + editingNode.labelX * view.k - 5}px"
      style:top="{view.y + editingNode.node.y * view.k}px"
      style:width="{(WRAP_CHARS + 2) * CHAR_W * view.k + 10}px"
      style:font-size="{FONT_SIZE * view.k}px"
      style:line-height="{LINE_H * view.k}px"
    ></textarea>
  {/if}

</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: default;
  }
  svg.panning {
    cursor: grabbing;
  }
  svg.connecting {
    cursor: crosshair;
  }
  .hit {
    fill: transparent;
    stroke: transparent;
  }
  .node {
    cursor: pointer;
  }
  .edge {
    cursor: pointer;
  }
  .edge .line {
    stroke: var(--edge);
  }
  .edge .arrow {
    fill: none;
    stroke: var(--edge);
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .edge:hover .line,
  .edge.selected .line {
    stroke: var(--select);
  }
  .edge:hover .arrow,
  .edge.selected .arrow {
    stroke: var(--select);
  }
  .label {
    fill: var(--label);
    font-family: 'JetBrains Mono', monospace;
  }
  .halo {
    fill: none;
    stroke: var(--select);
    stroke-dasharray: 2 2;
  }
  .pin {
    fill: var(--muted);
  }
  .pending {
    stroke: var(--select);
    pointer-events: none;
  }
  .empty {
    position: absolute;
    inset: 50% 0 auto;
    margin: 0;
    text-align: center;
    color: var(--muted);
    pointer-events: none;
  }
  .editor {
    position: absolute;
    transform: translateY(-50%);
    resize: none;
    border: 1px solid var(--panel-border);
    border-radius: 4px;
    background: var(--panel);
    color: var(--fg);
    padding: 2px 4px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
</style>
