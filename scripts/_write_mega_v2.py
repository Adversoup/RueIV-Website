#!/usr/bin/env python3
"""Write the three mega menu v2 files."""
import os

BASE = "/Users/Darkside/RueIV-platform/theme"

# ─── mega-menu-rueiv-v2.liquid ───
liquid = r"""{%- comment -%}
  ============================================================================
  RueIV Mega v2 — Theme-native mega menu for "Shop"
  ============================================================================
  Layout:
  ┌──────────────────┬────────────────┬──────────────────┐
  │ SHOP BY CATEGORY │   PREVIEW      │ SHOP BY END USE  │
  │ Fabric           │   (image on    │ Upholstery       │
  │ Wallpaper        │    hover)      │ Drapery          │
  │ Furniture        │               │ Multi-purpose    │
  │ Lighting         │               │ Performance      │
  │──────────────────│               │──────────────────│
  │ SHOP BY ROOM     │               │ SHOP BY COLOR    │
  │ Living Room      │               │ White            │
  │ Bedroom          │               │ Ivory            │
  ├──────────────────┴────────────────┴──────────────────┤
  │  ← Arte · Fabricut · Porta Romana · Verellen · ZR → │
  └──────────────────────────────────────────────────────┘

  Data: menu_category, menu_room, menu_end_use, menu_color, menu_brands
{%- endcomment -%}

{%- liquid
  assign menu_category = block.settings.menu_category | default: 'shop-by-category'
  assign menu_category = linklists[menu_category]

  assign menu_room = block.settings.menu_room | default: 'shop-by-room'
  assign menu_room = linklists[menu_room]

  assign menu_end_use = block.settings.menu_end_use | default: 'shop-by-end-use'
  assign menu_end_use = linklists[menu_end_use]

  assign menu_color = block.settings.menu_color | default: 'shop-by-color'
  assign menu_color = linklists[menu_color]

  assign menu_brands = block.settings.menu_brands | default: 'shop-by-brand'
  assign menu_brands = linklists[menu_brands]

  assign brands_visible = block.settings.brands_visible | default: 4
  assign fallback_img = block.settings.fallback_image

  assign preview_default = nil
  if menu_category != blank and menu_category.links.size > 0
    for _link in menu_category.links
      if preview_default != nil
        break
      endif
      assign _parts = _link.url | split: '/collections/'
      if _parts.size > 1
        assign _handle = _parts[1] | split: '/' | first | split: '?' | first
        assign _col = collections[_handle]
        if _col.image != blank
          assign preview_default = _col.image
        elsif _col.products.first.featured_image != blank
          assign preview_default = _col.products.first.featured_image
        endif
      endif
    endfor
  endif
  if preview_default == nil and fallback_img != blank
    assign preview_default = fallback_img
  endif
-%}

<link rel="stylesheet" href="{{ 'rueiv-mega-v2.css' | asset_url }}" media="print" fetchpriority="low" onload="this.media='all'">

<details
  id="RueivMegaV2-{{ block.id }}"
  is="details-mega"
  trigger="{{ section.settings.menu_trigger }}"
  level="top"
  data-rv2-mega
  {{ block.shopify_attributes }}
>
  <summary data-link="{{ link.url }}" class="z-2 font-navigation">
    <span class="menu__item flex items-center relative">
      <span class="reversed-link flex items-center">
        {{- link.title | escape }}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.75 4.5L6 8.25L2.25 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </span>
  </summary>

  <div class="mega-menu v-scrollable">
    <div class="mega-menu__container">
      <div class="page-width mega-menu__wrapper">
        <div class="rv2-grid" data-rv2-grid>

          {%- comment -%} ── LEFT ZONE: Category + Room ── {%- endcomment -%}
          <div class="rv2-zone rv2-zone--left mega-menu__item">
            {%- if menu_category != blank and menu_category.links.size > 0 -%}
              <p class="rv2-heading font-heading">{{ menu_category.title | escape }}</p>
              <ul class="rv2-links" role="list">
                {%- for cat_link in menu_category.links -%}
                  <li>
                    <a href="{{ cat_link.url }}" class="rv2-link reversed-link" data-rv2-preview-trigger
                      data-collection-handle="{%- assign _p = cat_link.url | split: '/collections/' -%}{%- if _p.size > 1 -%}{{ _p[1] | split: '/' | first | split: '?' | first }}{%- endif -%}">
                      {{- cat_link.title | escape -}}
                    </a>
                  </li>
                {%- endfor -%}
              </ul>
            {%- endif -%}

            {%- if menu_room != blank and menu_room.links.size > 0 -%}
              <p class="rv2-heading rv2-heading--sub font-heading">{{ menu_room.title | escape }}</p>
              <ul class="rv2-links" role="list">
                {%- for room_link in menu_room.links -%}
                  <li>
                    <a href="{{ room_link.url }}" class="rv2-link reversed-link" data-rv2-preview-trigger
                      data-collection-handle="{%- assign _p = room_link.url | split: '/collections/' -%}{%- if _p.size > 1 -%}{{ _p[1] | split: '/' | first | split: '?' | first }}{%- endif -%}">
                      {{- room_link.title | escape -}}
                    </a>
                  </li>
                {%- endfor -%}
              </ul>
            {%- endif -%}
          </div>

          {%- comment -%} ── CENTER: Preview image panel ── {%- endcomment -%}
          <div class="rv2-zone rv2-zone--center mega-menu__item" data-rv2-preview>
            <div class="rv2-preview">
              {%- if preview_default -%}
                {{ preview_default | image_url: width: 800 | image_tag: loading: 'lazy', class: 'rv2-preview__img', alt: 'Collection preview', id: 'rv2-preview-img' }}
              {%- else -%}
                <div class="rv2-preview__placeholder" id="rv2-preview-img"></div>
              {%- endif -%}
            </div>
          </div>

          {%- comment -%} ── RIGHT ZONE: End Use + Color ── {%- endcomment -%}
          <div class="rv2-zone rv2-zone--right mega-menu__item">
            {%- if menu_end_use != blank and menu_end_use.links.size > 0 -%}
              <p class="rv2-heading font-heading">{{ menu_end_use.title | escape }}</p>
              <ul class="rv2-links" role="list">
                {%- for eu_link in menu_end_use.links -%}
                  <li>
                    <a href="{{ eu_link.url }}" class="rv2-link reversed-link" data-rv2-preview-trigger
                      data-collection-handle="{%- assign _p = eu_link.url | split: '/collections/' -%}{%- if _p.size > 1 -%}{{ _p[1] | split: '/' | first | split: '?' | first }}{%- endif -%}">
                      {{- eu_link.title | escape -}}
                    </a>
                  </li>
                {%- endfor -%}
              </ul>
            {%- endif -%}

            {%- if menu_color != blank and menu_color.links.size > 0 -%}
              <p class="rv2-heading rv2-heading--sub font-heading">{{ menu_color.title | escape }}</p>
              <ul class="rv2-links rv2-links--color" role="list">
                {%- for color_link in menu_color.links -%}
                  <li>
                    <a href="{{ color_link.url }}" class="rv2-link reversed-link" data-rv2-preview-trigger
                      data-collection-handle="{%- assign _p = color_link.url | split: '/collections/' -%}{%- if _p.size > 1 -%}{{ _p[1] | split: '/' | first | split: '?' | first }}{%- endif -%}">
                      {{- color_link.title | escape -}}
                    </a>
                  </li>
                {%- endfor -%}
              </ul>
            {%- endif -%}
          </div>

        </div><!-- .rv2-grid -->

        {%- comment -%} ── BRANDS CAROUSEL ── {%- endcomment -%}
        {%- if menu_brands != blank and menu_brands.links.size > 0 -%}
          <div class="rv2-brands mega-menu__item" data-rv2-brands>
            <div class="rv2-brands__header">
              <p class="rv2-heading rv2-heading--brands font-heading">{{ menu_brands.title | escape }}</p>
              <div class="rv2-brands__arrows">
                <button type="button" class="rv2-brands__arrow rv2-brands__arrow--prev" data-rv2-brand-prev aria-label="Previous brands" disabled>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button type="button" class="rv2-brands__arrow rv2-brands__arrow--next" data-rv2-brand-next aria-label="Next brands">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>
            <div class="rv2-brands__track" data-rv2-brand-track style="--rv2-brands-visible: {{ brands_visible }}">
              {%- for brand_link in menu_brands.links -%}
                {%- liquid
                  assign brand_img = nil
                  assign _bp = brand_link.url | split: '/collections/'
                  if _bp.size > 1
                    assign _bh = _bp[1] | split: '/' | first | split: '?' | first
                    assign _bc = collections[_bh]
                    if _bc.image != blank
                      assign brand_img = _bc.image
                    elsif _bc.products.first.featured_image != blank
                      assign brand_img = _bc.products.first.featured_image
                    endif
                  endif
                  if brand_img == nil and fallback_img != blank
                    assign brand_img = fallback_img
                  endif
                -%}
                <a href="{{ brand_link.url }}" class="rv2-brands__card promotion-item" data-rv2-preview-trigger data-collection-handle="{{ _bh }}">
                  <div class="rv2-brands__card-img">
                    {%- if brand_img -%}
                      {{ brand_img | image_url: width: 400 | image_tag: loading: 'lazy', class: 'rv2-brands__img', alt: brand_link.title }}
                    {%- else -%}
                      <div class="rv2-brands__placeholder"></div>
                    {%- endif -%}
                  </div>
                  <span class="rv2-brands__name">{{ brand_link.title | escape }}</span>
                </a>
              {%- endfor -%}
            </div>
          </div>
        {%- endif -%}

      </div>
    </div>
  </div>
</details>

{%- comment -%} Collection images JSON for hover preview {%- endcomment -%}
<script data-rv2-collection-images type="application/json">
  {%- liquid
    assign img_map = ''
    assign first = true

    assign all_menus = ''
    if menu_category != blank
      for _link in menu_category.links
        assign _p = _link.url | split: '/collections/'
        if _p.size > 1
          assign _h = _p[1] | split: '/' | first | split: '?' | first
          assign _c = collections[_h]
          assign _img = nil
          if _c.image != blank
            assign _img = _c.image | image_url: width: 800
          elsif _c.products.first.featured_image != blank
            assign _img = _c.products.first.featured_image | image_url: width: 800
          endif
          if _img != nil
            unless first
              assign img_map = img_map | append: ','
            endunless
            assign img_map = img_map | append: '"' | append: _h | append: '":"' | append: _img | append: '"'
            assign first = false
          endif
        endif
      endfor
    endif

    if menu_room != blank
      for _link in menu_room.links
        assign _p = _link.url | split: '/collections/'
        if _p.size > 1
          assign _h = _p[1] | split: '/' | first | split: '?' | first
          assign _c = collections[_h]
          assign _img = nil
          if _c.image != blank
            assign _img = _c.image | image_url: width: 800
          elsif _c.products.first.featured_image != blank
            assign _img = _c.products.first.featured_image | image_url: width: 800
          endif
          if _img != nil
            unless first
              assign img_map = img_map | append: ','
            endunless
            assign img_map = img_map | append: '"' | append: _h | append: '":"' | append: _img | append: '"'
            assign first = false
          endif
        endif
      endfor
    endif

    if menu_end_use != blank
      for _link in menu_end_use.links
        assign _p = _link.url | split: '/collections/'
        if _p.size > 1
          assign _h = _p[1] | split: '/' | first | split: '?' | first
          assign _c = collections[_h]
          assign _img = nil
          if _c.image != blank
            assign _img = _c.image | image_url: width: 800
          elsif _c.products.first.featured_image != blank
            assign _img = _c.products.first.featured_image | image_url: width: 800
          endif
          if _img != nil
            unless first
              assign img_map = img_map | append: ','
            endunless
            assign img_map = img_map | append: '"' | append: _h | append: '":"' | append: _img | append: '"'
            assign first = false
          endif
        endif
      endfor
    endif

    if menu_color != blank
      for _link in menu_color.links
        assign _p = _link.url | split: '/collections/'
        if _p.size > 1
          assign _h = _p[1] | split: '/' | first | split: '?' | first
          assign _c = collections[_h]
          assign _img = nil
          if _c.image != blank
            assign _img = _c.image | image_url: width: 800
          elsif _c.products.first.featured_image != blank
            assign _img = _c.products.first.featured_image | image_url: width: 800
          endif
          if _img != nil
            unless first
              assign img_map = img_map | append: ','
            endunless
            assign img_map = img_map | append: '"' | append: _h | append: '":"' | append: _img | append: '"'
            assign first = false
          endif
        endif
      endfor
    endif

    if menu_brands != blank
      for _link in menu_brands.links
        assign _p = _link.url | split: '/collections/'
        if _p.size > 1
          assign _h = _p[1] | split: '/' | first | split: '?' | first
          assign _c = collections[_h]
          assign _img = nil
          if _c.image != blank
            assign _img = _c.image | image_url: width: 800
          elsif _c.products.first.featured_image != blank
            assign _img = _c.products.first.featured_image | image_url: width: 800
          endif
          if _img != nil
            unless first
              assign img_map = img_map | append: ','
            endunless
            assign img_map = img_map | append: '"' | append: _h | append: '":"' | append: _img | append: '"'
            assign first = false
          endif
        endif
      endfor
    endif
  -%}
  { {{ img_map }} }
</script>

<script src="{{ 'rueiv-mega-v2.js' | asset_url }}" defer></script>
"""

