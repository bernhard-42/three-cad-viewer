/**
 * The shape filter as viewer state: the setter, the getter, and a notification for
 * every change, whether it comes from the API, the dropdown or the filter keys.
 */
import { describe, test, expect, afterEach } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

/** Viewer with the boxes example rendered; returns its notifications as well. */
async function setup() {
  const notifications = [];
  testContext = setupViewer({
    notifyCallback: (changes) => notifications.push(changes),
  });
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
  notifications.length = 0;
  return { viewer, notifications };
}

const menu = (viewer) => viewer.display.shapeFilterDropDownMenu;
const label = (viewer) => viewer.display.filterDropdown.value.innerText;
/** The reported new values of the filter. The first report of a key has `old: null`. */
const filterChanges = (notifications) =>
  notifications
    .filter((n) => "shape_filter" in n)
    .map((n) => n.shape_filter.new);

describe("shape filter", () => {
  test("is 'none' after a model is shown", async () => {
    const { viewer } = await setup();
    expect(viewer.getShapeFilter()).toBe("none");
    expect(menu(viewer).currentFilter).toEqual([null]);
  });

  test("the setter updates the dropdown and the picker's filter like a key press", async () => {
    const { viewer } = await setup();
    viewer.setShapeFilter("edge");
    expect(viewer.getShapeFilter()).toBe("edge");
    expect(menu(viewer).currentFilter).toEqual(["edge"]);
    expect(label(viewer)).toBe("Edge");
  });

  test("a change notifies once; setting the same value does not", async () => {
    const { viewer, notifications } = await setup();
    viewer.setShapeFilter("face");
    viewer.setShapeFilter("face");
    expect(filterChanges(notifications)).toEqual(["face"]);
  });

  test("notify=false changes the filter without a notification", async () => {
    const { viewer, notifications } = await setup();
    viewer.setShapeFilter("solid", false);
    expect(viewer.getShapeFilter()).toBe("solid");
    expect(filterChanges(notifications)).toEqual([]);
  });

  test("a filter key sets the state and notifies", async () => {
    const { viewer, notifications } = await setup();
    menu(viewer).show(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    expect(viewer.getShapeFilter()).toBe("vertex");
    expect(menu(viewer).currentFilter).toEqual(["vertex"]);
    expect(filterChanges(notifications)).toEqual(["vertex"]);
  });

  test("a click on a dropdown option sets the state and notifies", async () => {
    const { viewer, notifications } = await setup();
    menu(viewer).show(true);
    viewer.display.filterDropdown.options.edge.click();
    expect(viewer.getShapeFilter()).toBe("edge");
    expect(filterChanges(notifications)).toEqual(["edge"]);
  });

  test("an unknown filter throws and changes nothing", async () => {
    const { viewer, notifications } = await setup();
    expect(() => viewer.setShapeFilter("edges")).toThrow();
    expect(viewer.getShapeFilter()).toBe("none");
    expect(filterChanges(notifications)).toEqual([]);
  });

  test("a new model resets the filter to 'none' and reports it", async () => {
    const { viewer, notifications } = await setup();
    viewer.setShapeFilter("edge");
    notifications.length = 0;
    const { renderOptions, viewerOptions } = testContext;
    viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
    expect(viewer.getShapeFilter()).toBe("none");
    expect(menu(viewer).currentFilter).toEqual([null]);
    expect(filterChanges(notifications)).toEqual(["none"]);
  });
});
