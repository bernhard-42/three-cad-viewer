/**
 * Tests for the i18n seam: Display.t(), DisplayOptions.labels and the
 * one-time static template localization.
 */

import { describe, test, expect, afterEach, vi } from "vitest";
import {
  setupDisplay,
  cleanupContainer,
} from "../helpers/setup.js";
import { ViewerState } from "../../src/core/viewer-state.js";
import { KeyMapper } from "../../src/utils/utils.js";
import { logger } from "../../src/utils/logger.js";

describe("Display.t", () => {
  let container;
  let display;

  afterEach(() => {
    cleanupContainer(container);
    container = null;
    display = null;
  });

  test("falls back to the English key when no label exists", () => {
    ({ display, container } = setupDisplay());
    expect(display.t("Show axes")).toBe("Show axes");
    expect(display.t("not a key")).toBe("not a key");
    expect(display.labels).toEqual({});
  });

  test("translates known keys and replaces placeholders", () => {
    ({ display, container } = setupDisplay({
      labels: {
        "Show axes": "Achsen anzeigen",
        "copied: {0}": "kopiert: {0}",
        "point {0} of {1}": "Punkt {0} von {1}",
      },
    }));

    expect(display.t("Show axes")).toBe("Achsen anzeigen");
    expect(display.t("copied: {0}", "1, 2, 3")).toBe("kopiert: 1, 2, 3");
    expect(display.t("point {0} of {1}", 2, 5)).toBe("Punkt 2 von 5");
    // Missing placeholder args stay untouched
    expect(display.t("point {0} of {1}", 2)).toBe("Punkt 2 von {1}");
    // Unknown translations with placeholders still substitute
    expect(display.t("unknown {0}", "x")).toBe("unknown x");
  });

  test("instances keep independent label tables", () => {
    const first = setupDisplay({ labels: { Help: "Hilfe" } });
    const second = setupDisplay({ labels: { Help: "Aide" } });

    expect(first.display.t("Help")).toBe("Hilfe");
    expect(second.display.t("Help")).toBe("Aide");

    cleanupContainer(first.container);
    cleanupContainer(second.container);
  });
});