# ─── rueiv-mega-v2.css ───
css = """/* ====================================================================
   RueIV Mega v2 — Styles
   Scoped with .rv2- prefix to avoid collisions with theme CSS.

   Layout:
   ┌──────────────────┬────────────────┬──────────────────┐
   │ SHOP BY CATEGORY │   PREVIEW      │ SHOP BY END USE  │
   │ (text links)     │   (hover img)  │ (text links)     │
   │ SHOP BY ROOM     │                │ SHOP BY COLOR    │
   ├──────────────────┴────────────────┴──────────────────┤
   │ ← Brand carousel with arrows →                      │
   └──────────────────────────────────────────────────────┘
   ==================================================================== */

/* ── 3-column grid (left / center preview / right) ── */
.rv2-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr;
  gap: 2rem;
  width: 100%;
  padding-block: 2rem 1.5rem;
}

/* ── Zones ── */
.rv2-zone {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rv2-zone--center {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

/* ── Headings ── */
.rv2-heading {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  line-height: 1;
  color: rgb(var(--color-foreground));
}

.rv2-heading--sub {
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(var(--color-foreground), 0.1);
}

.rv2-heading--brands {
  margin-bottom: 0;
  font-size: 0.65rem;
}

/* ── Link lists ── */
.rv2-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.rv2-links li {
  padding-block: 0.3rem;
}

.rv2-link {
  font-size: calc(var(--font-body-size, 15) * 0.93px);
  transition: opacity 0.2s ease;
  text-decoration: none;
}

.rv2-link:hover,
.rv2-link:focus-visible {
  opacity: 0.55;
}

/* ── Color link list: compact multi-column ── */
.rv2-links--color {
  columns: 2;
  column-gap: 1.5rem;
}

.rv2-links--color li {
  break-inside: avoid;
  padding-block: 0.2rem;
}

/* ── Preview panel ── */
.rv2-preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: rgb(var(--color-background-2, 245 245 245));
  position: relative;
}

.rv2-preview__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.3s ease;
}

.rv2-preview__img.rv2-preview--loading {
  opacity: 0.4;
}

.rv2-preview__placeholder {
  width: 100%;
  height: 100%;
  background: rgb(var(--color-background-2, 245 245 245));
}

/* ── Brands carousel ── */
.rv2-brands {
  border-top: 1px solid rgba(var(--color-foreground), 0.1);
  padding-top: 1.25rem;
  padding-bottom: 0.5rem;
}

.rv2-brands__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.rv2-brands__arrows {
  display: flex;
  gap: 0.25rem;
}

.rv2-brands__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(var(--color-foreground), 0.2);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.2s, opacity 0.2s;
  color: rgb(var(--color-foreground));
}

.rv2-brands__arrow:hover:not(:disabled) {
  border-color: rgb(var(--color-foreground));
}

.rv2-brands__arrow:disabled {
  opacity: 0.25;
  cursor: default;
}

/* ── Track ── */
.rv2-brands__track {
  display: flex;
  gap: 1rem;
  overflow: hidden;
  scroll-behavior: smooth;
}

.rv2-brands__card {
  flex: 0 0 calc((100% - (var(--rv2-brands-visible, 4) - 1) * 1rem) / var(--rv2-brands-visible, 4));
  text-decoration: none;
  color: rgb(var(--color-foreground));
  text-align: center;
  transition: transform 0.2s ease;
}

.rv2-brands__card:hover {
  transform: translateY(-2px);
}

.rv2-brands__card-img {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: rgb(var(--color-background-2, 245 245 245));
  margin-bottom: 0.5rem;
}

.rv2-brands__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.rv2-brands__card:hover .rv2-brands__img {
  transform: scale(1.04);
}

.rv2-brands__placeholder {
  width: 100%;
  height: 100%;
  background: rgb(var(--color-background-2, 245 245 245));
}

.rv2-brands__name {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 500;
}

/* ── Responsive: hide on mobile (theme's mobile nav takes over) ── */
@media (max-width: 1023.98px) {
  .rv2-grid,
  .rv2-brands {
    display: none;
  }
}
"""

