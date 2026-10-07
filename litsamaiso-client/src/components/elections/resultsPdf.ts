import type { Election, ResultSnapshot } from '../../types';
import {
  OUTCOME_LABELS,
  getCandidateId,
  getCandidateName,
  getPositionId,
  getPositionTitle,
  makeFileSafeName,
  type PositionWithCandidates,
} from './electionHelpers';

const sanitizePdfText = (value: string) => (
  value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
);

const pdfColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
};

const truncatePdfText = (value: string, maxLength: number) => (
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
);

export const createStyledResultsPdfBlob = (params: {
  election: Election;
  snapshot: ResultSnapshot;
  positions: PositionWithCandidates[];
}) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const cardWidth = pageWidth - margin * 2;
  const pageCommands: string[][] = [[]];
  let currentPage = pageCommands[0];
  let cursorY = margin;

  const addCommand = (command: string) => currentPage.push(command);
  const setPage = () => {
    currentPage = [];
    pageCommands.push(currentPage);
    cursorY = margin;
  };
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
  ) => {
    const pdfY = pageHeight - y - height;
    addCommand(`q ${pdfColor(fill)} rg ${x} ${pdfY} ${width} ${height} re f Q`);
    if (stroke) {
      addCommand(`q ${pdfColor(stroke)} RG ${x} ${pdfY} ${width} ${height} re S Q`);
    }
  };
  const text = (
    value: string,
    x: number,
    y: number,
    options?: { size?: number; bold?: boolean; color?: string },
  ) => {
    const size = options?.size || 10;
    const font = options?.bold ? 'F2' : 'F1';
    addCommand(`BT /${font} ${size} Tf ${pdfColor(options?.color || '#111827')} rg ${x} ${pageHeight - y} Td (${sanitizePdfText(value)}) Tj ET`);
  };

  text('Election Results', margin, cursorY, { size: 24, bold: true, color: '#020618' });
  cursorY += 24;
  text(params.election.title, margin, cursorY, { size: 14, color: '#5b6478' });
  cursorY += 18;
  text(`Counted ${new Date(params.snapshot.generatedAt).toLocaleString()}`, margin, cursorY, {
    size: 10,
    color: '#919dc2',
  });
  cursorY += 32;

  params.snapshot.positions.forEach((positionResult) => {
    const position = params.positions.find(
      (item) => getPositionId(item) === String(positionResult.positionId),
    );
    const rankings = positionResult.rankings;
    const winnerId = positionResult.winnerId ? String(positionResult.winnerId) : '';
    const cardHeight = 72 + Math.max(rankings.length, 1) * 30;

    if (cursorY + cardHeight > pageHeight - margin) {
      setPage();
    }

    const cardX = margin;
    const cardY = cursorY;
    rect(cardX, cardY, cardWidth, cardHeight, '#ffffff', '#dfe3ea');
    text(position ? getPositionTitle(position) : 'Position', cardX + 16, cardY + 28, {
      size: 14,
      bold: true,
      color: '#020618',
    });
    const outcome = positionResult.outcome || (winnerId ? 'WINNER' : undefined);
    if (outcome) {
      const isWinner = outcome === 'WINNER';
      rect(cardX + cardWidth - 76, cardY + 14, 60, 20, isWinner ? '#d7fbe5' : '#fef3c7');
      text(OUTCOME_LABELS[outcome], cardX + cardWidth - 64, cardY + 28, {
        size: 9,
        bold: true,
        color: isWinner ? '#008236' : '#92400e',
      });
    }

    const tableX = cardX + 16;
    const tableY = cardY + 48;
    const tableWidth = cardWidth - 32;
    rect(tableX, tableY, tableWidth, 28, '#f8fafc');
    text('Rank', tableX + 10, tableY + 18, { size: 10, bold: true, color: '#364153' });
    text('Candidate', tableX + 92, tableY + 18, { size: 10, bold: true, color: '#364153' });
    text('Votes', tableX + 348, tableY + 18, { size: 10, bold: true, color: '#364153' });
    text('Percentage', tableX + 430, tableY + 18, { size: 10, bold: true, color: '#364153' });

    if (rankings.length === 0) {
      rect(tableX, tableY + 28, tableWidth, 30, '#ffffff');
      text('No votes recorded for this position.', tableX + 10, tableY + 48, {
        size: 10,
        color: '#6b7280',
      });
    } else {
      rankings.forEach((ranking, index) => {
        const rowY = tableY + 28 + index * 30;
        const isWinner = winnerId === String(ranking.candidateId);
        const candidate = position?.candidates?.find(
          (item) => getCandidateId(item) === String(ranking.candidateId),
        );
        const candidateName = truncatePdfText(candidate ? getCandidateName(candidate) : 'Candidate', 34);

        rect(tableX, rowY, tableWidth, 30, isWinner ? '#ecfdf3' : '#ffffff');
        text(String(ranking.rank), tableX + 10, rowY + 20, { size: 11, color: '#0f172b' });
        text(candidateName, tableX + 92, rowY + 20, { size: 11, color: '#0f172b' });
        if (isWinner) {
          text('Winner', tableX + 250, rowY + 20, { size: 9, bold: true, color: '#008236' });
        }
        text(String(ranking.votes), tableX + 348, rowY + 20, { size: 11, color: '#0f172b' });
        text(`${ranking.percentage}%`, tableX + 430, rowY + 20, { size: 11, color: '#0f172b' });
      });
    }

    cursorY += cardHeight + 16;
  });

  text('Litsamaiso Election Management System', margin, pageHeight - 24, {
    size: 9,
    color: '#6b7280',
  });

  const fontRegularObjectId = 3 + pageCommands.length * 2;
  const fontBoldObjectId = fontRegularObjectId + 1;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageCommands.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageCommands.length} >>`,
  ];

  pageCommands.forEach((commands, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = commands.join('\n');

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};

export const exportResultsPdf = (election: Election, snapshot: ResultSnapshot, positions: PositionWithCandidates[]) => {
  const blob = createStyledResultsPdfBlob({ election, snapshot, positions });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${makeFileSafeName(`${election.title} Results`) || 'election-results'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
