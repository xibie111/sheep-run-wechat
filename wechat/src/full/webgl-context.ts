import { fillMissing } from "../host-capabilities";

/** Use real WebGL1 extensions when a host wrapper defeats Phaser's instanceof check. */
export function prepareWebGLContext(gl: WebGLRenderingContext): string[] {
  const context = gl as unknown as Record<string, any>, changes: string[] = [];
  const groups = [
    ["OES_vertex_array_object", { createVertexArray: "createVertexArrayOES", bindVertexArray: "bindVertexArrayOES", deleteVertexArray: "deleteVertexArrayOES", isVertexArray: "isVertexArrayOES" }],
    ["ANGLE_instanced_arrays", { vertexAttribDivisor: "vertexAttribDivisorANGLE", drawArraysInstanced: "drawArraysInstancedANGLE", drawElementsInstanced: "drawElementsInstancedANGLE" }],
  ] as const;
  for (const [name, methods] of groups) {
    if (Object.keys(methods).every(key => typeof context[key] === "function")) continue;
    const extension = gl.getExtension(name) as Record<string, any> | null;
    if (!extension) throw Error(`Required WebGL capability unavailable: ${name}`);
    for (const [key, nativeName] of Object.entries(methods)) {
      if (typeof context[key] === "function") continue;
      if (context[key] != null || typeof extension[nativeName] !== "function") throw Error(`Required WebGL method unavailable: ${key} (${name})`);
      fillMissing(context, key, extension[nativeName].bind(extension), changes, `webgl.${key} via ${name}`);
    }
  }
  return changes;
}
