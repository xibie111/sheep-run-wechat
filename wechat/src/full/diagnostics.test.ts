import { describe, expect, it } from "vitest";
import { runtimeErrorMessage } from "./diagnostics";

describe("native runtime errors", () => {
  it("preserves stacks from another realm's structured error", () => {
    expect(runtimeErrorMessage({ message: "orientation failed", stack: "orientation failed\n at resize" })).toBe("orientation failed\n at resize");
  });
  it("reports native message and errMsg payloads", () => {
    expect(runtimeErrorMessage({ message: "native failure" })).toBe("native failure");
    expect(runtimeErrorMessage({ errMsg: "setDeviceOrientation:fail" })).toBe("setDeviceOrientation:fail");
  });
  it("retains ordinary Error and string diagnostics", () => {
    const error = Error("engine failure");
    expect(runtimeErrorMessage(error)).toBe(error.stack);
    expect(runtimeErrorMessage("load failed")).toBe("load failed");
  });
});
