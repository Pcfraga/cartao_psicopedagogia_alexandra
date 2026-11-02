import test from "node:test";
import assert from "node:assert/strict";
import { defaults, parseProjectFile, parseValues, contactUrl, validateSlug, pageUrl } from "../src/model.ts";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLjtAAAAABJRU5ErkJggg==";

test("imports version 1 projects created by the original editor", () => {
  const project = parseProjectFile({ app: "alexandra-content-studio", version: 1, values: defaults, photo });
  assert.deepEqual(project.values, defaults);
  assert.equal(project.photo, photo);
});
test("rejects malformed, oversized or non-PNG imports", () => {
  assert.throws(() => parseProjectFile({ app: "different" }));
  assert.throws(() => parseProjectFile({ app: "alexandra-content-studio", version: 1, values: defaults, photo: "data:image/svg+xml,test" }));
  assert.throws(() => parseValues({ ...defaults, primary: "</style>" }));
  assert.throws(() => parseValues({ ...defaults, title: "x".repeat(101) }));
  assert.throws(() => parseValues({ ...defaults, role: null }));
});
test("normalizes Brazilian numbers and preserves international numbers", () => {
  assert.equal(contactUrl("(51) 98134-3844"), "https://wa.me/5551981343844");
  assert.equal(contactUrl("+55 51 98134-3844"), "https://wa.me/5551981343844");
});
test("uses a clean public slug and an external public origin", () => {
  assert.equal(pageUrl("apoio-escolar", "https://example.com"), "https://example.com/projetos/apoio-escolar");
  for (const slug of ["../private", "A", "two words", "a".repeat(61)]) assert.throws(() => validateSlug(slug));
});
