# `@fstage/ui` — UI Primitives

Five reusable, unstyled, accessible UI components. All use CSS custom properties for theming with sensible fallbacks — no stylesheet is required beyond the custom properties your app already defines.

Components auto-register with the component runtime when loaded through `fstage.load()`. Load them individually or all at once:

```js
// Individual — only loads what you use
loadAssets: {
  app: [
    '@fstage/ui/bottom-sheet.mjs',
    '@fstage/ui/action-sheet.mjs',
  ]
}

// All at once
loadAssets: {
  app: [ '@fstage/ui' ]
}
```

---

## Components

| Tag | Style | API |
|-----|-------|-----|
| `fs-bottom-sheet` | State-driven | Props + event |
| `fs-action-sheet` | Imperative | `.open(opts)` / `.close()` |
| `fs-dialog` | State-driven | Props + event |
| `fs-disclosure` | State-driven | Props + event |
| `fs-listbox` | State-driven | Props + event |

---

## `fs-bottom-sheet`

A swipe-dismissable modal bottom sheet. Slot your content directly inside the element; the component handles the backdrop, drag handle, close button, scroll lock, and focus trap.

**Loading:**

```js
'@fstage/ui/bottom-sheet.mjs'
```

**Usage:**

```html
<fs-bottom-sheet .open=${sheetOpen} .title=${'New Task'}>
  <!-- slotted content -->
  <form>...</form>
</fs-bottom-sheet>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `Boolean` | `false` | Show or hide the sheet. |
| `title` | `String` | `''` | Text shown in the sheet header. |

**Events:**

| Event | When | Detail |
|-------|------|--------|
| `bottomSheetClosed` | User swipes down, taps backdrop, or taps close button. | — |

The host component is responsible for setting `open` to `false` in response:

```js
interactions: {
  'bottomSheetClosed': (e, { state }) => state.$set('sheetOpen', false),
}
```

**CSS custom properties:**

| Property | Default | Description |
|----------|---------|-------------|
| `--fs-safe-area-bottom` | `0px` | Bottom safe area inset. Map from `env(safe-area-inset-bottom)` in your app styles. |
| `--fs-keyboard-height` | `0px` | Height of the on-screen keyboard. Updated live by `@fstage/env`. |

**Accessibility:** Sets `role="dialog"`, `aria-modal="true"`, and `aria-label` from the `title` prop. Focus is trapped inside the open sheet and restored on close. Escape key closes the sheet.

---

## `fs-action-sheet`

An iOS-style imperative action sheet. The element renders nothing in the DOM — all markup is injected via an internal modal manager when `.open()` is called. Typically placed once near the root of your component tree and shared.

**Loading:**

```js
'@fstage/ui/action-sheet.mjs'
```

**Usage:**

```html
<!-- Placed once in the layout, or created on demand -->
<fs-action-sheet></fs-action-sheet>
```

```js
// Open programmatically
var sheet = document.querySelector('fs-action-sheet');

var dismiss = sheet.open({
  title:       'Task options',
  cancelLabel: 'Cancel',          // optional, default: 'Cancel'
  actions: [
    { id: 'edit',   label: 'Edit Task',  icon: 'edit'  },
    { id: 'delete', label: 'Delete',     icon: 'delete', danger: true },
  ],
  onAction: function(action, event) {
    if (action.id === 'edit')   editTask();
    if (action.id === 'delete') deleteTask();
  },
  onClose: function() {
    // sheet was dismissed for any reason
  },
});

// Close programmatically (also returned from .open())
sheet.close();
dismiss();
```

**`open(opts)` options:**

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Optional header text. |
| `actions` | `Action[]` | Array of action objects (see below). |
| `cancelLabel` | `string` | Label for the cancel button. Default: `'Cancel'`. |
| `onAction` | `(action, event) => void` | Called when an action button is tapped. |
| `onClose` | `() => void` | Called when the sheet is dismissed for any reason. |

**Returns** a `dismiss` function that closes the sheet programmatically.

**Action object shape:**

```js
{
  id:     string,           // identifier passed to onAction
  label:  string,           // button text (required)
  href?:  string,           // if set, treated as a data-href navigation link
  icon?:  string,           // optional icon (see below)
  danger?: boolean,         // true renders the button in danger colour
}
```

**Icon values:** `'check'` | `'toggle'` | `'open'` | `'bell'` | `'edit'` | `'delete'` | `'trash'`

Icon rendering uses CSS `mask-image` with SVG data-URL tokens. The following CSS custom properties must be defined in your app for icons to appear:

```css
--icon-check, --icon-bell, --icon-edit, --icon-trash
```

These are provided automatically if you use the `tasks` template design system.

**CSS custom properties:**

| Property | Default | Description |
|----------|---------|-------------|
| `--fs-sheet-offset-bottom` | `8px` | Distance from the viewport bottom. Set to `calc(var(--tab-height) + var(--safe-bottom) + 8px)` in apps with a tab bar. |

**Accessibility:** Sets `role="dialog"`, `aria-modal="true"`, `aria-label` from the title. Focus is trapped inside the open sheet, Escape closes it, and focus is restored on close.

---

## `fs-dialog`

A centered modal dialog. State-driven — set `open` to show or hide. Slot your content inside.

**Loading:**

```js
'@fstage/ui/dialog.mjs'
```

**Usage:**

```html
<fs-dialog .open=${dialogOpen} .title=${'Confirm action'}>
  <p>Are you sure you want to delete this item?</p>
  <button @click=${confirm}>Delete</button>
</fs-dialog>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `Boolean` | `false` | Show or hide the dialog. |
| `title` | `String` | `''` | Text shown in the dialog header. |

**Events:**

| Event | When | Detail |
|-------|------|--------|
| `dialogClosed` | User taps backdrop, taps close button, or presses Escape. | — |

