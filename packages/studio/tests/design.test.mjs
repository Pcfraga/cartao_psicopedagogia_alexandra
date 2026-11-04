import test from "node:test";
import assert from "node:assert/strict";
import { defaults, element, shapes, landingBlock, parseValues, parseProjectFile, resizeElement } from "../src/model.ts";
import { createTemplate, renderDesign } from "../src/canvas.ts";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLjtAAAAABJRU5ErkJggg==";
const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";

test("all shapes and text effects survive project export/import without changing legacy layers", () => {
  const effects = { showText: true, textBackground: true, padding: 32, borderWidth: 5,
    borderColor: "#ff0000", shadowBlur: 20, shadowColor: "#123d75" };
  const elements = Object.keys(shapes).map(shape => element("shape", { shape, ...effects }));
  elements.push(element("text", effects), element("text"), element("shape"));
  const file = { app: "alexandra-content-studio", version: 2, photo,
    values: { ...defaults, design: { version: 1, height: 1080, background: "#ffffff", elements } } };
  assert.deepEqual(parseProjectFile(JSON.parse(JSON.stringify(file))), file);
  for (const patch of [{ showText: "true" }, { textBackground: null }, { padding: -1 }, { padding: 101 },
    { borderWidth: 41 }, { borderColor: "red" }, { shadowBlur: 81 }, { shadowColor: null }, { shape: "toString" }]) {
    assert.throws(() => parseValues({ ...defaults, design: { ...file.values.design, elements: [element("shape", patch)] } }));
  }
});

test("shape paths, padded text, backgrounds, borders and shadows reach the shared canvas renderer", async () => {
  for (const shape of Object.keys(shapes)) {
    const calls = [];
    const context = {
      save() {}, restore() {}, fillRect() {}, translate() {}, rotate() {}, beginPath() {}, clip() {},
      roundRect(...args) { calls.push(["rounded", ...args]); }, ellipse() { calls.push(["ellipse"]); },
      moveTo() { calls.push(["move"]); }, lineTo() {}, closePath() {},
      fill() { calls.push(["fill", this.shadowBlur]); }, stroke() { calls.push(["stroke", this.lineWidth]); },
      measureText(value) { return { width: value.length * 10 }; },
      fillText(value, x, y) { calls.push(["text", value, x, y]); }
    };
    const layer = element("shape", { shape, width: 400, height: 300, showText: true, text: "Hello",
      padding: 32, borderWidth: 5, shadowBlur: 20 });
    await renderDesign({ getContext: () => context }, {
      version: 1, height: 1080, background: "#ffffff", elements: [layer]
    }, photo, false);
    assert.ok(calls.some(c => c[0] === (shape === "rectangle" || shape === "speech" ? "rounded" : shape === "ellipse" ? "ellipse" : "move")));
    assert.ok(calls.some(c => c[0] === "fill" && c[1] === 20));
    assert.ok(calls.some(c => c[0] === "stroke" && c[1] === 10));
    const bodyHeight = shape === "speech" ? 240 : 300;
    assert.ok(calls.some(c => c[0] === "text" && c[1] === "Hello" && c[2] === 32 && c[3] === (bodyHeight - 64) / 2));
    calls.length = 0;
    await renderDesign({ getContext: () => context }, {
      version: 1, height: 1080, background: "#ffffff", elements: [element("shape", { shape })]
    }, photo, false);
    assert.ok(!calls.some(c => c[0] === "text" || c[0] === "stroke"));
    calls.length = 0;
    await renderDesign({ getContext: () => context }, {
      version: 1, height: 1080, background: "#ffffff", elements: [element("text", { textBackground: true, radius: 40 })]
    }, photo, false);
    assert.ok(calls.some(c => c[0] === "rounded" && c[5] === 40));
    assert.ok(calls.some(c => c[0] === "fill"));
  }
});

test("photo fitting survives JSON while legacy projects retain their crop", () => {
  for (const fit of ["contain", "cover", "stretch", undefined]) {
    const layer = element("image");
    if (fit === undefined) delete layer.fit;
    else layer.fit = fit;
    const values = { ...defaults, design: { version: 1, height: 1080, background: "#ffffff", elements: [layer] } };
    assert.deepEqual(parseValues(JSON.parse(JSON.stringify(values))), values);
  }
  assert.equal(element("image").fit, "stretch");
  assert.throws(() => parseValues({ ...defaults, design: {
    version: 1, height: 1080, background: "#ffffff", elements: [element("image", { fit: "invalid" })]
  } }));
});

