import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import QRCode from "qrcode";
import { decodeQrLinks } from "../../lib/hackathons/qr.js";

// A fake poster photo with real QR codes placed on it.
async function poster(urls, { width = 1000, height = 1400, rotate = 0, quality = 80, size = 240, format = "jpeg" } = {}) {
  const codes = await Promise.all(urls.map((u) => QRCode.toBuffer(u, { type: "png", margin: 2, width: size })));
  const layers = codes.map((input, i) => ({ input, left: 60 + (i % 2) * (size + 120), top: height - size - 80 - Math.floor(i / 2) * (size + 60) }));
  let img = sharp({ create: { width, height, channels: 3, background: "#301a60" } }).composite(layers);
  if (rotate) img = sharp(await img.png().toBuffer()).rotate(rotate, { background: "#222" });
  return format === "png" ? img.png().toBuffer() : format === "webp" ? img.webp({ quality }).toBuffer() : img.jpeg({ quality }).toBuffer();
}

test("the link in a QR code on a poster photo is read", async () => {
  const buf = await poster(["https://www.buildsprint.example.com/register"]);
  assert.deepEqual(await decodeQrLinks(buf), ["https://www.buildsprint.example.com/register"]);
});

test("it works for PNG and WebP too, and on a tilted, compressed photo", async () => {
  const url = "https://buildsprint.example.com/";
  assert.deepEqual(await decodeQrLinks(await poster([url], { format: "png" })), [url]);
  assert.deepEqual(await decodeQrLinks(await poster([url], { format: "webp" })), [url]);
  assert.deepEqual(await decodeQrLinks(await poster([url], { rotate: 7, quality: 55 })), [url]);
});

test("a small QR code on a big poster is still found", async () => {
  const url = "https://hack.example.org/join";
  assert.deepEqual(await decodeQrLinks(await poster([url], { width: 2400, height: 3300, size: 200 })), [url]);
});

test("two QR codes on one poster are both found", async () => {
  const buf = await poster(["https://example.com/site", "https://example.com/register"], { height: 1500 });
  const got = await decodeQrLinks(buf);
  assert.equal(got.length, 2);
  assert.deepEqual([...got].sort(), ["https://example.com/register", "https://example.com/site"]);
});

test("only normal web links are kept: scripts, payments and plain text are ignored", async () => {
  for (const bad of ["javascript:alert(1)", "upi://pay?pa=someone@bank&am=500", "WIFI:S:campus;T:WPA;P:secret;;", "just some words", "https://user:pass@example.com/x"]) {
    assert.deepEqual(await decodeQrLinks(await poster([bad])), [], bad);
  }
});

test("a poster with no QR code, a blank image, and files that are not images give nothing and never throw", async () => {
  assert.deepEqual(await decodeQrLinks(await poster([])), []);
  assert.deepEqual(await decodeQrLinks(Buffer.from("not an image at all")), []);
  assert.deepEqual(await decodeQrLinks(Buffer.alloc(0)), []);
  assert.deepEqual(await decodeQrLinks(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])), []);
});
