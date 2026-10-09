/* No catalog/prices in browser storage. Cards render in the current Shopify session. */
(() => {
  'use strict';
  const handlePattern = /^[a-z0-9][a-z0-9-]{0,254}$/;
  class RueIVFilterEngine extends HTMLElement {
    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;
      this.form = this.querySelector('form');
      this.grid = this.querySelector('[data-grid]');
      this.facets = this.querySelector('[data-facets]');
      this.status = this.querySelector('[role=status]');
      this.pageLabel = this.querySelector('[data-page]');
      this.previous = this.querySelector('[data-prev]');
      this.next = this.querySelector('[data-next]');
      this.native = document.querySelector(this.dataset.native);
      this.form.addEventListener('submit', event => { event.preventDefault(); this.updateFromForm(); });
      this.form.elements.sort.addEventListener('change', () => this.updateFromForm());
      this.querySelector('[data-clear]').addEventListener('click', () => { this.state = { selected: {}, q: '', page: 1, sort: 'title-ascending' }; this.syncForm(); this.load(true); });
      this.previous.addEventListener('click', () => { this.state.page--; this.load(true); });
      this.next.addEventListener('click', () => { this.state.page++; this.load(true); });
      this.onPop = () => { this.readUrl(); this.load(false); };
      window.addEventListener('popstate', this.onPop);
      this.readUrl();
      this.load(false);
    }
    disconnectedCallback() { this.controller?.abort(); window.removeEventListener('popstate', this.onPop); }
    readUrl() {
      const params = new URL(location.href).searchParams;
      const selected = {};
      for (const [key, value] of params) {
        if (key.startsWith('rf.')) (selected[key.slice(3)] ||= []).push(value);
      }
      this.state = { selected, q: params.get('rf_q') || '', page: Number(params.get('rf_page')) || 1, sort: params.get('rf_sort') || 'title-ascending' };
      this.syncForm();
    }
    syncForm() { this.form.elements.q.value = this.state.q; this.form.elements.sort.value = this.state.sort; }
    updateFromForm() { this.state.q = this.form.elements.q.value; this.state.sort = this.form.elements.sort.value; this.state.page = 1; this.load(true); }
    writeUrl() {
      const url = new URL(location.href);
      for (const key of [...url.searchParams.keys()]) if (key.startsWith('rf.') || key.startsWith('rf_')) url.searchParams.delete(key);
      for (const [key, choices] of Object.entries(this.state.selected)) for (const value of choices) url.searchParams.append(`rf.${key}`, value);
      if (this.state.q) url.searchParams.set('rf_q', this.state.q);
      if (this.state.page > 1) url.searchParams.set('rf_page', this.state.page);
      if (this.state.sort !== 'title-ascending') url.searchParams.set('rf_sort', this.state.sort);
      history.pushState(null, '', url);
    }
    showFacets(groups) {
      const fragment = document.createDocumentFragment();
      for (const group of groups) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        const n = (this.state.selected[group.key] || []).length;
        summary.textContent = `${group.label}${n ? ` (${n})` : ''}`;
        details.append(summary);
        const list = document.createElement('div'); list.className = 'rf-options';
        if (group.values.length > 12) {
          const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Find an option'; search.setAttribute('aria-label', `Find ${group.label} option`);
          search.addEventListener('input', () => { for (const label of list.querySelectorAll('label')) label.hidden = !label.textContent.toLowerCase().includes(search.value.toLowerCase()); });
          list.append(search);
        }
        for (const value of group.values) {
          const label = document.createElement('label'); const input = document.createElement('input');
          input.type = 'checkbox'; input.checked = value.selected; input.disabled = !value.count && !value.selected;
          input.addEventListener('change', () => {
            const choices = new Set(this.state.selected[group.key] || []);
            if (input.checked) choices.add(value.value); else choices.delete(value.value);
            this.state.selected[group.key] = [...choices]; this.state.page = 1; this.load(true);
          });
          label.append(input, document.createTextNode(`${value.value} (${value.count})`)); list.append(label);
        }
        details.append(list); fragment.append(details);
      }
      this.facets.replaceChildren(fragment);
    }
    async card(handle, signal) {
      if (!handlePattern.test(handle)) throw new Error('Invalid product handle');
      const root = this.dataset.root || '/';
      const url = new URL(`${root.replace(/\/$/, '')}/products/${handle}`, location.origin);
      url.searchParams.set('view', 'rueiv-filter-card');
      const theme = new URL(location.href).searchParams.get('preview_theme_id');
      if (theme) url.searchParams.set('preview_theme_id', theme);
      const response = await fetch(url, { signal, credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Product card unavailable');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const card = doc.querySelector(`[data-rueiv-card="${handle}"]`);
      if (!card) throw new Error('Preview product card template missing');
      // No scripts from the fragment. Native theme CSS and price resolver are reused.
      for (const script of card.querySelectorAll('script')) script.remove();
      return document.importNode(card, true);
    }
    async load(push) {
      this.controller?.abort();
      const controller = this.controller = new AbortController();
      const signal = controller.signal;
      this.setAttribute('aria-busy', 'true'); this.previous.disabled = this.next.disabled = true;
      this.status.textContent = 'Loading products…';
      try {
        const url = new URL(this.dataset.endpoint);
        if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS endpoint required');
        url.searchParams.set('collection', this.dataset.collection);
        url.searchParams.set('selected', JSON.stringify(this.state.selected));
        url.searchParams.set('q', this.state.q); url.searchParams.set('page', this.state.page);
        url.searchParams.set('page_size', '24'); url.searchParams.set('sort', this.state.sort);
        const response = await fetch(url, { signal, credentials: 'omit' });
        if (!response.ok) throw new Error('Filter service unavailable');
        const result = await response.json();
        if (result.version !== 1 || !Array.isArray(result.products) || result.products.length > 48 || !Array.isArray(result.facets)) throw new Error('Invalid filter response');
        const cards = new Array(result.products.length);
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
          while (cursor < cards.length) { const index = cursor++; cards[index] = await this.card(result.products[index].handle, signal); }
        }));
        if (signal.aborted) return;
        this.state.page = result.page;
        this.grid.replaceChildren(...cards); this.showFacets(result.facets);
        this.status.textContent = `${result.total.toLocaleString()} products${result.total === 0 ? ' — try fewer filters.' : ''}`;
        this.pageLabel.textContent = `Page ${result.page} of ${result.pages}`;
        this.previous.disabled = result.page <= 1; this.next.disabled = result.page >= result.pages;
        if (this.native) this.native.hidden = true;
        this.grid.hidden = false; this.facets.hidden = false;
        if (push) this.writeUrl();
      } catch (error) {
        if (signal.aborted) return;
        // Never present unfiltered native products as the filtered result set.
        this.grid.hidden = true; this.facets.hidden = true;
        this.pageLabel.textContent = '';
        if (this.native) this.native.hidden = false;
        this.status.textContent = 'Advanced filters are temporarily unavailable. Showing the standard collection below.';
      } finally {
        if (this.controller === controller) this.removeAttribute('aria-busy');
      }
    }
  }
  if (!customElements.get('rueiv-filter-engine')) customElements.define('rueiv-filter-engine', RueIVFilterEngine);
})();
