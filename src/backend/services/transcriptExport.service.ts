import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
} from "docx";

// Load font buffers once at startup
const NOTO_REGULAR = readFileSync(resolve(import.meta.dir, "../../public/fonts/NotoSans-Regular.ttf"));
const NOTO_BOLD = readFileSync(resolve(import.meta.dir, "../../public/fonts/NotoSans-Bold.ttf"));

// =============================================================================
// Types
// =============================================================================

export interface TranscriptEntry {
  timestamp: string;
  text: string;
}

interface TranscriptExportData {
  sessionDate: string;
  sessionTimeRange: string;
  segments: TranscriptEntry[];
}

// =============================================================================
// TXT
// =============================================================================

export function generateTranscriptTxt({ sessionDate, sessionTimeRange, segments }: TranscriptExportData): Buffer {
  const lines = [
    "Transcription",
    "=".repeat(40),
    "",
    `Date: ${sessionDate}`,
    `Time: ${sessionTimeRange}`,
    "",
    "---",
    "",
  ];

  for (const seg of segments) {
    lines.push(`[${seg.timestamp}]  ${seg.text}`);
    lines.push("");
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}

// =============================================================================
// PDF
// =============================================================================

export async function generateTranscriptPdf({ sessionDate, sessionTimeRange, segments }: TranscriptExportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(NOTO_REGULAR);
  const fontBold = await pdfDoc.embedFont(NOTO_BOLD);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  const timestampWidth = 50;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y < margin + needed) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // Title
  page.drawText("Transcription", { x: margin, y, font: fontBold, size: 20, color: rgb(0.1, 0.1, 0.1) });
  y -= 30;

  // Metadata
  const meta = `${sessionDate}  -  ${sessionTimeRange}`;
  if (meta.trim()) {
    page.drawText(meta, { x: margin, y, font, size: 10, color: rgb(0.5, 0.5, 0.5) });
  }
  y -= 20;

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 20;

  // Segments
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;

    ensureSpace(30);

    // Timestamp
    const ts = seg.timestamp || "--:--";
    page.drawText(ts, { x: margin, y, font, size: 10, color: rgb(0.6, 0.6, 0.6) });

    // Word-wrap the text
    const maxWidth = contentWidth - timestampWidth;
    const words = text.split(" ");
    let line = "";
    const lines: string[] = [];

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, 11) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      ensureSpace(22);
      page.drawText(l, { x: margin + timestampWidth, y, font, size: 11, color: rgb(0.23, 0.23, 0.23) });
      y -= 16.5;
    }
    y -= 8;

    // Divider
    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: pageWidth - margin, y: y + 4 },
      thickness: 0.3,
      color: rgb(0.91, 0.91, 0.9),
    });
    y -= 6;
  }

  return pdfDoc.save();
}

// =============================================================================
// DOCX
// =============================================================================

export async function generateTranscriptDocx({ sessionDate, sessionTimeRange, segments }: TranscriptExportData): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Transcription",
          bold: true,
          size: 48,
          font: "Calibri",
          color: "1A1A1A",
        }),
      ],
      spacing: { after: 120 },
    }),
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${sessionDate}  \u2022  ${sessionTimeRange}`,
          color: "888888",
          size: 20,
          font: "Calibri",
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      },
      spacing: { after: 300 },
    }),
  );

  for (const seg of segments) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${seg.timestamp}    `,
            color: "999999",
            size: 20,
            font: "Calibri",
          }),
          new TextRun({
            text: seg.text,
            size: 22,
            font: "Calibri",
            color: "3A3A3A",
          }),
        ],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E8E8E6" },
        },
        spacing: { before: 80, after: 80 },
      }),
    );
  }

  children.push(
    new Paragraph({
      border: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      },
      spacing: { before: 400 },
    }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Generated by Mentra Notes",
          color: "AAAAAA",
          size: 16,
          font: "Calibri",
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
