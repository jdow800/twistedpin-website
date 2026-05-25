/**
 * Menu item detail modal — single-item prototype (2026-05-24).
 *
 * Wires click handlers onto `[data-expandable]` menu cards. On click,
 * reads item data from data-* attributes, populates the modal, and opens
 * it via the native HTML <dialog> element's showModal() — which gives us
 * ESC-to-close + focus trap + backdrop for free, no library needed.
 *
 * Currently scoped to one Garlic Parmesan Flatbread card on /menu/food
 * as a UX prototype (Clarity dead-click data 2026-05-22 → 2026-05-24
 * showed users actively trying to click food items expecting detail).
 * If the prototype lands, the same pattern applies to every food +
 * cocktail card (taps deferred — beer detail isn't the conversion lever).
 *
 * Pricing is INTENTIONALLY omitted from the modal — preserves the
 * captive-audience-pricing positioning (per 2026-05-05 decision log).
 */

interface MenuItemData {
  name: string;
  description: string;
  image: string;
  tags: string[];
}

const DIETARY_TAG_LABELS: Record<string, string> = {
  'vegan': 'Vegan',
  'vegetarian': 'Vegetarian',
  'gf': 'Gluten-Free',
  'gluten free': 'Gluten-Free',
  'gluten-free': 'Gluten-Free',
  'halal': 'Halal',
  'kosher': 'Kosher',
  'low fat': 'Low Fat',
  'low cal': 'Low Cal',
};

/** Format a raw GoTab tag for display. Strips internal-only prefixes
 *  ("go:") and maps known dietary keys to canonical labels. Returns
 *  null for tags we deliberately don't surface in the modal (e.g.,
 *  "staff favorite" already shown as a badge on the card itself). */
function formatTag(raw: string): string | null {
  const stripped = raw.replace(/^go:/, '').toLowerCase().trim();
  if (stripped === 'staff favorite') return null;
  return DIETARY_TAG_LABELS[stripped] ?? null;
}

function readItemData(card: HTMLElement): MenuItemData {
  return {
    name: card.dataset.itemName ?? '',
    description: card.dataset.itemDescription ?? '',
    image: card.dataset.itemImage ?? '',
    tags: (card.dataset.itemTags ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}

export function initMenuItemModal(): void {
  const dialog = document.getElementById('menu-item-dialog') as HTMLDialogElement | null;
  // Native <dialog> not supported (very old browsers) — bail silently.
  // The click handler just won't be wired; users see the existing
  // dead-click behavior. No regression.
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const nameEl = dialog.querySelector('.menu-dialog-name') as HTMLElement | null;
  const descEl = dialog.querySelector('.menu-dialog-description') as HTMLElement | null;
  const imgEl = dialog.querySelector('.menu-dialog-image') as HTMLImageElement | null;
  const imgWrap = dialog.querySelector('.menu-dialog-image-wrap') as HTMLElement | null;
  const tagsEl = dialog.querySelector('.menu-dialog-tags') as HTMLElement | null;
  const closeBtn = dialog.querySelector('.menu-dialog-close') as HTMLButtonElement | null;

  if (!nameEl || !descEl || !imgEl || !imgWrap || !tagsEl || !closeBtn) return;

  const cards = document.querySelectorAll<HTMLElement>('[data-expandable]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const data = readItemData(card);

      nameEl.textContent = data.name;
      descEl.textContent = data.description;

      if (data.image) {
        imgEl.src = data.image;
        imgEl.alt = data.name;
        imgWrap.style.display = '';
      } else {
        imgEl.removeAttribute('src');
        imgWrap.style.display = 'none';
      }

      tagsEl.replaceChildren();
      data.tags.forEach(rawTag => {
        const label = formatTag(rawTag);
        if (!label) return;
        const span = document.createElement('span');
        span.className = 'menu-dialog-tag';
        span.textContent = label;
        tagsEl.appendChild(span);
      });

      dialog.showModal();
    });
  });

  closeBtn.addEventListener('click', () => dialog.close());

  // Click on backdrop (outside the dialog content box) closes. The
  // backdrop is rendered behind the dialog box itself, so any click
  // outside the visible bounds is on the backdrop. We detect by
  // checking whether the click target IS the dialog element (which it
  // is for backdrop clicks since they bubble from the pseudo-element).
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}
