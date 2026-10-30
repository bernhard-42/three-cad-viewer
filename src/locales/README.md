# Translating three-cad-viewer

All texts of the viewer's user interface live in this folder, one file per language:

| File         | Language             | Maintained by                                                                                                       |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `en.json`    | English (source)     | the three-cad-viewer maintainer                                                                                     |
| `de.json`    | German               | the three-cad-viewer maintainer                                                                                     |
| `zh-CN.json` | Chinese (simplified) | based on the language pack of [sh-u-x-in/vscode-ocp-cad-viewer](https://github.com/sh-u-x-in/vscode-ocp-cad-viewer) |

`en.json` is the source: it defines which messages exist and what they mean. Every other file translates the messages of `en.json` and must not add messages of its own.

Corrections and new languages are welcome as pull requests.

## File format

The files use a subset of the [i18next JSON v4](https://www.i18next.com/misc/json-format) format, which translation tools such as [Weblate](https://docs.weblate.org/en/latest/formats.html) support directly (use `en.json` as the monolingual base file).

A message is addressed by its path of keys, e.g. `toolbar.axes` or `studio.background.label`:

```json
{
  "toolbar": {
    "axes": "Show axes"
  },
  "studio": {
    "background": {
      "label": "Background",
      "tooltip": "Scene background style"
    }
  }
}
```

Translate only the values; keys and structure stay exactly as in `en.json`.

### Placeholders

`{{name}}` is replaced by a value at runtime:

```json
"solidCountsVolume": "Solid: {{faces}} faces, {{edges}} edges, vol ≈ {{volume}}"
```

- Keep every placeholder of the English message, spelled exactly the same.
- Move placeholders wherever your language needs them, and rephrase freely. For example, the German translation avoids the plural agreement of "faces" with the number: `"Körper – Flächen: {{faces}}, Kanten: {{edges}}, Vol. ≈ {{volume}}"`.

### Plural forms

Messages that depend on a count have one entry per plural category of the language, chosen with the browser's [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules) by the `{{count}}` placeholder:

```json
"items_one": "{{count}} item",
"items_other": "{{count}} items"
```

A Russian file would provide `items_one`, `items_few`, `items_many` and `items_other`; a Chinese file only needs `items_other`. An optional `_zero` entry is used for a count of 0. The [CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html) list the categories of each language.

### Not supported

Of the i18next format only the parts above are implemented: no nested references (`$t(...)`), no formatting functions, no context suffixes, no interval plurals. Different meanings of the same English word simply have different message ids (e.g. `tabs.studio.label` and `studio.environment.groupStudio`).

## Things to know

- **Texts are shown as plain text.** `<`, `>` and `&` appear literally, so `<left mouse button>` in the help is just text, and HTML has no effect.
- **Modifier keys in the help** are placeholders: `"<{{ctrl}}> + <left mouse button>"`. They are replaced by the key the user has configured, translated via `help.key.shift`, `help.key.ctrl`, `help.key.alt` and `help.key.meta` (e.g. German `Strg` for `ctrl`). Keep the placeholders, so the help stays correct when users remap their keys.
- **Button letters** (`tree.collapseAll.label` = `C`, …) may be translated. The help refers to them through `{{button}}`, so it follows automatically.
- **Filter keys** are fixed: the shape filter reacts to the keys `a`, `s`, `f`, `e` and `v` in every language. `help.measure.filter.input` should name exactly these keys.
- **Space is limited.** Labels in the Studio tab have about 110 pixels, roughly 16 Latin characters, before they reach their slider or dropdown. Abbreviate where needed (the German file uses e.g. `Umg.-Stärke`), and check the result in the demo page.
- **Missing translations** fall back to English, so a partial file works. The shipped files are expected to be complete, though; the tests list what is missing.

## Adding a language

1. Copy `en.json` to `<tag>.json`, where `<tag>` is the [BCP 47](https://www.rfc-editor.org/info/bcp47) language tag, e.g. `fr.json` or `pt-BR.json`. A plain language tag (`fr`) also serves its regional variants (`fr-CA`); add a regional file only where the variants differ.
2. Translate the values.
3. Register the file in `src/ui/i18n.ts`: import it and add it to `LOCALES`.
4. Check it (see below), and open a pull request.

## Checking a translation

Run the localization tests:

```bash
yarn test:run tests/unit/i18n.test.js
```

They report messages missing from your file, messages unknown to `en.json`, and placeholders that differ from the English message.

To see the translation in the viewer, start the demo page (`yarn run start`, see the main README) and choose your language in the **Locale** dropdown, or open `index.html?locale=<tag>`.

## When the English text changes

- If the meaning of a message changes, the maintainer gives it a new id, so outdated translations fall back to English instead of showing a wrong text. The tests then list the new id as missing in every language.
- If only the wording improves, the id stays, and translations may be updated at leisure.
