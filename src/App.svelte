<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import Canvas from './components/Canvas.svelte';
  import Controls from './components/Controls.svelte';
  import Sidebar from './components/Sidebar.svelte';

  onMount(() => {
    app.init();
  });

  const name = $derived((app.version, app.doc.name));
</script>

<main>
  {#if app.ready}
    <Canvas />
  {/if}

  <header>
    <button class="brand" onclick={() => (app.sidebarOpen = !app.sidebarOpen)} aria-expanded={app.sidebarOpen}>
      RHYZOMIND
    </button>
    <button class="map-name" onclick={() => (app.sidebarOpen = !app.sidebarOpen)} title="Maps">
      {name} <span aria-hidden="true">{app.sidebarOpen ? '▴' : '▾'}</span>
    </button>
  </header>

  {#if app.sidebarOpen}
    <Sidebar />
  {/if}

  <Controls />

  <footer>
    double-click: add · shift-drag: connect · drag: move · alt-click: pin/unpin · F: fit
  </footer>
</main>

<style>
  main {
    position: relative;
    height: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  header {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 15;
    max-width: calc(100% - 270px);
  }
  .brand {
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 10px;
    letter-spacing: 0.12em;
    padding: 3px 28px 3px 6px;
    border-radius: 0;
  }
  .brand:hover {
    background: var(--accent);
    opacity: 0.9;
  }
  .map-name {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  footer {
    position: absolute;
    left: 12px;
    bottom: 10px;
    font-size: 10px;
    color: var(--muted);
    pointer-events: none;
  }
  @media (max-width: 640px), (hover: none) {
    footer {
      display: none;
    }
    header {
      top: 10px;
      left: 8px;
      gap: 4px;
      max-width: calc(100% - 196px);
    }
    .map-name {
      padding: 4px;
    }
    .brand {
      padding-right: 8px;
    }
  }
</style>
