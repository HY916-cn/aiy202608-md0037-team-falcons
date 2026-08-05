import { Buffer } from "node:buffer";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const DOS_DATE_1980_01_01 = 0x0021;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(content) {
  let checksum = 0xffffffff;
  for (const byte of content) {
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function collectFiles(rootDirectory, segments = []) {
  const directory = join(rootDirectory, ...segments);
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const files = [];

  for (const entry of entries) {
    const entrySegments = [...segments, entry.name];
    const absolutePath = join(rootDirectory, ...entrySegments);
    if (entry.isSymbolicLink() || lstatSync(absolutePath).isSymbolicLink()) {
      throw new Error(`Refusing to archive symbolic link: ${entrySegments.join("/")}`);
    }
    if (entry.isDirectory()) {
      files.push(...collectFiles(rootDirectory, entrySegments));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        archivePath: entrySegments.join("/"),
      });
    }
  }

  return files;
}

function assertZip32Limit(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new Error(`${label} exceeds the supported ZIP32 limit.`);
  }
}

export function createZipFromDirectory(sourceDirectory, destinationPath) {
  const files = collectFiles(sourceDirectory);
  if (files.length > MAX_UINT16) {
    throw new Error("File count exceeds the supported ZIP32 limit.");
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const name = Buffer.from(file.archivePath, "utf8");
    const content = readFileSync(file.absolutePath);
    const checksum = crc32(content);
    assertZip32Limit(content.length, `File ${file.archivePath}`);
    assertZip32Limit(localOffset, "Archive offset");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  assertZip32Limit(centralDirectory.length, "Central directory");
  assertZip32Limit(localOffset, "Central directory offset");

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  mkdirSync(dirname(destinationPath), { recursive: true });
  writeFileSync(
    destinationPath,
    Buffer.concat([...localParts, centralDirectory, endRecord]),
  );

  return files.map((file) => file.archivePath);
}
