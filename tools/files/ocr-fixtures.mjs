import { createCanvas } from "@napi-rs/canvas";
export function documentImage() {
  const canvas = createCanvas(1200, 600), ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1200, 600);
  ctx.fillStyle = "black"; ctx.font = "48px Arial";
  for (const [i, line] of ["FACTURA DE VENTA", "Cliente: Maria Lopez", "Codigo: 82741", "Total: 3500 pesos"].entries()) ctx.fillText(line, 60, 100 + i * 100);
  return canvas.toBuffer("image/png");
}
export function scannedPdf({ nativePage = false, pages = 1 } = {}) {
  const canvas = createCanvas(1200, 600), ctx = canvas.getContext("2d");
  const source = documentImage();
  // PNG is decoded by the same canvas runtime used by pdf-parse.
  return import("@napi-rs/canvas").then(async ({ loadImage }) => {
    ctx.drawImage(await loadImage(source), 0, 0);
    const jpeg = canvas.toBuffer("image/jpeg");
    const count = pages + Number(nativePage);
    const objects = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.from(`<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${count} >>`), Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from("\nendstream")]), Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")];
    for (let i = 0; i < count; i++) {
      const stream = nativePage && i === 0 ? "BT /F1 16 Tf 40 250 Td (Texto digital: 12345) Tj ET" : "q 600 0 0 300 0 0 cm /Im0 Do Q";
      objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /XObject << /Im0 3 0 R >> /Font << /F1 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`), Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    }
    const parts = [Buffer.from("%PDF-1.4\n")], offsets = []; let length = parts[0].length;
    objects.forEach((object, i) => { offsets.push(length); const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); parts.push(part); length += part.length; });
    parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
    return Buffer.concat(parts);
  });
}
