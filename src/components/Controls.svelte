<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { download, safeFileName } from '../lib/formats';
  import { PALETTE } from '../lib/types';

  let exportOpen = $state(false);
  let busy = $state(false);
  let collapsed = $state(typeof window !== 'undefined' && window.innerWidth < 640);

  const settings = $derived((app.version, app.doc.settings));
  // The document is not deeply reactive; re-read the selected node through `version`.
  const node = $derived((app.version, app.selection?.kind === 'node' ? app.node(app.selection.id) : undefined));
  const nodeColor = $derived(node ? (app.version, node.color) : '');
  const nodePinned = $derived(node ? (app.version, node.pinned) : false);

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    // Label boxes take their look from the on-screen `.txt-bg` style.
    const box = document.querySelector('.txt-bg');
    const bs = box ? getComputedStyle(box) : null;
    const opacity = bs ? +bs.opacity * +bs.fillOpacity : 0;
    return {
      bg: v('--bg'),
      edge: v('--edge'),
      label: v('--label'),
      labelBg: bs?.fill && bs.fill !== 'none' ? bs.fill : '#ffffff',
      labelBgOpacity: Number.isFinite(opacity) ? opacity : 0,
    };
  }

  async function run(fn: () => Promise<void> | void) {
    exportOpen = false;
    busy = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      alert(`Export failed: ${(err as Error).message}`);
    } finally {
      busy = false;
    }
  }

  const name = () => safeFileName(app.doc.name);

  const exportSvg = () =>
    run(async () => {
      const { buildSvg } = await import('../lib/export');
      const { svg } = await buildSvg(app.scene, { outline: app.outlineText, colors: colors() });
      download(`${name()}.svg`, svg, 'image/svg+xml');
    });
  const exportPng = () =>
    run(async () => {
      const { toPng } = await import('../lib/export');
      download(`${name()}.png`, await toPng(app.scene, colors()), 'image/png');
    });
  const exportPdf = () =>
    run(async () => {
      const { toPdf } = await import('../lib/export');
      download(`${name()}.pdf`, await toPdf(app.scene, colors()), 'application/pdf');
    });

  const themes = ['auto', 'light', 'dark'] as const;
  const nextTheme = () => app.setTheme(themes[(themes.indexOf(app.theme) + 1) % themes.length]);
</script>

<svelte:window onpointerdown={() => (exportOpen = false)} />

