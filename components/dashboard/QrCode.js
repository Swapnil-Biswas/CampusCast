import QRCode from "qrcode";

// A QR code for a link, drawn as plain SVG shapes. It is built from the code's own cell grid (no HTML is ever inserted),
// so whatever the link says can never run as markup. A white border (the "quiet zone") keeps it scannable on any theme.
export default function QrCode({ value, size = 190, label }) {
  const qr = QRCode.create(String(value).slice(0, 500), { errorCorrectionLevel: "M" });
  const n = qr.modules.size, data = qr.modules.data, pad = 4;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x + pad} ${y + pad}h1v1h-1z`;
  return (
    <svg className="hk-qr" viewBox={`0 0 ${n + pad * 2} ${n + pad * 2}`} width={size} height={size} role="img" aria-label={label || "QR code"}>
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#111" shapeRendering="crispEdges" />
    </svg>
  );
}
