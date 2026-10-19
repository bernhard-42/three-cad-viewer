import { describe, test, expect, afterEach, beforeEach } from "vitest";
import { setupDisplay, cleanupContainer } from "../helpers/setup.js";
import { DistancePanel } from "../../src/tools/cad_tools/ui.js";

let display;
let panel;
let container;

beforeEach(() => {
  ({ display, container } = setupDisplay({
    labels: {
      distance: "距离",
      "point 1": "点 1",
      "point 2": "点 2",
      angle: "角度",
      "reference 1": "参考 1",
      "reference 2": "参考 2",
      line: "线",
      "(min)": "(最小)",
    },
  }));
  panel = new DistancePanel(display);
});

afterEach(() => {
  cleanupContainer();
});

describe("DistancePanel i18n", () => {
  test("mesh-style rows translate point rows", () => {
    panel.createTable({
      meshBased: true,
      result: [
        { distance: 8.007, info: "min", "⇒ X | Y | Z": [1, 2, 3] },
        { "point 1": [1, 2, 3], "point 2": [4, 5, 6] },
        { angle: 69.145, "reference 1": "line", "reference 2": "line" },
      ],
    });
    const ths = [...panel.html.querySelectorAll("th")].map((th) => th.textContent);
    expect(ths).toContain("点 1");
    expect(ths).toContain("点 2");
    expect(ths).toContain("角度");
    expect(ths).toContain("参考 1");
    expect(ths).toContain("参考 2");
  });

  test("formatKey spellings all normalize to translated labels", () => {
    panel.createTable({
      meshBased: true,
      result: [
        { point1: [1, 2, 3], "point 1": [4, 5, 6], "point  1": [7, 8, 9] },
      ],
    });
    const ths = [...panel.html.querySelectorAll("th")].map((th) => th.textContent);
    for (const th of ths) expect(th).toBe("点 1");
  });

  test("brep-style flat keys translate", () => {
    panel.createTable({
      meshBased: false,
      result: [
        { Distance: 8.007, info: "min" },
        { "Point 1": [1, 2, 3], "Point 2": [4, 5, 6] },
      ],
    });
    const ths = [...panel.html.querySelectorAll("th")].map((th) => th.textContent);
    expect(ths).toContain("点 1");
    expect(ths).toContain("点 2");
  });
});
