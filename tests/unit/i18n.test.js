/**
 * Tests for UI localization: the I18n lookup, the language files and the
 * localized Display.
 */

import { describe, test, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { I18n, resolveLocale, AVAILABLE_LOCALES } from "../../src/ui/i18n.js";
import { Info } from "../../src/ui/info.js";
import { KeyMapper } from "../../src/utils/utils.js";
import { logger } from "../../src/utils/logger.js";
import { setupDisplay, cleanupContainer } from "../helpers/setup.js";

// vitest runs in the project root
const srcDir = join(process.cwd(), "src");
const localesDir = join(srcDir, "locales");
const readJson = (name) =>
  JSON.parse(readFileSync(join(localesDir, name), "utf8"));

function flatten(messages, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === "string") {
      out.set(prefix + key, value);
    } else {
      flatten(value, `${prefix}${key}.`, out);
    }
  }
  return out;
}

const placeholders = (text) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const english = flatten(readJson("en.json"));
const localeFiles = readdirSync(localesDir).filter((f) => f.endsWith(".json"));

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

describe("I18n lookup", () => {
  test("English is the default", () => {
    const { t, locale } = new I18n();
    expect(locale).toBe("en");
    expect(t("toolbar.axes")).toBe("Show axes");
  });

  test("translates with a shipped locale", () => {
    expect(new I18n("de").t("toolbar.axes")).toBe("Achsen anzeigen");
    expect(new I18n("zh-CN").t("toolbar.axes")).toBe("显示坐标轴");
  });

  test("fills in named placeholders, in the order of the translation", () => {
    const tables = {
      en: { a: "{{x}} before {{y}}" },
      xx: { a: "{{y}} vor {{x}}" },
    };
    expect(new I18n("xx", {}, tables).t("a", { x: 1, y: "two" })).toBe(
      "two vor 1",
    );
  });

  test("keeps placeholders without a value", () => {
    const t = new I18n("en", {}, { en: { a: "{{x}} and {{y}}" } }).t;
    expect(t("a", { x: "X" })).toBe("X and {{y}}");
  });

  test("falls back to English, then to the id", () => {
    const tables = {
      en: { a: "English a", b: "English b" },
      xx: { a: "xx a" },
    };
    const t = new I18n("xx", {}, tables).t;
    expect(t("a")).toBe("xx a");
    expect(t("b")).toBe("English b");
    expect(t("missing.id")).toBe("missing.id");
  });

  test("never reads inherited object properties", () => {
    const t = new I18n().t;
    expect(t("constructor")).toBe("constructor");
    expect(t("toString")).toBe("toString");
    const t2 = new I18n("en", {}, { en: { a: "{{constructor}}" } }).t;
    expect(t2("a", {})).toBe("{{constructor}}");
  });

  test("labels override single messages, unknown ids are ignored", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const t = new I18n("de", {
        "toolbar.axes": "Koordinatenachsen",
        "no.such.id": "x",
      }).t;
      expect(t("toolbar.axes")).toBe("Koordinatenachsen");
      expect(t("toolbar.grid")).toBe("Raster anzeigen");
      expect(t("no.such.id")).toBe("no.such.id");
      expect(warn).toHaveBeenCalledWith('Unknown label "no.such.id" - ignored');
    } finally {
      warn.mockRestore();
    }
  });
});

describe("I18n plurals", () => {
  const tables = {
    en: { faces_one: "{{count}} face", faces_other: "{{count}} faces" },
    ru: {
      faces_one: "{{count}} грань",
      faces_few: "{{count}} грани",
      faces_many: "{{count}} граней",
      faces_other: "{{count}} грани",
    },
    de: {
      faces_zero: "keine Flächen",
      faces_one: "{{count}} Fläche",
      faces_other: "{{count}} Flächen",
    },
    fr: { faces_other: "{{count}} faces" },
  };

  test("English one / other", () => {
    const t = new I18n("en", {}, tables).t;
    expect(t("faces", { count: 1 })).toBe("1 face");
    expect(t("faces", { count: 0 })).toBe("0 faces");
    expect(t("faces", { count: 5 })).toBe("5 faces");
  });

  test("CLDR categories of the locale (Russian one / few / many)", () => {
    const t = new I18n("ru", {}, tables).t;
    expect(t("faces", { count: 1 })).toBe("1 грань");
    expect(t("faces", { count: 3 })).toBe("3 грани");
    expect(t("faces", { count: 5 })).toBe("5 граней");
    expect(t("faces", { count: 21 })).toBe("21 грань");
  });

  test("optional zero form", () => {
    const t = new I18n("de", {}, tables).t;
    expect(t("faces", { count: 0 })).toBe("keine Flächen");
    expect(t("faces", { count: 1 })).toBe("1 Fläche");
  });

  test("a missing category falls back to the locale's other form", () => {
    const t = new I18n("fr", {}, tables).t;
    expect(t("faces", { count: 1 })).toBe("1 faces");
  });
});

