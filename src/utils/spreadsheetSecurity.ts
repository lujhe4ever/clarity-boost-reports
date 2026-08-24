export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 100;
export const MAX_CELL_CHARACTERS = 10_000;
export const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const MAX_XLSX_ENTRIES = 2_000;
const MAX_COMPRESSION_RATIO = 200;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export type SpreadsheetExtension = ".csv" | ".xlsx";

export function validateSpreadsheetFile(file: Pick<File, "name" | "size" | "type">) {
  const name = file.name.toLowerCase();
  const extension: SpreadsheetExtension | null = name.endsWith(".xlsx")
    ? ".xlsx"
    : name.endsWith(".csv")
      ? ".csv"
      : null;

  if (!extension) {
    throw new Error("Formato nao permitido. Envie apenas arquivos CSV ou XLSX.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("O arquivo excede o limite de 5 MB.");
  }
  if (file.type && !ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    throw new Error("O tipo MIME do arquivo nao corresponde a CSV ou XLSX.");
  }

  return extension;
}

export function validateSpreadsheetRow(row: unknown[], rowNumber: number) {
  if (row.length > MAX_IMPORT_COLUMNS) {
    throw new Error(`A linha ${rowNumber} excede o limite de ${MAX_IMPORT_COLUMNS} colunas.`);
  }

  for (const cell of row) {
    if (String(cell ?? "").length > MAX_CELL_CHARACTERS) {
      throw new Error(
        `A linha ${rowNumber} contem uma celula maior que ${MAX_CELL_CHARACTERS} caracteres.`,
      );
    }
  }
}

export function assertSafeXlsxArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const endSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const minimumEndOffset = Math.max(0, view.byteLength - 65_557);
  let endOffset = -1;

  for (let offset = view.byteLength - 22; offset >= minimumEndOffset; offset -= 1) {
    if (view.getUint32(offset, true) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("O arquivo XLSX esta corrompido ou nao e um ZIP valido.");

  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (entryCount === 0xffff || centralSize === 0xffffffff || offset === 0xffffffff) {
    throw new Error("Arquivos XLSX no formato ZIP64 nao sao aceitos.");
  }
  if (entryCount > MAX_XLSX_ENTRIES || offset + centralSize > view.byteLength) {
    throw new Error("O arquivo XLSX excede os limites estruturais permitidos.");
  }

  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== centralSignature) {
      throw new Error("O diretorio interno do arquivo XLSX e invalido.");
    }

    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);

    totalUncompressed += uncompressedSize;
    if (
      totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES ||
      (compressedSize === 0 && uncompressedSize > 0) ||
      (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO)
    ) {
      throw new Error("O arquivo XLSX possui conteudo descompactado excessivo.");
    }

    offset += 46 + filenameLength + extraLength + commentLength;
  }
}