```js
interactions: {
  'dialogClosed': (e, { state }) => state.$set('dialogOpen', false),
}
```

**CSS custom properties:**

| Property | Default | Description |
|----------|---------|-------------|
| `--fs-dialog-width` | `480px` | Max-width of the dialog panel. |
| `--fs-dialog-padding` | `24px` | Inner body padding. |

**Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-label` from title. Focus trapped, Escape closes, focus restored on close. The panel uses CSS transitions for enter/exit (respects `prefers-reduced-motion`).

---

## `fs-disclosure`

A controlled show/hide disclosure widget with smooth height animation. Follows the ARIA Disclosure pattern.

**Loading:**

```js
'@fstage/ui/disclosure.mjs'
```

**Usage:**

```html
<fs-disclosure .open=${sectionOpen}>
  <span slot="summary">Section title</span>
  <p>This content is revealed when open.</p>
</fs-disclosure>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `Boolean` | `false` | Whether the content is revealed. |

**Events:**

| Event | When | Detail |
|-------|------|--------|
| `disclosureToggled` | Trigger button clicked. | `{ open: boolean }` — the requested next state. |

The host component controls open/close state in response:

```js
interactions: {
  'disclosureToggled': (e, { state }) => state.$set('sectionOpen', e.detail.open),
}
```

**Slots:**

| Slot | Description |
|------|-------------|
| `summary` | Content for the trigger button — text, icons, etc. |
| *(default)* | Content to show/hide. |

**Accessibility:** `aria-expanded` on the trigger button, `role="region"` with `aria-labelledby` on the content panel.

**Animation:** Uses the CSS `grid-template-rows: 0fr → 1fr` trick for smooth height animation without JavaScript measurement. Respects `prefers-reduced-motion`.

---

## `fs-listbox`

An accessible listbox with full keyboard navigation and typeahead. Implements the ARIA Listbox pattern. Supports single and multi-select.

**Loading:**

```js
'@fstage/ui/listbox.mjs'
```

**Usage (single select):**

```html
<fs-listbox
  .options=${[
    { value: 'low',    label: 'Low'    },
    { value: 'medium', label: 'Medium' },
    { value: 'high',   label: 'High', danger: true },
  ]}
  .value=${priority}
  @change=${e => state.$set('priority', e.detail.value)}>
</fs-listbox>
```

**Usage (multi select):**

```html
<fs-listbox
  multiple
  .options=${options}
  .value=${selectedValues}
  @change=${e => state.$set('selected', e.detail.value)}>
</fs-listbox>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `Option[]` | `[]` | Array of option objects (see below). |
| `value` | `string \| string[]` | `''` | Selected value(s). Multi: array or comma-separated string. |
| `multiple` | `Boolean` | `false` | Enable multi-select. |

**Option object shape:**

```js
{
  value:     string,     // unique identifier
  label:     string,     // display text
  disabled?: boolean,    // prevents selection when true
}
```

**Events:**

| Event | When | Detail |
|-------|------|--------|
| `change` | An option is selected (or toggled in multi mode). | `{ value: string }` (single) or `{ value: string[] }` (multi) |

**Keyboard navigation:**

| Key | Action |
|-----|--------|
| `ArrowDown` / `ArrowUp` | Move focus. In single mode, also selects. |
| `Home` / `End` | Jump to first / last enabled option. |
| `Enter` / `Space` | Select focused option. In multi mode, toggles. |
| Printable chars | Typeahead — jumps to the first option whose label starts with the accumulated string (resets after 600ms). |

**Accessibility:** `role="listbox"`, `aria-multiselectable`, `aria-activedescendant`, `role="option"`, and `aria-selected` on each option. Keyboard focus is managed entirely inside the component.

---

## Styling contract

All components:
- Use CSS custom properties with explicit fallbacks — they work without any custom properties defined.
- Apply `prefers-reduced-motion: reduce` — all transitions and animations are suppressed when the user has requested reduced motion.
- Expose no global class names — styling is scoped to shadow DOM (or the component's own subtree for `shadow: false` components).
- Do not depend on any specific icon set — icon rendering uses CSS `mask-image` against CSS custom properties you define.

The `tasks` template (`templates/tasks/css/style.css`) provides a complete set of design tokens including all icon variables and safe area mappings that these components reference.

---

## Theming quick reference

Minimum set of CSS custom properties to theme all five components:

```css
:root {
  /* Backgrounds */
  --bg-base:          #ffffff;
  --bg-secondary:     #f5f5f3;
  --bg-tertiary:      #ebebea;
  --bg-blur:          rgba(255,255,255,0.92);

  /* Text */
  --text-primary:     #1a1a18;
  --text-secondary:   #4a4a46;
  --text-tertiary:    #808078;
  --text-quaternary:  #b0b0a8;

  /* Accent */
  --color-primary:    #2d7a52;
  --color-danger:     #b83232;

  /* Structural */
  --separator:        rgba(0,0,0,0.07);
  --radius-sm:        6px;
  --radius-lg:        18px;
  --radius-xl:        24px;

  /* Safe areas (updated by @fstage/env) */
  --fs-safe-area-bottom:    env(safe-area-inset-bottom, 0px);
  --fs-keyboard-height:     0px;
  --fs-sheet-offset-bottom: 8px;

  /* Icon mask-images (SVG data URLs — required for action sheet icons) */
  --icon-check:  url("data:image/svg+xml,...");
  --icon-bell:   url("data:image/svg+xml,...");
  --icon-edit:   url("data:image/svg+xml,...");
  --icon-trash:  url("data:image/svg+xml,...");
  --icon-close:  url("data:image/svg+xml,...");
}
```

See `templates/tasks/css/style.css` for the full icon definitions.
