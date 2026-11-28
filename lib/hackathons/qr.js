import { cleanUrl } from "./normalize.js";

// Reads the QR codes printed on a poster photo and returns the web links inside them, so students can open the link
// straight from CampusCast instead of scanning it (which would send them off the platform). AI models cannot read a
// QR code reliably, so this is done mechanically with an image decoder.
//
// What comes out of a QR code is untrusted text from a picture: only normal http(s) links are kept (cleanUrl refuses
// javascript:, data:, addresses with passwords, and so on). Anything else (a payment code, a Wi-Fi code, a contact card)
// is ignored. A person still reviews every link in the editor before it is published.

const SIZES = [2400, 1400, 900];     // the decoder is sensitive to resolution, so try a few
const MAX_PIXELS = 80_000_000;        // refuse absurdly large images
const REGION_MARGIN = 0.12;

async function pixels(sharp, bytes, size) {
  return sharp(bytes, { failOn: "none", limitInputPixels: MAX_PIXELS })
    .rotate()                                                   // honour the phone's orientation flag
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

// Paint over a code that was found, so the decoder can look for another one.
function blank(data, info, loc) {
  const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
  const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];
  const mx = (Math.max(...xs) - Math.min(...xs)) * REGION_MARGIN, my = (Math.max(...ys) - Math.min(...ys)) * REGION_MARGIN;
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - mx)), x1 = Math.min(info.width - 1, Math.ceil(Math.max(...xs) + mx));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - my)), y1 = Math.min(info.height - 1, Math.ceil(Math.max(...ys) + my));
  for (let y = y0; y <= y1; y++) data.fill(255, (y * info.width + x0) * 4, (y * info.width + x1 + 1) * 4);
}

/**
 * @param bytes  a JPEG / PNG / WebP image
 * @returns the distinct web links found in its QR codes, in the order found (at most `max`); [] if none or on any problem
 */
export async function decodeQrLinks(bytes, { max = 3 } = {}) {
  try {
    const sharp = (await import("sharp")).default;
    const jsQR = (await import("jsqr")).default;
    const texts = [];
    for (const size of SIZES) {
      const { data, info } = await pixels(sharp, bytes, size);
      const view = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
      for (let i = 0; i < max; i++) {
        const r = jsQR(view, info.width, info.height, { inversionAttempts: "attemptBoth" });
        if (!r) break;
        blank(data, info, r.location);
        const t = String(r.data || "").trim();
        if (t && !texts.includes(t)) texts.push(t);
      }
      if (texts.length) break;
    }
    const links = [];
    for (const t of texts) { const u = cleanUrl(t); if (u && !links.includes(u)) links.push(u); }
    return links.slice(0, max);
  } catch {
    return [];     // an unreadable image, or no decoder available: just carry on without QR links
  }
}
