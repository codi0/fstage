# UI — @fstage/ui

`@fstage/ui` provides reusable, accessible UI primitive components for Fstage apps. Zero-build. All primitives ship as standard component definitions — no compiled artefacts, no hard-coded style opinions.

---

## Available primitives

| Tag | Type | Description |
|---|---|---|
| `fs-action-sheet` | Imperative | iOS-style action sheet overlay |
| `fs-bottom-sheet` | Declarative | Swipe-dismissable modal bottom sheet |
| `fs-dialog` | Declarative | Centered modal dialog |
| `fs-disclosure` | Declarative | Controlled show/hide disclosure widget |
| `fs-listbox` | Declarative | Accessible listbox with keyboard navigation |

---

## Setup

`@fstage/ui` is a built-in fstage module. Individual primitives are loaded as sub-path imports; the `afterLoad` hook auto-registers them via the component runtime:

```js
// In loadAssets
'@fstage/ui/action-sheet.mjs',
'@fstage/ui/bottom-sheet.mjs',
```

Or import directly if registering manually:

```js
import { actionSheet, bottomSheet } from '@fstage/ui';

runtime.define(actionSheet);
runtime.define(bottomSheet);
```

---

## fs-action-sheet

An imperative, iOS-style action sheet. Renders nothing in the DOM — all markup is injected on `.open()` and torn down on dismiss.

```js
// Place once in your app template (e.g. inside the root component)
// <fs-action-sheet></fs-action-sheet>

const sheet = document.querySelector('fs-action-sheet');

const dismiss = sheet.open({
  title:       'Task options',
  cancelLabel: 'Cancel',       // optional, default: 'Cancel'
  actions: [
    { id: 'complete', label: 'Mark Complete', icon: 'check' },
    { id: 'edit',     label: 'Edit',          icon: 'edit',  href: '/tasks/123' },
    { id: 'delete',   label: 'Delete',        icon: 'trash', danger: true },
  ],
  onAction(action, event) {
    if (action.id === 'complete') { /* ... */ }
  },
  onClose() {
    // called on any dismiss path
  },
});

// Programmatic close
sheet.close();
// or call the returned dismiss function
dismiss();
```

### Action object

| Property | Type | Description |
|---|---|---|
| `id` | `string` | Identifier passed to `onAction` |
| `label` | `string` | Button text (required) |
| `href` | `string?` | If set, a `data-href` attribute is added and the sheet dismisses after routing |
| `icon` | `string?` | `check` \| `toggle` \| `open` \| `bell` \| `edit` \| `delete` \| `trash` |
| `danger` | `boolean?` | Renders the button in `--color-danger` |

### CSS custom properties

| Property | Default | Description |
|---|---|---|
| `--fs-sheet-offset-bottom` | `8px` | Distance from the viewport bottom. Override to clear a tab bar: `calc(var(--tab-height) + var(--safe-bottom) + 8px)` |
| `--icon-check` / `--icon-bell` / `--icon-edit` / `--icon-trash` | — | SVG `mask-image` data URLs for action icons. Provided by the host app's design tokens |

---

## fs-bottom-sheet

A swipe-dismissable modal bottom sheet. State-driven via the `open` and `title` props. Slot content is rendered inside the sheet body.

```html
<fs-bottom-sheet .open=${sheetOpen} .title=${'New Task'}>
  <!-- slotted content -->
</fs-bottom-sheet>
```

```js
// Open
ctx.state.$set('sheetOpen', true);

// Close — listen for the dismiss event the sheet emits
interactions: {
  'bottomSheetClosed': (e, { state }) => state.$set('sheetOpen', false),
}
```

The sheet emits a `bottomSheetClosed` CustomEvent when dismissed via swipe, backdrop tap, or the close button. The host component is responsible for setting `open` back to `false` in response.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | Shows or hides the sheet |
| `title` | `string` | `''` | Header title text |

### CSS custom properties

| Property | Default | Description |
|---|---|---|
| `--fs-safe-area-bottom` | `0px` | Bottom safe-area inset. Map from `env(safe-area-inset-bottom)` |
| `--fs-keyboard-height` | `0px` | On-screen keyboard height. Managed by the host app's env module |
| `--icon-close` | — | SVG `mask-image` data URL for the close button icon |