describe("Display static template localization", () => {
  let container;
  let display;

  afterEach(() => {
    cleanupContainer(container);
    container = null;
    display = null;
    KeyMapper.setActionShortcuts({});
  });

  test("translates button tooltips built from t()", () => {
    ({ display, container } = setupDisplay({
      labels: {
        "Show axes": "Achsen anzeigen",
        Help: "Hilfe",
        "Reset view": "Ansicht zurücksetzen",
      },
    }));

    expect(
      display.clickButtons["axes"].html.getAttribute("data-base-tooltip"),
    ).toBe("Achsen anzeigen");
    expect(display.clickButtons["axes"].html.getAttribute("data-tooltip")).toBe(
      "Achsen anzeigen",
    );
    expect(display.buttons["help"].html.getAttribute("data-tooltip")).toBe(
      "Hilfe",
    );
    expect(display.buttons["reset"].html.getAttribute("data-tooltip")).toBe(
      "Ansicht zurücksetzen",
    );
  });

  test("translates tab labels and tab tooltips", () => {
    ({ display, container } = setupDisplay({
      labels: {
        Tree: "Baum",
        Clip: "Schnitt",
        Zebra: "Zebra",
        Material: "Material",
        Studio: "Studio",
        "Navigation Tree": "Navigationsbaum",
        "Collpase tree": "Baum zuklappen",
      },
    }));

    expect(display.tabTree.value).toBe("Baum");
    expect(display.tabClip.value).toBe("Schnitt");

    KeyMapper.setActionShortcuts({ tree: "t", clip: "c" });
    display.updateTooltips();
    expect(
      display.tabTree.parentElement.getAttribute("data-tooltip"),
    ).toContain("Navigationsbaum");
    expect(
      display.getElement("tcv_toggles_tree")
        .querySelector(".tcv_collapse_all")
        .closest(".tcv_tooltip")
        .getAttribute("data-tooltip"),
    ).toBe("Baum zuklappen");
  });

  test("translates static attribute tooltips and help text", () => {
    ({ display, container } = setupDisplay({
      labels: {
        "Play animation": "Animation abspielen",
        "Show clipping planes": "Schnittflächen anzeigen",
        "Mouse Navigation": "Mausnavigation",
        Rotate: "Drehen",
        "<ctrl> + <left mouse button>": "<Strg> + <linke Maustaste>",
        "<shift> + <left mouse button>": "<Umschalt> + <linke Maustaste>",
      },
    }));

    const play = container.querySelector(
      ".tcv_cad_animation .tcv_play",
    ).parentElement;
    expect(play.getAttribute("data-tooltip")).toBe("Animation abspielen");

    const planes = container.querySelector(
      ".tcv_clip_plane_helpers",
    ).parentElement;
    expect(planes.getAttribute("data-tooltip")).toBe(
      "Schnittflächen anzeigen",
    );

    const help = display.cadHelp.textContent;
    expect(help).toContain("Mausnavigation");
    expect(help).toContain("Drehen");
    expect(help).toContain("<Umschalt> + <linke Maustaste>");
  });

  test("translates optgroup labels, option text and titles", () => {
    ({ display, container } = setupDisplay({
      labels: {
        Studio: "Atelier",
        Outdoor: "Draußen",
        "Soft Light": "Weiches Licht",
        "Tone Mapping": "Tonzuordnung",
        "Poly Haven: studio_small_08.hdr (soft light, neutral, backlight)":
          "Poly Haven: studio_small_08.hdr (weich, neutral, Gegenlicht)",
      },
    }));

    const optgroups = container.querySelectorAll(
      ".tcv_studio_environment optgroup",
    );
    expect(optgroups[0].getAttribute("label")).toBe("Atelier");
    expect(optgroups[1].getAttribute("label")).toBe("Draußen");

    const softLight = container.querySelector(
      '.tcv_studio_environment option[value="studio_small_08"]',
    );
    expect(softLight.textContent).toBe("Weiches Licht");
    expect(softLight.getAttribute("title")).toBe(
      "Poly Haven: studio_small_08.hdr (weich, neutral, Gegenlicht)",
    );

    const toneMappingLabel = container.querySelector(
      ".tcv_studio_tone_mapping",
    ).closest(".tcv_studio_row").querySelector(".tcv_label");
    expect(toneMappingLabel.textContent).toBe("Tonzuordnung");
  });

  test("translates the filter dropdown; non-tab input values stay untouched", () => {
    ({ display, container } = setupDisplay({
      labels: {
        All: "Alle",
        Vertex: "Ecke",
        Edge: "Kante",
        Face: "Fläche",
        Solid: "Körper",
        C: "X",
      },
    }));

    // Filter state is derived from the clicked option element, so the
    // rendered labels are free to be translated.
    expect(container.querySelector(".tvc_filter_none").textContent).toBe(
      "Alle",
    );
    expect(container.querySelector(".tvc_filter_vertex").textContent).toBe(
      "Ecke",
    );
    expect(container.querySelector(".tcv_filter_value").textContent).toBe(
      "Alle",
    );

    // Only input.tcv_tab values are localized.
    expect(display.getElement("tcv_collapse_all").value).toBe("C");
    expect(display.getElement("tcv_expand").value).toBe("E");
  });

  test("updateHelp keeps working on translated help text", () => {
    ({ display, container } = setupDisplay({
      labels: {
        "<shift> + <left mouse button>": "<shift> + 鼠标左键",
        "Rotate up / down": "向上 / 向下旋转",
      },
    }));

    expect(display.cadHelp.textContent).toContain("<shift> + 鼠标左键");

    // Remap the "ctrl" modifier from ShiftLeft to ControlLeft: updateHelp()
    // rewrites the <shift> token inside the translated text.
    display.updateHelp(
      {
        shift: "ctrlKey",
        ctrl: "shiftKey",
        meta: "altKey",
        alt: "metaKey",
      },
      { ctrl: "ctrlKey" },
    );

    const help = display.cadHelp.textContent;
    expect(help).toContain("<ctrl> + 鼠标左键");
    expect(help).toContain("向上 / 向下旋转");
  });

  test("material editor labels and groups go through t()", () => {
    ({ display, container } = setupDisplay({
      labels: {
        "PBR Core": "PBR-Kern",
        Metallic: "Metallisch",
        Roughness: "Rauheit",
      },
    }));

    // Build the rows against a throwaway material (rendering is not needed).
    display._matEditorInputAbort = new AbortController();
    const content = document.createElement("div");
    const material = {
      metalness: 0.3,
      roughness: 0.65,
      clearcoat: 0,
      clearcoatRoughness: 0,
      transmission: 0,
      ior: 1.5,
      thickness: 0,
      attenuationDistance: 100,
      sheen: 0,
      sheenRoughness: 0,
      specularIntensity: 1,
      anisotropy: 0,
      anisotropyRotation: 0,
      emissiveIntensity: 1,
    };
    display._buildMatEditorContent(content, material, material);

    const section = content.querySelector(".tcv_mat_editor_section");
    expect(section.textContent).toBe("PBR-Kern");
    const labels = [...content.querySelectorAll(".tcv_mat_editor_label")].map(
      (el) => el.textContent,
    );
    expect(labels[0]).toBe("Metallisch");
    expect(labels[1]).toBe("Rauheit");
  });
});

describe("ViewerState ignores Display-only labels option", () => {
  test("does not warn about labels and does not store it", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const state = new ViewerState({
        labels: { "Show axes": "Achsen anzeigen" },
        cadWidth: 321,
      });
      expect(state.get("cadWidth")).toBe(321);
      expect(warn).not.toHaveBeenCalled();
      expect(state.get("labels")).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("updateTooltips keeps translated base tooltips", () => {
  let container;
  let display;

  afterEach(() => {
    cleanupContainer(container);
    container = null;
    display = null;
    KeyMapper.setActionShortcuts({});
  });

  test("shortcut suffix is appended to the translated tooltip", () => {
    ({ display, container } = setupDisplay({
      labels: { "Show axes": "Achsen anzeigen" },
    }));

    KeyMapper.setActionShortcuts({ axes: "a" });
    display.updateTooltips();

    expect(
      display.clickButtons["axes"].html.getAttribute("data-tooltip"),
    ).toBe("Achsen anzeigen › a");
  });
});