describe("resolveLocale", () => {
  test("exact match, case insensitive", () => {
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("zh-cn")).toBe("zh-CN");
    expect(resolveLocale("ZH-CN")).toBe("zh-CN");
  });

  test("same language", () => {
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("zh-TW")).toBe("zh-CN");
  });

  test("unknown languages fall back to English", () => {
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });

  test("ships the language files of src/locales", () => {
    expect([...AVAILABLE_LOCALES].sort()).toEqual(
      localeFiles.map((f) => f.replace(/\.json$/, "")).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Language files
// ---------------------------------------------------------------------------

describe("language files", () => {
  const ids = (table) => [...table.keys()];

  test.each(localeFiles.filter((f) => f !== "en.json"))(
    "%s has no message unknown to en.json",
    (file) => {
      const table = flatten(readJson(file));
      expect(ids(table).filter((id) => !english.has(id))).toEqual([]);
    },
  );

  test.each(localeFiles.filter((f) => f !== "en.json"))(
    "%s translates every message",
    (file) => {
      const table = flatten(readJson(file));
      expect([...english.keys()].filter((id) => !table.has(id))).toEqual([]);
    },
  );

  test.each(localeFiles.filter((f) => f !== "en.json"))(
    "%s uses the placeholders of en.json",
    (file) => {
      const table = flatten(readJson(file));
      const wrong = ids(table).filter(
        (id) =>
          english.has(id) &&
          placeholders(table.get(id)).join() !==
            placeholders(english.get(id)).join(),
      );
      expect(wrong).toEqual([]);
    },
  );

  test("every message of en.json is used in the source", () => {
    const sources = readdirSync(srcDir, { recursive: true })
      .filter((f) => /\.(ts|html)$/.test(f))
      .map((f) => readFileSync(join(srcDir, f), "utf8"))
      .join("\n");
    const unused = [...english.keys()]
      .map((id) => id.replace(/_(zero|one|two|few|many|other)$/, ""))
      // modifier key names are looked up as `help.key.${name}`
      .filter((id) => !id.startsWith("help.key."))
      .filter(
        (id) => !sources.includes(`"${id}"`) && !sources.includes(`=${id}"`),
      );
    expect(unused).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

describe("template", () => {
  const template = readFileSync(join(srcDir, "ui", "index.html"), "utf8");

  test("every message id exists in en.json", () => {
    const used = [
      ...template.matchAll(
        /data-i18n(?:-(?:tooltip|title|value|label))?="([^"]+)"/g,
      ),
    ].map((m) => m[1]);
    const args = [...template.matchAll(/data-i18n-args="([^"]+)"/g)].flatMap(
      (m) => m[1].split(";").map((arg) => arg.split("=")[1]),
    );
    expect(used.length).toBeGreaterThan(100);
    expect([...used, ...args].filter((id) => !english.has(id))).toEqual([]);
  });

  test("has no untranslated text left", () => {
    const doc = new DOMParser().parseFromString(template, "text/html");
    const texts = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      const text = n.textContent.trim();
      if (text !== "") texts.push(text);
    }
    // product names, symbols and placeholders replaced at runtime
    const allowed =
      /^(PBR Neutral|ACES Filmic|⊢⊣|▾|0|N\d = \(n\/a, n\/a, n\/a\))$/;
    expect(texts.filter((text) => !allowed.test(text))).toEqual([]);
    for (const attr of ["title", "data-tooltip", "label"]) {
      expect(
        doc.querySelectorAll(`[${attr}]:not(optgroup[data-custom])`).length,
      ).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Localized Display
// ---------------------------------------------------------------------------

describe("localized Display", () => {
  let container;
  const savedKeys = KeyMapper.get_config();

  afterEach(() => {
    cleanupContainer(container);
    container = null;
    KeyMapper.set(savedKeys);
    KeyMapper.setActionShortcuts({});
  });

  test("English by default", () => {
    let display;
    ({ display, container } = setupDisplay());
    expect(display.tabTree.value).toBe("Tree");
    expect(display.clickButtons["axes"].html.getAttribute("data-tooltip")).toBe(
      "Show axes",
    );
    expect(container.querySelector(".tcv_tools_label").textContent).toBe(
      "Tools",
    );
  });

  test("template, toolbar and tabs in German", () => {
    let display;
    ({ display, container } = setupDisplay({ locale: "de" }));
    expect(display.tabTree.value).toBe("Baum");
    expect(display.clickButtons["axes"].html.getAttribute("data-tooltip")).toBe(
      "Achsen anzeigen",
    );
    const collapse = container.querySelector(".tcv_collapse_all");
    expect(collapse.value).toBe("Z");
    expect(collapse.parentElement.getAttribute("data-tooltip")).toBe(
      "Baum zuklappen",
    );
    const env = container.querySelector(".tcv_studio_environment");
    expect(env.querySelector("optgroup").label).toBe("Studio");
    expect(
      env.querySelector('option[value="studio_small_08"]').textContent,
    ).toBe("Weiches Licht");
    expect(
      container.querySelector('.tcv_studio_background option[value="grey"]')
        .textContent,
    ).toBe("Grau");
  });

  test("shortcut suffix is appended to translated tooltips", () => {
    let display;
    ({ display, container } = setupDisplay({ locale: "de" }));
    KeyMapper.setActionShortcuts({ axes: "a", tree: "t" });
    display.updateTooltips();
    expect(display.clickButtons["axes"].html.getAttribute("data-tooltip")).toBe(
      "Achsen anzeigen › a",
    );
    expect(display.tabTree.parentElement.getAttribute("data-tooltip")).toBe(
      "Navigationsbaum › t",
    );
  });

  test("help names the current modifier keys, translated, and follows remapping", () => {
    let display;
    ({ display, container } = setupDisplay({ locale: "de" }));
    const help = () => display.cadHelp.textContent;
    // default mapping: logical ctrl is the physical shift key
    KeyMapper.set({
      shift: "ctrlKey",
      ctrl: "shiftKey",
      meta: "altKey",
      alt: "metaKey",
    });
    display.updateHelp();
    expect(help()).toContain("<Umschalt> + <linke Maustaste>");
    expect(help()).toContain("Schaltfläche 'Z'");

    KeyMapper.set({ ctrl: "ctrlKey" });
    display.updateHelp();
    expect(help()).toContain("<Strg> + <linke Maustaste>");
  });

  test("the filter keeps working with translated labels", () => {
    let display;
    ({ display, container } = setupDisplay({ locale: "de" }));
    const filter = display.shapeFilterDropDownMenu;
    expect(display.filterDropdown.value.textContent).toBe("Alle");
    filter.show(true);
    try {
      display.filterDropdown.options.edge.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      expect(display.filterDropdown.value.innerText).toBe("Kante");
      expect(filter.currentFilter).toEqual(["edge"]);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
      expect(display.filterDropdown.value.innerText).toBe("Fläche");
      expect(filter.currentFilter).toEqual(["face"]);
      filter.reset();
      expect(display.filterDropdown.value.innerText).toBe("Alle");
      expect(filter.currentFilter).toEqual([null]);
    } finally {
      filter.show(false);
    }
  });

  test("labels override single strings", () => {
    let display;
    ({ display, container } = setupDisplay({
      locale: "de",
      labels: { "toolbar.axes": "Koordinatenachsen" },
    }));
    expect(display.clickButtons["axes"].html.getAttribute("data-tooltip")).toBe(
      "Koordinatenachsen",
    );
  });
});

describe("localized Info", () => {
  test("translations are escaped like the model data", () => {
    const html = document.createElement("div");
    const t = new I18n("en", { "info.path": "<b>P</b>:" }).t;
    const info = new Info(html, t);
    info.readyMsg("1.0", "orbit");
    info.bbInfo("/a", "a", {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
      getCenter: (v) => v.set(0.5, 0.5, 0.5),
    });
    expect(html.textContent).toContain("<b>P</b>:");
    expect(html.querySelectorAll("td b b").length).toBe(0);
  });

  test("German", () => {
    const html = document.createElement("div");
    new Info(html, new I18n("de").t).readyMsg("1.0", "orbit");
    expect(html.textContent).toContain("Bereit");
    expect(html.textContent).toContain("Steuerung");
  });
});
