/**
 * Gift Guide - Grid quick-view popup (vanilla JS, no dependencies)
 * --------------------------------------------------------------------
 * Responsibilities
 *  1. Open a popup for the clicked product using the JSON printed by
 *     sections/gift-guide-grid.liquid (name, price, description, variants).
 *  2. Render option pickers dynamically from the product's options:
 *     "Color"-like options -> buttons, every other option -> <select>.
 *  3. Resolve the selected variant, keep price / button state in sync.
 *  4. Add to cart through the AJAX Cart API. If the chosen variant
 *     contains both trigger values (e.g. "Black" + "Medium"), the upsell
 *     product configured in the section is added in the same request.
 *
 * One GiftGuideGrid instance is created per section, so the section can
 * be used more than once on a page and works inside the theme editor.
 */
(() => {
  'use strict';

  /** Options whose name matches this are rendered as buttons. */
  const BUTTON_OPTION_PATTERN = /^colou?r$/i;

  /** Lower-case + trim, used for case-insensitive comparisons. */
  const normalize = (value) => String(value || '').trim().toLowerCase();

  class GiftGuideGrid {
    /**
     * @param {HTMLElement} root - The section element ([data-gg-grid]).
     */
    constructor(root) {
      this.root = root;
      this.popup = root.querySelector('[data-gg-popup]');
      this.panel = this.popup.querySelector('.gg-popup__panel');
      this.form = this.popup.querySelector('[data-gg-form]');
      this.optionsEl = this.popup.querySelector('[data-gg-options]');
      this.messageEl = this.popup.querySelector('[data-gg-message]');
      this.submitBtn = this.popup.querySelector('[data-gg-submit]');
      this.submitLabel = this.popup.querySelector('[data-gg-submit-label]');
      this.ui = {
        image: this.popup.querySelector('[data-gg-image]'),
        title: this.popup.querySelector('[data-gg-title]'),
        price: this.popup.querySelector('[data-gg-price]'),
        description: this.popup.querySelector('[data-gg-description]'),
      };

      this.config = this.readJSON(root.querySelector('[data-gg-config]')) || {};
      // Trigger values can contain comma-separated aliases ("Medium, M").
      this.triggerGroups = (this.config.triggerValues || [])
        .map((value) => String(value || '').split(',').map(normalize).filter(Boolean))
        .filter((group) => group.length);

      this.product = null;
      this.selected = []; // selected value per option index (null = not chosen)
      this.lastTrigger = null; // element to return focus to on close

      this.bindEvents();
    }

    /** Safely parse a <script type="application/json"> element. */
    readJSON(el) {
      if (!el) return null;
      try {
        return JSON.parse(el.textContent);
      } catch (error) {
        console.error('[GiftGuide] Invalid JSON data', error);
        return null;
      }
    }

    bindEvents() {
      // Event delegation: one listener for every hotspot in the section.
      this.root.addEventListener('click', (event) => {
        const opener = event.target.closest('[data-gg-open]');
        if (opener) {
          this.open(opener.dataset.ggOpen, opener);
          return;
        }
        if (event.target.closest('[data-gg-close]')) this.close();
      });

      this.popup.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.close();
        if (event.key === 'Tab') this.trapFocus(event);
      });

      this.optionsEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-option-index]');
        if (!button || button.tagName !== 'BUTTON') return;
        this.selectValue(Number(button.dataset.optionIndex), button.dataset.value);
      });

      this.optionsEl.addEventListener('change', (event) => {
        const select = event.target.closest('select[data-option-index]');
        if (!select) return;
        this.selectValue(Number(select.dataset.optionIndex), select.value || null);
      });

      this.form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.addToCart();
      });
    }

    /* ------------------------------------------------------------------ */
    /* Popup open / close                                                  */
    /* ------------------------------------------------------------------ */

    open(blockId, trigger) {
      const dataEl = this.root.querySelector('[data-gg-product="' + blockId + '"]');
      const product = this.readJSON(dataEl);
      if (!product) return;

      this.product = product;
      this.lastTrigger = trigger;

      // Pre-select options that only have one value; leave the rest empty
      // so the customer makes an explicit choice (e.g. "Choose your size").
      this.selected = product.options.map((option) =>
        option.values.length === 1 ? option.values[0] : null
      );

      this.renderProduct();
      this.renderOptions();
      this.updateState();
      this.setMessage('');

      this.popup.hidden = false;
      document.body.classList.add('gg-popup-open');
      this.panel.focus();
    }

    close() {
      if (this.popup.hidden) return;
      this.popup.hidden = true;
      document.body.classList.remove('gg-popup-open');
      if (this.lastTrigger) this.lastTrigger.focus();
    }

    /** Keep keyboard focus inside the dialog while it is open. */
    trapFocus(event) {
      const focusable = this.panel.querySelectorAll(
        'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                           */
    /* ------------------------------------------------------------------ */

    renderProduct() {
      const { image, title, price, description } = this.ui;
      const product = this.product;

      title.textContent = product.title;
      price.textContent = product.price;
      description.textContent = product.description;

      if (product.image) {
        image.src = product.image;
        image.alt = product.imageAlt || product.title;
        image.hidden = false;
      } else {
        image.removeAttribute('src');
        image.hidden = true;
      }
    }

    /** Build option pickers from the product's options (no hardcoding). */
    renderOptions() {
      this.optionsEl.textContent = '';
      if (this.product.hasOnlyDefaultVariant) return;

      const fragment = document.createDocumentFragment();

      // Button-style options (e.g. Color) first, as in the design.
      const ordered = this.product.options
        .map((option, index) => ({ option, index }))
        .sort((a, b) => BUTTON_OPTION_PATTERN.test(b.option.name) - BUTTON_OPTION_PATTERN.test(a.option.name));

      ordered.forEach(({ option, index }) => {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'gg-option';

        const legend = document.createElement('legend');
        legend.className = 'gg-option__label';
        legend.textContent = option.name;
        fieldset.appendChild(legend);

        if (BUTTON_OPTION_PATTERN.test(option.name)) {
          fieldset.appendChild(this.createButtons(option, index));
        } else {
          fieldset.appendChild(this.createSelect(option, index));
        }

        fragment.appendChild(fieldset);
      });

      this.optionsEl.appendChild(fragment);
    }

    createButtons(option, index) {
      const group = document.createElement('div');
      group.className = 'gg-option__buttons';

      option.values.forEach((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gg-option__button';
        button.textContent = value;
        button.dataset.optionIndex = index;
        button.dataset.value = value;
        // Use the colour name itself for the side bar (CSS ignores invalid names).
        button.style.setProperty('--gg-swatch', normalize(value).replace(/\s+/g, ''));
        button.setAttribute('aria-pressed', String(this.selected[index] === value));
        group.appendChild(button);
      });

      return group;
    }

    createSelect(option, index) {
      const wrap = document.createElement('div');
      wrap.className = 'gg-option__select-wrap';

      const select = document.createElement('select');
      select.className = 'gg-option__select';
      select.dataset.optionIndex = index;
      select.setAttribute('aria-label', option.name);

      const placeholder = new Option('Choose your ' + option.name.toLowerCase(), '');
      select.add(placeholder);
      option.values.forEach((value) => select.add(new Option(value, value)));
      select.value = this.selected[index] || '';

      wrap.appendChild(select);
      return wrap;
    }

    /* ------------------------------------------------------------------ */
    /* Variant selection                                                   */
    /* ------------------------------------------------------------------ */

    selectValue(index, value) {
      this.selected[index] = value;

      this.optionsEl
        .querySelectorAll('button[data-option-index="' + index + '"]')
        .forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.value === value));
        });

      this.setMessage('');
      this.updateState();
    }

    /** The variant matching every selected value, or null if incomplete. */
    getSelectedVariant() {
      if (this.product.hasOnlyDefaultVariant) return this.product.variants[0];
      if (this.selected.some((value) => value === null)) return null;

      return (
        this.product.variants.find((variant) =>
          variant.options.every((value, i) => value === this.selected[i])
        ) || null
      );
    }

    /** Sync price, button label and disabled state with the selection. */
    updateState() {
      const variant = this.getSelectedVariant();
      const { labelDefault, labelUnavailable } = this.submitBtn.dataset;

      if (variant) this.ui.price.textContent = variant.price;

      const soldOut = Boolean(variant && !variant.available);
      this.submitBtn.disabled = soldOut;
      this.submitLabel.textContent = soldOut ? labelUnavailable : labelDefault;
    }

    /**
     * True when the variant contains a value from EVERY trigger group,
     * e.g. ["black"] and ["medium", "m"].
     */
    matchesUpsellRule(variant) {
      if (!this.config.upsellVariantId || !this.triggerGroups.length) return false;
      if (this.product.id === this.config.upsellProductId) return false;

      const values = variant.options.map(normalize);
      return this.triggerGroups.every((group) => group.some((alias) => values.includes(alias)));
    }

    /* ------------------------------------------------------------------ */
    /* Cart                                                                */
    /* ------------------------------------------------------------------ */

    async addToCart() {
      const variant = this.getSelectedVariant();

      if (!variant) {
        const missing = this.product.options
          .filter((_, i) => this.selected[i] === null)
          .map((option) => option.name.toLowerCase());
        this.setMessage('Please choose your ' + missing.join(' and ') + '.', 'error');
        return;
      }
      if (!variant.available) return;

      const items = [{ id: variant.id, quantity: 1 }];
      const withUpsell = this.matchesUpsellRule(variant);
      if (withUpsell) items.push({ id: this.config.upsellVariantId, quantity: 1 });

      // Also ask for the theme's cart icon so the header count refreshes.
      const sectionIds = this.getCartSectionIds();

      this.submitBtn.classList.add('is-loading');
      this.submitBtn.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch(this.config.cartAddUrl + '.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items, sections: sectionIds }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.description || data.message || 'Could not add to cart.');
        }

        this.refreshCartSections(data.sections);
        this.setMessage(
          withUpsell ? 'Added to cart (bonus item included).' : 'Added to cart!',
          'success'
        );
        document.dispatchEvent(new CustomEvent('gift-guide:added', { detail: { items } }));
      } catch (error) {
        this.setMessage(error.message, 'error');
      } finally {
        this.submitBtn.classList.remove('is-loading');
        this.submitBtn.removeAttribute('aria-busy');
      }
    }

    /** Section ids of the theme's cart icon (Dawn uses "cart-icon-bubble"). */
    getCartSectionIds() {
      return document.getElementById('cart-icon-bubble') ? ['cart-icon-bubble'] : [];
    }

    /** Replace the cart icon markup with the fresh HTML from the response. */
    refreshCartSections(sections) {
      if (!sections) return;
      const bubble = document.getElementById('cart-icon-bubble');
      const html = sections['cart-icon-bubble'];
      if (!bubble || !html) return;

      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const fresh = parsed.querySelector('.shopify-section');
      if (fresh) bubble.innerHTML = fresh.innerHTML;
    }

    setMessage(text, type = '') {
      this.messageEl.textContent = text;
      this.messageEl.classList.toggle('is-error', type === 'error');
      this.messageEl.classList.toggle('is-success', type === 'success');
    }
  }

  /* -------------------------------------------------------------------- */
  /* Bootstrapping (+ theme editor support)                               */
  /* -------------------------------------------------------------------- */

  const init = (scope = document) => {
    scope.querySelectorAll('[data-gg-grid]').forEach((root) => {
      if (root.giftGuide) return; // already initialised
      root.giftGuide = new GiftGuideGrid(root);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  // Re-initialise when a section is (re)rendered in the theme editor.
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
