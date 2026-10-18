import { describe, expect, it, vi } from "vitest";
import { prepareWebGLContext } from "./webgl-context";

describe("native WebGL1 extension compatibility", () => {
  it("forwards missing VAO and instancing operations to actual extensions with their receiver", () => {
    const vao = { createVertexArrayOES: vi.fn(function (this: unknown) { expect(this).toBe(vao); return handle; }),
      bindVertexArrayOES: vi.fn(), deleteVertexArrayOES: vi.fn(), isVertexArrayOES: vi.fn(() => true) }, handle = {};
    const angle = { vertexAttribDivisorANGLE: vi.fn(function (this: unknown) { expect(this).toBe(angle); }), drawArraysInstancedANGLE: vi.fn(), drawElementsInstancedANGLE: vi.fn() };
    const gl = { getExtension: (name: string) => name === "OES_vertex_array_object" ? vao : angle } as unknown as WebGLRenderingContext & Record<string, any>;
    expect(prepareWebGLContext(gl)).toHaveLength(7);
    expect(gl.createVertexArray()).toBe(handle); gl.bindVertexArray(handle); expect(vao.bindVertexArrayOES).toHaveBeenCalledWith(handle);
    gl.vertexAttribDivisor(2, 1); gl.drawElementsInstanced(4, 6, 5123, 0, 3); expect(angle.drawElementsInstancedANGLE).toHaveBeenCalledWith(4, 6, 5123, 0, 3);
  });
  it("preserves available native operations without replacing or probing them", () => {
    const native = vi.fn(), extension = vi.fn();
    const gl = { createVertexArray: native, bindVertexArray: native, deleteVertexArray: native, isVertexArray: native,
      vertexAttribDivisor: native, drawArraysInstanced: native, drawElementsInstanced: native, getExtension: extension } as unknown as WebGLRenderingContext;
    expect(prepareWebGLContext(gl)).toEqual([]); expect(gl.bindVertexArray).toBe(native); expect(gl.vertexAttribDivisor).toBe(native); expect(extension).not.toHaveBeenCalled();
  });
  it("fails explicitly when the required real extension is unavailable", () => {
    const gl = { getExtension: () => null } as unknown as WebGLRenderingContext;
    expect(() => prepareWebGLContext(gl)).toThrow("Required WebGL capability unavailable: OES_vertex_array_object");
    expect((gl as any).bindVertexArray).toBeUndefined();
  });
});