---

## fs-dialog

A centered modal dialog with backdrop. State-driven via the `open` prop.

```html
<fs-dialog .open=${dialogOpen} title="Confirm">
  <p>Are you sure you want to delete this item?</p>
  <button type="button">Cancel</button>
  <button type="button">Delete</button>
</fs-dialog>
```

```js
interactions: {
  'dialogClosed': (e, { state }) => state.$set('dialogOpen', false),
}
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | Shows or hides the dialog |
| `title` | `string` | `''` | Header title text |

### CSS custom properties

| Property | Default | Description |
|---|---|---|
| `--fs-dialog-width` | `480px` | Max-width of the dialog panel |
| `--fs-dialog-padding` | `24px` | Inner body padding |
| `--icon-close` | — | SVG mask-image data URL for the close button |

### Events

`dialogClosed` — fired on backdrop click, Escape, or close button tap.

---

## fs-disclosure

A controlled disclosure widget with smooth height animation. Follows the ARIA Disclosure pattern.

```html
<fs-disclosure .open=${sectionOpen}>
  <span slot="summary">Section title</span>
  <p>Expandable content here.</p>
</fs-disclosure>
```

```js
interactions: {
  'disclosureToggled': (e, { state }) => state.$set('sectionOpen', (e.detail || {}).open),
}
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | Controls expanded/collapsed state |

### Slots

| Slot | Description |
|---|---|
| `summary` | Content for the trigger button — text, icons, or inline elements |
| (default) | Content to show/hide |

### Events

`disclosureToggled` — `detail: { open: boolean }`. Fired when the trigger is clicked; the requested next state is in `detail.open`.

---

## fs-listbox

A fully accessible listbox with keyboard navigation and typeahead. Implements `role="listbox"` / `role="option"` ARIA pattern.

```html
<!-- Single select -->
<fs-listbox
  .options=${[{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }]}
  .value=${'a'}
  @change=${e => state.$set('selected', e.detail.value)}>
</fs-listbox>

<!-- Multi select -->
<fs-listbox
  multiple
  .options=${options}
  .value=${'a,b'}
  @change=${e => state.$set('selected', e.detail.value)}>
</fs-listbox>
```

### Option object

```js
{ value: string, label: string, disabled?: boolean }
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `options` | `Object[]` | `[]` | Array of option objects |
| `value` | `string` | `''` | Selected value; comma-separated for multi |
| `multiple` | `boolean` | `false` | Enable multi-select |

### Events

`change` — `detail: { value: string }` for single select; `detail: { value: string[] }` for multi.

### Keyboard

| Key | Single select | Multi select |
|---|---|---|
| `ArrowDown` / `ArrowUp` | Move focus and select | Move focus only |
| `Home` / `End` | Jump to first/last enabled | Jump to first/last enabled |
| `Enter` / `Space` | Select focused option | Toggle focused option |
| Printable chars | Typeahead jump | Typeahead jump |

---

## Theming

All primitives use CSS custom properties exclusively — no hard-coded colour values. The design tokens (`--bg-blur`, `--bg-secondary`, `--text-primary`, `--color-primary`, `--separator`, `--radius-xl`, `--motion-*`, `--easing-*`) are expected to be provided by the host app's stylesheet.

To use `@fstage/ui` in a new app without an existing design system, define at minimum:

```css
:root {
  --bg-secondary:   #f5f5f5;
  --bg-tertiary:    rgba(0,0,0,0.05);
  --bg-blur:        rgba(255,255,255,0.92);
  --text-primary:   #111;
  --text-secondary: #555;
  --text-tertiary:  #888;
  --color-primary:  #007aff;
  --color-danger:   #e53935;
  --separator:      rgba(0,0,0,0.08);
  --separator-heavy:rgba(0,0,0,0.14);
  --radius-xl:      24px;
  --motion-medium:  220ms;
  --motion-slow:    300ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --easing-emphasis: cubic-bezier(0.34, 1.2, 0.64, 1);
}
```
