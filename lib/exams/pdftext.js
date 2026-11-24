// Reads the text layer of a PDF, page by page (used by providers that cannot take a PDF directly, like Groq).
// A scanned PDF has no text layer: the pages come back (nearly) empty and the caller must handle that.

export async function pdfPages(bytes) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));   // a copy: the library may take ownership of its buffer
  const { text } = await extractText(doc, { mergePages: false });
  return (Array.isArray(text) ? text : [String(text || "")]).map((t) => String(t).replace(/[ \t]+\n/g, "\n").trim());
}
