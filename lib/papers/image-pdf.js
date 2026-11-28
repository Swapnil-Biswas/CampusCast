// Puts several JPEG photos into one PDF, one photo per page, without any library. The JPEG data is embedded as it is
// (PDF reads JPEG directly), so nothing is re-compressed here.

const enc = new TextEncoder();
const PAGE_WIDTH = 595;   // A4 width in points; each page takes the photo's own shape

/** @param pages [{ jpeg: Uint8Array (RGB), width, height }]  @returns Uint8Array of the PDF */
export function imagesToPdf(pages) {
  if (!pages?.length) throw new Error("No pages.");
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => { const bytes = typeof part === "string" ? enc.encode(part) : part; chunks.push(bytes); length += bytes.length; };
  const object = (id, ...body) => { offsets[id] = length; push(`${id} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };

  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));   // marks the file as binary
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);

  pages.forEach(({ jpeg, width, height }, i) => {
    const page = 3 + i * 3, content = page + 1, image = page + 2;
    const h = Math.round((PAGE_WIDTH * height) / width);
    const draw = `q ${PAGE_WIDTH} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${h}] /Contents ${content} 0 R /Resources << /XObject << /Im0 ${image} 0 R >> >> >>`);
    object(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    object(image, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream");
  });

  const xref = length;
  const count = offsets.length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
