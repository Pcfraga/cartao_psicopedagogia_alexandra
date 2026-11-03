import test from "node:test";
import assert from "node:assert/strict";
import { defaults, element, landingBlock, parseValues, parseProjectFile } from "../src/model.ts";
import { createTemplate } from "../src/canvas.ts";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLjtAAAAABJRU5ErkJggg==";

test("all templates are valid at exact post and story dimensions", () => {
  for (const format of ["square", "story"]) for (const style of ["editorial", "bold", "minimal"]) {
    const values = { ...defaults, format };
    const design = createTemplate(values, style);
    assert.deepEqual(parseValues({ ...values, design }).design, design);
    for (const layer of design.elements) {
      assert.ok(layer.x >= 0 && layer.x + layer.width <= 1080);
      assert.ok(layer.y >= 0 && layer.y + layer.height <= (format === "story" ? 1920 : 1080));
    }
  }
});
test("JSON files preserve multiple photo, shape and text layers plus responsive blocks", () => {
  const values = { ...defaults, design: { version: 1, height: 1080, background: "#ffffff", elements: [
    element("image", { src: photo }), element("text", { text: "Acolher\nAprender", rotation: 30 }), element("shape", { shape: "ellipse", opacity: .5 })
  ] }, landing: { version: 1, blocks: [landingBlock("hero"), landingBlock("services"), landingBlock("gallery"), landingBlock("contact")] } };
  const file = { app: "alexandra-content-studio", version: 2, values, photo };
  assert.deepEqual(parseProjectFile(JSON.parse(JSON.stringify(file))), file);
});
test("rejects malformed or oversized layers and unsafe photo sources", () => {
  const layer = element("text");
  const parse = elements => parseValues({ ...defaults, design: { version: 1, height: 1080, background: "#ffffff", elements } });
  for (const patch of [{ width: 0 }, { opacity: NaN }, { rotation: Infinity }, { fontSize: 241 },
    { src: "https://example.com/image.png" }, { src: "data:image/svg+xml,<svg/>" },
    { fontFamily: "url(evil)" }, { color: "red" }, { text: "x".repeat(2001) }, { locked: "false" }]) {
    assert.throws(() => parse([{ ...layer, ...patch }]));
  }
  assert.throws(() => parse([layer, layer]));
  assert.throws(() => parse(Array.from({ length: 41 }, () => element("text"))));
  assert.equal(parse(Array.from({ length: 40 }, () => element("text"))).design.elements.length, 40);
});
test("responsive pages validate block limits and reject invalid content", () => {
  const parse = blocks => parseValues({ ...defaults, landing: { version: 1, blocks } });
  const block = landingBlock("services");
  assert.throws(() => parse([]));
  assert.throws(() => parse([block, block]));
  assert.throws(() => parse([{ ...block, items: Array(13).fill("service") }]));
  assert.throws(() => parse([{ ...block, body: "x".repeat(3001) }]));
  assert.throws(() => parse([{ ...block, background: "url(evil)" }]));
  assert.equal(parse(Array.from({ length: 16 }, () => landingBlock("text"))).landing.blocks.length, 16);
  assert.throws(() => parse(Array.from({ length: 17 }, () => landingBlock("text"))));
});
