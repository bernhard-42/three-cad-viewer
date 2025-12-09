/**
 * Helvetiker font subset - only X, Y, Z glyphs for axis labels.
 * Full font: https://github.com/mrdoob/three.js/blob/dev/examples/fonts/helvetiker_regular.typeface.json
 */

interface Glyph {
  x_min: number;
  x_max: number;
  ha: number;
  o: string;
}

export interface FontData {
  glyphs: Record<string, Glyph>;
  cssFontWeight?: string;
  ascender: number;
  underlinePosition: number;
  cssFontStyle?: string;
  boundingBox: { yMin: number; xMin: number; yMax: number; xMax: number };
  resolution: number;
  descender: number;
  familyName: string;
  lineHeight?: number;
  underlineThickness: number;
  original_font_information: Record<string, string>;
}

export const helvetiker: FontData = {
  glyphs: {
    X: {
      x_min: -0.015625,
      x_max: 854.15625,
      ha: 940,
      o: "m 854 0 l 683 0 l 423 409 l 166 0 l 0 0 l 347 519 l 18 1013 l 186 1013 l 428 637 l 675 1013 l 836 1013 l 504 520 l 854 0 ",
    },
    Y: {
      x_min: 0,
      x_max: 820,
      ha: 886,
      o: "m 820 1013 l 482 416 l 482 0 l 342 0 l 342 416 l 0 1013 l 140 1013 l 411 534 l 679 1012 l 820 1013 ",
    },
    Z: {
      x_min: 0,
      x_max: 779,
      ha: 849,
      o: "m 779 0 l 0 0 l 0 113 l 621 896 l 40 896 l 40 1013 l 779 1013 l 778 887 l 171 124 l 779 124 l 779 0 ",
    },
  },
  cssFontWeight: "normal",
  ascender: 1189,
  underlinePosition: -100,
  cssFontStyle: "normal",
  boundingBox: { yMin: -334, xMin: -111, yMax: 1189, xMax: 1672 },
  resolution: 1000,
  descender: -334,
  familyName: "Helvetiker",
  lineHeight: 1522,
  underlineThickness: 50,
  original_font_information: {},
};
