/**
 * Unit tests for the Info panel
 */

import { describe, test, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { Info } from "../../src/ui/info.js";
import { I18n } from "../../src/ui/i18n.js";

describe("Info - camera target", () => {
  test("a clicked point and a box center have their own messages", () => {
    const container = document.createElement("div");
    const info = new Info(container, new I18n().t);

    info.targetPointInfo([1, 2, 3]);
    expect(container.textContent).toContain(
      "Camera target set to the clicked point:",
    );
    expect(container.textContent).toContain("x: 1.00, y: 2.00, z: 3.00");

    info.clear();
    info.centerInfo([4, 5, 6]);
    expect(container.textContent).toContain(
      "Camera target set to AABB center:",
    );
    expect(container.textContent).toContain("x: 4.00, y: 5.00, z: 6.00");
  });
});

describe("Info - control settings", () => {
  /** The ready table as [label, value] rows. */
  function rows(container) {
    return [...container.querySelectorAll(".small_table tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()),
    );
  }

  test("the trackball lists rotate and zoom under Control", () => {
    const container = document.createElement("div");
    const info = new Info(container, new I18n().t);

    info.readyMsg("5.2.0", "trackball", {
      holroyd: true,
      cursorPivot: true,
      zoomToCursor: true,
    });
    expect(rows(container).slice(0, 5)).toEqual([
      ["Version", "5.2.0"],
      ["Control", "trackball"],
      ["- rotate", "around pivot"],
      ["- zoom", "to cursor"],
      ["Axes", expect.stringContaining("X")],
    ]);
  });

  test("without holroyd the trackball is a tumbler", () => {
    const container = document.createElement("div");
    const info = new Info(container, new I18n().t);

    info.readyMsg("5.2.0", "trackball", {
      holroyd: false,
      cursorPivot: false,
      zoomToCursor: false,
    });
    expect(rows(container).slice(1, 4)).toEqual([
      ["Control", "tumbler"],
      ["- rotate", "around target"],
      ["- zoom", "to center"],
    ]);
  });

  test("orbit ignores holroyd, and without settings only the control is listed", () => {
    const container = document.createElement("div");
    const info = new Info(container, new I18n().t);

    info.readyMsg("5.2.0", "orbit", {
      holroyd: false,
      cursorPivot: true,
      zoomToCursor: false,
    });
    expect(rows(container).slice(1, 4)).toEqual([
      ["Control", "orbit"],
      ["- rotate", "around pivot"],
      ["- zoom", "to center"],
    ]);

    info.readyMsg("5.2.0", "orbit");
    expect(rows(container)[2][0]).toBe("Axes");
  });

  test("a changed setting adds an entry of its own", () => {
    const container = document.createElement("div");
    const info = new Info(container, new I18n().t);
    info.readyMsg("5.2.0", "trackball");

    info.controlChangeInfo("rotate", false);
    info.controlChangeInfo("mode", false);
    info.controlChangeInfo("zoom", true);
    info.controlChangeInfo("mode", true);

    expect(container.textContent).toContain("rotation control: around target");
    expect(container.textContent).toContain("control: tumbler");
    expect(container.textContent).toContain("zoom control: to cursor");
    expect(container.textContent).toContain("control: trackball");
    expect(info.chunks.length).toBe(5);
  });

  test("German", () => {
    const container = document.createElement("div");
    const info = new Info(container, new I18n("de").t);
    info.controlChangeInfo("rotate", true);
    info.controlChangeInfo("mode", false);
    expect(container.textContent).toContain("Drehsteuerung: um Drehpunkt");
    expect(container.textContent).toContain("Steuerung: tumbler");
  });
});

describe("Info - bbInfo", () => {
  let container;
  let info;
  const bb = new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 2, 3),
  );

  beforeEach(() => {
    container = document.createElement("div");
    info = new Info(container, new I18n().t);
  });

  test("shows path and name literally", () => {
    const path = "/Root/a<b>&\"c\\d'";
    const name = "a<b>&\"c\\d'";
    info.bbInfo(path, name, bb);

    const cells = [...container.querySelectorAll("td")].map(
      (td) => td.textContent,
    );
    expect(cells).toContain(path);
    expect(cells).toContain(name);
    expect(container.querySelector("b b")).toBeNull();
  });

  test("markup in a name is not parsed", () => {
    const name = '<img src=x onerror="window.__infoXss=1">';
    info.bbInfo(`/Root/${name}`, name, bb);

    expect(container.querySelector("img")).toBeNull();
    expect(window.__infoXss).toBeUndefined();
  });

  test("shows the bounding box values", () => {
    info.bbInfo("/Root/Part", "Part", bb);

    const cells = [...container.querySelectorAll("td")].map(
      (td) => td.textContent,
    );
    expect(cells).toContain("3.000");
    expect(cells).toContain("1.500");
  });
});