test("photo rendering supports independent axes, proportional fitting and legacy cropping", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  globalThis.Image = class {
    naturalWidth = 400;
    naturalHeight = 200;
    set src(value) { queueMicrotask(() => this.onload()); }
  };
  try {
    const base = element("image", { width: 400, height: 200 });
    const frames = [[100, 300], [600, 100], [200, 100]];
    for (const handle of ["left", "right", "top", "bottom", "corner"]) {
      for (const delta of [-60, 60]) {
        const resized = resizeElement(base, handle, delta, delta);
        frames.push([resized.width, resized.height]);
      }
    }
    for (const fit of ["contain", "cover", "stretch", undefined]) {
      for (const [width, height] of frames) {
        let drawn;
        const context = {
          save() {}, restore() {}, fillRect() {}, translate() {}, rotate() {}, beginPath() {}, roundRect() {}, clip() {},
          drawImage(image, x, y, w, h) { drawn = { x, y, w, h }; }
        };
        const layer = element("image", { width, height, radius: 0 });
        if (fit === undefined) delete layer.fit;
        else layer.fit = fit;
        await renderDesign({ getContext: () => context }, {
          version: 1, height: 1080, background: "#ffffff", elements: [layer]
        }, "test-fitting-photo", false);
        if (fit === "stretch") {
          assert.deepEqual(drawn, { x: 0, y: 0, w: width, h: height });
        } else if (fit === "contain") {
          assert.equal(drawn.w / drawn.h, 2);
          assert.ok(drawn.w <= width + 1e-8 && drawn.h <= height + 1e-8);
          assert.ok(drawn.x >= -1e-8 && drawn.y >= -1e-8);
          assert.ok(Math.abs(drawn.w - width) < 1e-8 || Math.abs(drawn.h - height) < 1e-8);
        } else {
          assert.equal(drawn.w / drawn.h, 2);
          assert.ok(drawn.w >= width - 1e-8 && drawn.h >= height - 1e-8);
        }
      }
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else delete globalThis.Image;
  }
});

test("side handles independently resize every element type and anchor the opposite edge", () => {
  for (const type of ["image", "text", "shape"]) {
    const item = element(type, { x: 100, y: 200, width: 400, height: 300 });
    assert.deepEqual(resizeElement(item, "right", 80, 60), { x: 100, y: 200, width: 480, height: 300 });
    assert.deepEqual(resizeElement(item, "left", 80, 60), { x: 180, y: 200, width: 320, height: 300 });
    assert.deepEqual(resizeElement(item, "bottom", 80, 60), { x: 100, y: 200, width: 400, height: 360 });
    assert.deepEqual(resizeElement(item, "top", 80, 60), { x: 100, y: 260, width: 400, height: 240 });
    assert.deepEqual(resizeElement(item, "corner", 80, 60), { x: 100, y: 200, width: 480, height: 360 });
  }
});
test("rotated resize handles follow local axes and preserve the opposite edge", () => {
  const item = element("image", { width: 400, height: 300, rotation: 90 });
  const result = resizeElement(item, "right", 60, 80);
  assert.equal(result.width, 480);
  assert.equal(result.height, 300);
  assert.ok(Math.abs(result.x - (item.x - 40)) < 1e-8);
  assert.ok(Math.abs(result.y - (item.y + 40)) < 1e-8);
  const top = resizeElement(item, "top", -60, 80);
  assert.equal(top.width, 400);
  assert.equal(top.height, 240);
});
test("resize limits clamp dimensions without flipping or changing the unrelated dimension", () => {
  const item = element("image", { width: 400, height: 300 });
  assert.equal(resizeElement(item, "right", -1000, 0).width, 20);
  assert.equal(resizeElement(item, "left", -5000, 0).width, 2160);
  assert.equal(resizeElement(item, "bottom", 0, 5000).height, 3840);
  assert.equal(resizeElement(item, "top", 0, 5000).height, 20);
  assert.equal(resizeElement(item, "bottom", 5000, 0).width, 400);
});

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
test("compressed JPEG photos are accepted in design layers and landing blocks", () => {
  const values = { ...defaults, design: { version: 1, height: 1080, background: "#ffffff", elements: [
    element("image", { src: jpeg })
  ] }, landing: { version: 1, blocks: [landingBlock("hero"), { ...landingBlock("gallery"), image: jpeg }] } };
  assert.equal(parseValues(values).design.elements[0].src, jpeg);
  assert.equal(parseValues(values).landing.blocks[1].image, jpeg);
});
test("rejects malformed or oversized layers and unsafe photo sources", () => {
  const layer = element("text");
  const parse = elements => parseValues({ ...defaults, design: { version: 1, height: 1080, background: "#ffffff", elements } });
  for (const patch of [{ width: 0 }, { opacity: NaN }, { rotation: Infinity }, { fontSize: 241 },
    { src: "https://example.com/image.png" }, { src: "data:image/svg+xml,<svg/>" },
    { src: `data:image/jpeg;base64,${"A".repeat(900_000)}` },
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