# ─── rueiv-mega-v2.js ───
js = """/**
 * RueIV Mega v2 — Hover preview + Brand carousel
 * ------------------------------------------------
 * - Hover any link with [data-rv2-preview-trigger] swaps center preview image
 * - Brand carousel: prev/next arrows scroll the track
 * - Keyboard accessible (focus triggers same as hover)
 */
(function () {
  'use strict';

  /** @type {Object<string, string>} handle -> imageUrl */
  var collectionImages = {};

  function initPreview(megaEl) {
    var script = megaEl.parentElement && megaEl.parentElement.querySelector('[data-rv2-collection-images]');
    if (script) {
      try { collectionImages = JSON.parse(script.textContent || '{}'); }
      catch (e) { console.warn('[rv2] Failed to parse collection images JSON:', e); }
    }

    var previewImg = megaEl.querySelector('#rv2-preview-img, .rv2-preview__img');
    if (!previewImg) return;

    var triggers = megaEl.querySelectorAll('[data-rv2-preview-trigger]');
    var originalSrc = previewImg.src || '';

    triggers.forEach(function (trigger) {
      var handle = trigger.dataset.collectionHandle;
      if (!handle) return;

      function swapImage() {
        var newSrc = collectionImages[handle];
        if (!newSrc) return;
        if (previewImg.tagName === 'IMG') {
          if (previewImg.src === newSrc) return;
          previewImg.classList.add('rv2-preview--loading');
          var img = new Image();
          img.onload = function () {
            previewImg.src = newSrc;
            previewImg.classList.remove('rv2-preview--loading');
          };
          img.onerror = function () {
            previewImg.classList.remove('rv2-preview--loading');
          };
          img.src = newSrc;
        }
      }

      function restoreImage() {
        if (previewImg.tagName === 'IMG' && originalSrc) {
          previewImg.src = originalSrc;
          previewImg.classList.remove('rv2-preview--loading');
        }
      }

      trigger.addEventListener('mouseenter', swapImage);
      trigger.addEventListener('focusin', swapImage);
      trigger.addEventListener('mouseleave', restoreImage);
      trigger.addEventListener('focusout', restoreImage);
    });
  }

  function initBrandCarousel(megaEl) {
    var track = megaEl.querySelector('[data-rv2-brand-track]');
    var prevBtn = megaEl.querySelector('[data-rv2-brand-prev]');
    var nextBtn = megaEl.querySelector('[data-rv2-brand-next]');
    if (!track || !prevBtn || !nextBtn) return;

    var cards = track.querySelectorAll('.rv2-brands__card');
    if (cards.length === 0) return;

    var currentIndex = 0;
    var visible = parseInt(track.style.getPropertyValue('--rv2-brands-visible') || '4', 10);
    var maxIndex = Math.max(0, cards.length - visible);

    function getCardWidth() {
      var style = getComputedStyle(track);
      var gap = parseFloat(style.gap) || 16;
      return cards[0].offsetWidth + gap;
    }

    function scrollTo(index) {
      currentIndex = Math.max(0, Math.min(index, maxIndex));
      var offset = currentIndex * getCardWidth();
      track.style.transform = 'translateX(-' + offset + 'px)';
      track.style.transition = 'transform 0.35s ease';
      updateButtons();
    }

    function updateButtons() {
      prevBtn.disabled = currentIndex <= 0;
      nextBtn.disabled = currentIndex >= maxIndex;
    }

    prevBtn.addEventListener('click', function () { scrollTo(currentIndex - 1); });
    nextBtn.addEventListener('click', function () { scrollTo(currentIndex + 1); });

    updateButtons();
  }

  function init() {
    document.querySelectorAll('[data-rv2-mega]').forEach(function (megaEl) {
      initPreview(megaEl);
      initBrandCarousel(megaEl);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
"""

# Write files
files = {
    os.path.join(BASE, "snippets", "mega-menu-rueiv-v2.liquid"): liquid,
    os.path.join(BASE, "assets", "rueiv-mega-v2.css"): css,
    os.path.join(BASE, "assets", "rueiv-mega-v2.js"): js,
}

for path, content in files.items():
    with open(path, "w") as f:
        f.write(content)
    lines = content.count("\n")
    print(f"  Wrote {path.split('/')[-1]} ({lines} lines)")

print("\nDone!")
