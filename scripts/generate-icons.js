const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'assets');

const COLORS = {
  baseA: [15, 23, 42],
  baseB: [37, 99, 235],
  circle: [248, 250, 252],
  inner: [59, 130, 246],
  rim: [15, 23, 42],
};

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function blend(colorA, colorB, t) {
  return [
    clamp(Math.round(colorA[0] + (colorB[0] - colorA[0]) * t)),
    clamp(Math.round(colorA[1] + (colorB[1] - colorA[1]) * t)),
    clamp(Math.round(colorA[2] + (colorB[2] - colorA[2]) * t)),
  ];
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(size) {
  const pixelData = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.28;
  const innerRadius = radius * 0.45;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (size * 2);
      let color = blend(COLORS.baseA, COLORS.baseB, t);

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        color = COLORS.circle;
        if (dist <= innerRadius) {
          color = COLORS.inner;
        } else if (dist >= radius * 0.92) {
          color = blend(COLORS.circle, COLORS.rim, 0.3);
        }
      }

      const idx = (y * size + x) * 4;
      pixelData[idx] = color[0];
      pixelData[idx + 1] = color[1];
      pixelData[idx + 2] = color[2];
      pixelData[idx + 3] = 255;
    }
  }

  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rows[rowStart] = 0;
    pixelData.copy(rows, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(rows, { level: 9 });

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIco(pngData) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  return Buffer.concat([header, entry, pngData]);
}

function createIcns(pngEntries) {
  const chunks = pngEntries.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0);
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });

  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0);
  header.writeUInt32BE(totalLength, 4);

  return Buffer.concat([header, ...chunks]);
}

function writeIconFiles() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const png512 = createPng(512);
  const png1024 = createPng(1024);

  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png512);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), createIco(png512));
  fs.writeFileSync(
    path.join(OUT_DIR, 'icon.icns'),
    createIcns([
      { type: 'ic09', data: png512 },
      { type: 'ic10', data: png1024 },
    ])
  );
}

writeIconFiles();