<div class="controls panel" class:collapsed onpointerdown={(e) => e.stopPropagation()} role="toolbar" tabindex="-1">
  <div class="row top">
    <button onclick={() => app.fit()} title="Fit to screen (F)">fit</button>
    <div class="menu-wrap">
      <button onclick={() => (exportOpen = !exportOpen)} aria-expanded={exportOpen} disabled={busy}>
        {busy ? 'exporting…' : 'export'}
      </button>
      {#if exportOpen}
        <div class="menu panel" role="menu">
          <div class="svg-row">
            <button role="menuitem" onclick={exportSvg}>SVG</button>
            <div class="toggle" role="group" aria-label="SVG text mode">
              <button class:on={!app.outlineText} onclick={() => app.setOutline(false)} title="Text stays editable; font is embedded">
                text
              </button>
              <button class:on={app.outlineText} onclick={() => app.setOutline(true)} title="Text converted to vector outlines; looks identical everywhere">
                outlines
              </button>
            </div>
          </div>
          <button role="menuitem" onclick={exportPng}>PNG</button>
          <button role="menuitem" onclick={exportPdf}>PDF</button>
          <hr />
          <button role="menuitem" onclick={() => ((exportOpen = false), app.saveCanvasFile())}>
            .canvas <span class="hint">save file · Obsidian</span>
          </button>
          <button role="menuitem" onclick={() => ((exportOpen = false), app.saveGraphML())}>
            GraphML <span class="hint">yEd · Gephi</span>
          </button>
        </div>
      {/if}
    </div>
    <button onclick={nextTheme} title="Theme: {app.theme}">{app.theme === 'auto' ? '◐' : app.theme === 'light' ? '○' : '●'}</button>
    <button class="collapse" onclick={() => (collapsed = !collapsed)} title={collapsed ? 'Show sliders' : 'Hide sliders'}>
      {collapsed ? '▾' : '▴'}
    </button>
  </div>

  {#if !collapsed}
    <label class="row">
      <span>size</span>
      <input
        type="range"
        min="3"
        max="18"
        step="0.5"
        value={settings.baseSize}
        oninput={(e) => app.setSettings({ baseSize: +e.currentTarget.value })}
      />
    </label>
    <label class="row">
      <span>spacing</span>
      <input
        type="range"
        min="0.3"
        max="3"
        step="0.05"
        value={settings.spacing}
        oninput={(e) => app.setSettings({ spacing: +e.currentTarget.value })}
      />
    </label>
    <label class="row">
      <span>blend</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={settings.blend}
        oninput={(e) => app.setSettings({ blend: +e.currentTarget.value })}
      />
    </label>
    <label class="row check" title="Dropping a dragged node keeps it where you put it">
      <span>pin on drag</span>
      <input type="checkbox" checked={app.pinOnDrag} onchange={(e) => app.setPinOnDrag(e.currentTarget.checked)} />
    </label>
  {/if}

  {#if node}
    <div class="section">
      <div class="swatches" role="group" aria-label="Node colour">
        {#each PALETTE as c}
          <button
            class="swatch"
            class:active={c === nodeColor}
            style:background={c}
            onclick={() => app.setColor(node.id, c)}
            aria-label="Colour {c}"
          ></button>
        {/each}
        <label class="swatch custom" class:active={!PALETTE.includes(nodeColor)} title="Custom colour" style:background={PALETTE.includes(nodeColor) ? undefined : nodeColor}>
          <input type="color" value={nodeColor} oninput={(e) => app.setColor(node.id, e.currentTarget.value)} />
          {#if PALETTE.includes(nodeColor)}<span aria-hidden="true">+</span>{/if}
        </label>
      </div>
      <div class="actions">
        <button onclick={() => app.startEdit(node.id)} title="Edit text (Enter)">edit</button>
        <button onclick={() => app.setPinned(node.id, !nodePinned)} title="Pinned nodes stay where you put them (alt-click)">
          {nodePinned ? 'unpin' : 'pin'}
        </button>
        <button class="danger" onclick={() => app.deleteSelected()} title="Delete (Backspace)">delete</button>
      </div>
    </div>
  {:else if app.selection?.kind === 'edge'}
    <div class="section actions">
      <span class="muted">connection</span>
      <button class="danger" onclick={() => app.deleteSelected()} title="Delete (Backspace)">delete</button>
    </div>
  {:else if !collapsed}
    <p class="section muted">select a node to change its colour</p>
  {/if}
</div>

<style>
  .controls {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 6px;
    width: 220px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 10;
  }
  @media (max-width: 640px) {
    .controls {
      width: 176px;
      top: 8px;
      right: 8px;
    }
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
  }
  .row span {
    width: 56px;
    color: var(--muted);
    font-size: 11px;
  }
  .row.check input {
    flex: none;
    margin: 0;
  }
  .row input {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
  }
  .top {
    padding: 0;
    gap: 2px;
  }
  .top > :global(*:first-child) {
    margin-right: auto;
  }
  .section {
    border-top: 1px solid var(--panel-border);
    margin: 4px 0 0;
    padding: 8px 4px 2px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section.actions {
    flex-direction: row;
  }
  .muted {
    color: var(--muted);
    font-size: 11px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.08);
    flex: none;
  }
  .swatch.active {
    outline: 2px solid var(--select);
    outline-offset: 1px;
  }
  .custom {
    position: relative;
    display: grid;
    place-items: center;
    border: 1px dashed var(--muted);
    color: var(--muted);
    cursor: pointer;
    line-height: 1;
  }
  .custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2px;
  }
  .actions button {
    font-size: 11px;
    color: var(--muted);
    padding: 2px 6px;
  }
  .actions button:hover {
    color: var(--fg);
  }
  .actions .danger:hover {
    color: #d1495b;
  }
  .collapse {
    color: var(--muted);
  }
  .menu-wrap {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    width: 230px;
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  .menu button {
    text-align: left;
  }
  .menu hr {
    border: none;
    border-top: 1px solid var(--panel-border);
    margin: 4px 0;
    width: 100%;
  }
  .hint {
    color: var(--muted);
    font-size: 10px;
    margin-left: 4px;
  }
  .svg-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .toggle {
    display: flex;
    border: 1px solid var(--panel-border);
    border-radius: 4px;
    overflow: hidden;
  }
  .toggle button {
    border-radius: 0;
    font-size: 10px;
    padding: 2px 6px;
    color: var(--muted);
  }
  .toggle button.on {
    background: var(--accent);
    color: var(--accent-fg);
  }
</style>
