/**
 * UI localization.
 *
 * Every UI string lives in a language file under `src/locales/` (one file per
 * language, `en.json` is the English source). The files use a subset of the
 * i18next JSON v4 format:
 *
 * - nested objects; a message is addressed by its dotted path (`toolbar.axes`)
 * - named placeholders: `"Solid: {{faces}} faces"`
 * - plural forms as key suffixes chosen by `Intl.PluralRules`
 *   (`items_one`, `items_few`, `items_other`, optional `items_zero`), selected
 *   by the `count` parameter
 *
 * A message missing in a language falls back to English.
 */

import en from "../locales/en.json";
import de from "../locales/de.json";
import zhCN from "../locales/zh-CN.json";
import { logger } from "../utils/logger.js";

type PluralSuffix = "zero" | "one" | "two" | "few" | "many" | "other";

/** Dotted paths of all strings in a nested message object. */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A plural form `x_one` / `x_other` is addressed as `x`. */
type StripPlural<K extends string> = K extends `${infer B}_${PluralSuffix}`
  ? B
  : K;

/** Identifier of a UI string: its dotted path in `en.json`. */
export type MessageId = StripPlural<Paths<typeof en>>;

/** Placeholder values; `count` also selects the plural form. */
export type MessageParams = Record<string, string | number>;

/** Translate a message. */
export type Translate = (id: MessageId, params?: MessageParams) => string;

interface NestedMessages {
  [key: string]: string | NestedMessages;
}

/** The language files shipped with the viewer, by BCP 47 tag. */
const LOCALES: Record<string, NestedMessages> = {
  en,
  de,
  "zh-CN": zhCN,
};

/** Locales the viewer ships translations for. */
export const AVAILABLE_LOCALES: readonly string[] = Object.keys(LOCALES);

function flatten(
  messages: NestedMessages,
  prefix: string,
  out: Map<string, string>,
): Map<string, string> {
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === "string") {
      out.set(prefix + key, value);
    } else {
      flatten(value, `${prefix}${key}.`, out);
    }
  }
  return out;
}

/**
 * Pick the shipped locale for a requested one: an exact match (case
 * insensitive), else the first locale with the same language
 * (`zh-TW` → `zh-CN`, `de-AT` → `de`), else English.
 */
export function resolveLocale(
  requested: string,
  available: readonly string[] = AVAILABLE_LOCALES,
): string {
  const wanted = requested.toLowerCase();
  const language = wanted.split("-")[0];
  const exact = available.find((l) => l.toLowerCase() === wanted);
  if (exact !== undefined) return exact;
  const sameLanguage = available.find(
    (l) => l.toLowerCase().split("-")[0] === language,
  );
  return sameLanguage ?? "en";
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

function interpolate(text: string, params: MessageParams): string {
  return text.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match,
  );
}

/**
 * The messages of one locale, with English as fallback.
 */
export class I18n {
  /** The shipped locale in use (see {@link resolveLocale}). */
  readonly locale: string;
  private readonly table: Map<string, string>;
  private readonly english: Map<string, string>;
  private readonly plural: Intl.PluralRules;
  private readonly englishPlural: Intl.PluralRules;

  /**
   * @param locale - BCP 47 language tag, e.g. "de" or "zh-CN" (default "en").
   * @param labels - Overrides for single messages: message id → text.
   * @param locales - The language files by locale (tests only).
   */
  constructor(
    locale: string = "en",
    labels: Record<string, string> = {},
    locales: Record<string, NestedMessages> = LOCALES,
  ) {
    this.locale = resolveLocale(locale, Object.keys(locales));
    this.english = flatten(locales["en"], "", new Map());
    this.table = flatten(locales[this.locale], "", new Map());
    for (const [key, value] of Object.entries(labels)) {
      if (!this.english.has(key)) {
        logger.warn(`Unknown label "${key}" - ignored`);
        continue;
      }
      this.table.set(key, value);
    }
    this.plural = new Intl.PluralRules(this.locale);
    this.englishPlural = new Intl.PluralRules("en");
  }

  /**
   * Translate a message.
   * @param id - The message id, e.g. "toolbar.axes".
   * @param params - Placeholder values; a numeric `count` selects the plural form.
   * @returns The message in the current locale, else in English, else the id.
   */
  t: Translate = (id, params = {}) => {
    const text = this.lookup(id, params["count"]);
    return interpolate(text, params);
  };

  private lookup(id: string, count: string | number | undefined): string {
    if (typeof count === "number") {
      const zero = count === 0 ? this.table.get(`${id}_zero`) : undefined;
      const form =
        zero ??
        this.table.get(`${id}_${this.plural.select(count)}`) ??
        this.table.get(`${id}_other`) ??
        this.english.get(`${id}_${this.englishPlural.select(count)}`) ??
        this.english.get(`${id}_other`);
      if (form !== undefined) return form;
    }
    return this.table.get(id) ?? this.english.get(id) ?? id;
  }
}
