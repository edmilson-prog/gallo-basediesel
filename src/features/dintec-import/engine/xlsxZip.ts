import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;

/**
 * Reads a single named entry from a `.xlsx` file's ZIP container as raw
 * bytes, or `null` if the entry doesn't exist. Handles both stored
 * (uncompressed) and deflated entries — the only two compression methods
 * Excel itself ever writes. No ZIP64 support (not needed — these files are
 * well under the 4GB/65535-entry limits that trigger it).
 */
export function readZipEntry(buf: Buffer, entryName: string): Buffer | null {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Arquivo não é um .xlsx válido (EOCD não encontrado)");

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < entryCount; i++) {
    const sig = buf.readUInt32LE(cdOffset);
    if (sig !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Central directory corrompido no offset ${cdOffset} (assinatura ${sig.toString(16)})`);
    }
    const compressionMethod = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const fileNameLength = buf.readUInt16LE(cdOffset + 28);
    const extraFieldLength = buf.readUInt16LE(cdOffset + 30);
    const commentLength = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const fileName = buf.toString("utf8", cdOffset + 46, cdOffset + 46 + fileNameLength);

    if (fileName === entryName) {
      const localFileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buf.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressed = buf.subarray(dataOffset, dataOffset + compressedSize);
      return compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    }
    cdOffset += 46 + fileNameLength + extraFieldLength + commentLength;
  }
  return null;
}

/** Lists every entry filename in the ZIP container (used to discover sheetN.xml files). */
export function listZipEntries(buf: Buffer): string[] {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Arquivo não é um .xlsx válido (EOCD não encontrado)");
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];
  for (let i = 0; i < entryCount; i++) {
    const fileNameLength = buf.readUInt16LE(cdOffset + 28);
    const extraFieldLength = buf.readUInt16LE(cdOffset + 30);
    const commentLength = buf.readUInt16LE(cdOffset + 32);
    names.push(buf.toString("utf8", cdOffset + 46, cdOffset + 46 + fileNameLength));
    cdOffset += 46 + fileNameLength + extraFieldLength + commentLength;
  }
  return names;
}
