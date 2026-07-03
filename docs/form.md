# Forms

`@fstage/form` adds validation, error display, and submit lifecycle to component forms. It does not own field values. Values live in component `state` and are kept in sync with `bind`.

Use it when a component needs a normal HTML `<form>` with declarative validation and predictable submit handling.

---

## Component usage

`form` is the shorthand for one form named `form`:

```js
export default {
  tag: 'login-form',

  state: {
    email:    '',
    password: '',
  },

  bind: {
    '[name="email"]':    'email',
    '[name="password"]': 'password',
  },

  form: {
    fields: {
      email:    { required: true, type: 'email' },
      password: { required: true, minLength: 8 },
    },

    onSubmit(values, form, ctx) {
      return ctx.models.auth.signIn(values).catch(function(err) {
        form.setError('email', err.message || 'Sign in failed');
      });
    },
  },

  render({ html, state }) {
    return html`
      <form name="form">
        <input name="email" .value=${state.email}>
        <input name="password" type="password" .value=${state.password}>
        <button type="submit">Sign in</button>
      </form>
    `;
  },
};
```

For multiple forms, use `forms`:

```js
forms: {
  profile:  { fields: { name: { required: true } }, onSubmit(values) { ... } },
  password: { fields: { password: { minLength: 8 } }, onSubmit(values) { ... } },
}
```

Each key maps to `<form name="profile">`, `<form name="password">`, and so on.

---

## Field rules

| Rule | Purpose |
|------|---------|
| `required` | Value must be non-empty. |
| `minLength` / `maxLength` | String length limits. |
| `type` | Built-in format check: `email`, `url`, `number`, or `date`. |
| `oneOf` | Value must be in the allowed list. |
| `min` / `max` | Numeric or ISO date range. |
| `validate(value, values)` | Custom synchronous rule. Return an error string or `null`. |
| `validateAsync(value, values)` | Custom async rule. Return an error string or `null`. |
| `enabled(values)` | Return `false` to skip validation and exclude the field from submit values. |
| `default` | Value used by `form.reset()`. Defaults to `''`. |
| `validateOn` | `blur` or `change`; overrides the form-level setting. |

Custom messages can be supplied with rule-specific keys such as `requiredMessage`, `typeMessage`, `minLengthMessage`, and `maxMessage`.

---

## Form options

```js
form: {
  validateOn: 'blur', // default; or 'change'
  debounce:   300,    // async validation debounce in ms

  fields: { ... },

  validate(values) {
    return values.start > values.end ? { end: 'End must be after start' } : null;
  },

  onSubmit(values, form, ctx) { ... },
  onError(errors, form, ctx)  { ... },
}
```

`onSubmit` runs only after sync and async validation pass. Submit buttons are disabled while `onSubmit` is pending. `onError` runs when submit validation fails.

---

## Controller API

The component runtime exposes the controller as `ctx.form` for the singular `form` shorthand, and as `ctx.forms[name]` for every declared form.

| API | Description |
|-----|-------------|
| `form.submit()` | Programmatically submit. Returns a promise. |
| `form.reset()` | Reset fields to defaults and clear errors. |
| `form.setValues(values)` | Write declared field values to component state. |
| `form.setError(field, message)` | Display a server-side or custom field error. |
| `form.clearError(field)` | Clear one field error. |
| `form.values` | Current enabled field values. |
| `form.errors` | Current error map. |
| `form.submitting` | `true` while submit is pending. |
| `form.isDirty` | `true` when any field differs from its default. |
| `form.isValid` | `true` when no errors are currently present. |

---

## DOM contract

- The form element must be named: `<form name="form">` for `form`, or `<form name="{key}">` for `forms`.
- Fields are matched by `name` and should have matching `state` and `bind` entries.
- `novalidate` is added automatically.
- Errors are inserted as `<div class="form-error">` after the field.
- Invalid fields receive `field-invalid`.

The full component-level contract is in the [Component Definition Standard](../specs/component-standard.md#11-declarative-form--forms-capability-form).
