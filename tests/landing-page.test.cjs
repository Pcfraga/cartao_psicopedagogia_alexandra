const test = require("node:test");
const assert = require("node:assert/strict");
const { createLandingPage } = require("../landing-page.js");

const values = {
  name: "Alexandra",
  role: "Psicopedagoga",
  title: "Aprender também é uma forma de ser feliz!",
  subtitle: "Acompanhamento acolhedor",
  cta: "Fale comigo",
  phone: "(51) 98134-3844",
  primary: "#123d75",
  accent: "#e83d83"
};

test("generates a public landing without editor controls and with Brazilian WhatsApp", () => {
  const html = createLandingPage(values, "foto.png");
  assert.ok(html.includes('<h1>Aprender também é uma forma de ser feliz!</h1>'));
  assert.ok(html.includes('href="https://wa.me/5551981343844"'));
  assert.ok(html.includes('src="foto.png"'));
  assert.ok(!html.includes("Salvar projeto"));
});

test("preserves international numbers and embedded photos in downloaded pages", () => {
  const html = createLandingPage({ ...values, phone: "+55 51 98134-3844" }, "data:image/png;base64,abc");
  assert.ok(html.includes('href="https://wa.me/5551981343844"'));
  assert.ok(html.includes('src="data:image/png;base64,abc"'));
});

test("escapes user content in text and attributes", () => {
  const html = createLandingPage({
    ...values,
    title: '<script>alert("x")</script>',
    subtitle: '" onclick="test',
    name: "A & B"
  }, 'foto" onerror="test');
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(html.includes('content="&quot; onclick=&quot;test"'));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('" onerror="'));
});

test("rejects invalid colors instead of interpolating them into CSS", () => {
  assert.throws(() => createLandingPage({ ...values, primary: "</style>" }, "foto.png"), /inválidas/);
});
