import { describe, it, expect } from "vitest";
import {
  exportToContinuousRollPDF,
  exportToMultiPageLandscapePDF,
} from "./pdfScrollExport";

describe("pdfScrollExport module", () => {
  it("exports continuous and multipage PDF functions", () => {
    expect(typeof exportToContinuousRollPDF).toBe("function");
    expect(typeof exportToMultiPageLandscapePDF).toBe("function");
  });
});
