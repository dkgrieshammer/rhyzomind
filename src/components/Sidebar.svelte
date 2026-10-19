<script lang="ts">
  import { app } from '../lib/app.svelte';

  let renaming = $state<string | null>(null);
  let renameText = $state('');
  let fileInput: HTMLInputElement;

  function startRename(id: string, name: string) {
    renaming = id;
    renameText = name;
  }

  async function finishRename() {
    if (renaming) await app.renameMap(renaming, renameText);
    renaming = null;
  }

  async function onImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await app.importFile(file);
    } catch (err) {
      alert(`Could not open ${file.name}: ${(err as Error).message}`);
    }
  }

  async function remove(id: string, name: string) {
    if (confirm(`Delete "${name}"? This cannot be undone.`)) await app.deleteMap(id);
  }

  function focusSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  const fmt = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<aside class="sidebar panel" onpointerdown={(e) => e.stopPropagation()}>
  <div class="head">
    <span>maps</span>
    <div>
      <button onclick={() => app.createMap()} title="New map">new</button>
      <button onclick={() => fileInput.click()} title="Open a .canvas file">open</button>
      <input bind:this={fileInput} type="file" accept=".canvas,.json,application/json" hidden onchange={onImport} />
    </div>
  </div>
  <ul>
    {#each app.maps as m (m.id)}
      <li class:current={m.id === app.doc.id}>
        {#if renaming === m.id}
          <input
            class="rename"
            bind:value={renameText}
            use:focusSelect
            onblur={finishRename}
            onkeydown={(e) => {
              if (e.key === 'Enter') finishRename();
              if (e.key === 'Escape') renaming = null;
            }}
          />
        {:else}
          <button class="name" onclick={() => app.open(m.id)} ondblclick={() => startRename(m.id, m.name)}>
            <span>{m.name}</span>
            <small>{fmt(m.updated)}</small>
          </button>
          <div class="item-actions">
            <button onclick={() => startRename(m.id, m.name)} title="Rename">✎</button>
            <button onclick={() => app.duplicateMap(m.id)} title="Duplicate">⧉</button>
            <button onclick={() => remove(m.id, m.name)} title="Delete">✕</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="note">Maps are stored in this browser. Use export → .canvas to back them up or move them to another device.</p>
</aside>

<style>
  .sidebar {
    position: absolute;
    top: 44px;
    left: 12px;
    width: 260px;
    max-height: calc(100% - 60px);
    display: flex;
    flex-direction: column;
    z-index: 20;
    padding: 6px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 4px 6px;
    color: var(--muted);
    font-size: 11px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    border-radius: 4px;
  }
  li.current {
    background: var(--hover);
  }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name small {
    color: var(--muted);
    font-size: 10px;
  }
  .item-actions {
    display: flex;
    opacity: 0;
  }
  li:hover .item-actions,
  li.current .item-actions,
  .item-actions:focus-within {
    opacity: 1;
  }
  .item-actions button {
    padding: 2px 5px;
    color: var(--muted);
  }
  .item-actions button:hover {
    color: var(--fg);
  }
  .rename {
    flex: 1;
    margin: 3px;
    padding: 3px 5px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--bg);
    outline: none;
  }
  .note {
    margin: 8px 6px 2px;
    font-size: 10px;
    line-height: 1.5;
    color: var(--muted);
  }
  @media (hover: none) {
    .item-actions {
      opacity: 1;
    }
  }
</style>
