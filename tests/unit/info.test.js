/**
 * Unit tests for the Info panel
 */

import { describe, test, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { Info } from "../../src/ui/info.js";
import { I18n } from "../../src/ui/i18n.js";

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
