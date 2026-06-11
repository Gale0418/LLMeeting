import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INCLUDED_PATHS = ["manifest.json", "assets", "src"];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

async function main() {
  const manifest = JSON.parse(await readFile(path.join(rootDir, "manifest.json"), "utf8"));
  const files = [];

  for (const entryPath of INCLUDED_PATHS) {
    files.push(...await collectFiles(path.join(rootDir, entryPath)));
  }

  const zip = await createZip(files);
  const outDir = path.join(rootDir, "dist");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `llmeeting-${manifest.version}.zip`);
  await writeFile(outPath, zip);
  console.log(`Wrote ${path.relative(rootDir, outPath)} (${zip.length} bytes)`);
}

async function collectFiles(targetPath) {
  const details = await stat(targetPath);
  if (details.isFile()) {
    return [{
      absolutePath: targetPath,
      archiveName: toArchiveName(path.relative(rootDir, targetPath)),
      modifiedAt: details.mtime,
    }];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(childPath));
    } else if (entry.isFile()) {
      const childDetails = await stat(childPath);
      files.push({
        absolutePath: childPath,
        archiveName: toArchiveName(path.relative(rootDir, childPath)),
        modifiedAt: childDetails.mtime,
      });
    }
  }
  return files;
}

async function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = await readFile(file.absolutePath);
    const name = Buffer.from(file.archiveName, "utf8");
    const checksum = crc32(data);
    const { time, date } = dosDateTime(file.modifiedAt);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ]);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function toArchiveName(filePath) {
  return filePath.split(path.sep).join("/");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(dateValue) {
  const date = new Date(dateValue);
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
