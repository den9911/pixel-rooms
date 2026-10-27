export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function text(value, max = 160, min = 1) {
  if (typeof value !== 'string') throw new HttpError(400, 'Нужен текст.');
  const result = value.trim().normalize('NFC');
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result)) throw new HttpError(400, `Введите от ${min} до ${max} символов.`);
  return result;
}
export function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, 'Некорректное число.');
  return value;
}
export function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) !== day) throw new HttpError(400, 'Некорректная дата.');
  return day;
}

/** Inspect image signatures and dimensions without decoding pixels or trusting MIME supplied by the browser. */
export function decodeImage(value) {
  if (value === undefined || value === null) return { image: null, mime: null, bytes: 0 };
  if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new HttpError(400, 'Поддерживаются PNG, JPEG и WebP.');
  const [header, base64] = value.split(',');
  const image = Buffer.from(base64, 'base64');
  if (image.length > 500_000) throw new HttpError(413, 'Картинка должна быть не больше 500 КБ.');
  let mime, width, height;
  if (image.length >= 33 && image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && image.toString('ascii',12,16) === 'IHDR') {
    mime = 'image/png'; width = image.readUInt32BE(16); height = image.readUInt32BE(20);
    // APNG is intentionally excluded from v1.
    if (image.includes(Buffer.from('acTL'))) throw new HttpError(400, 'Сохраните один кадр анимации.');
  } else if (image.length >= 30 && image.toString('ascii',0,4) === 'RIFF' && image.toString('ascii',8,12) === 'WEBP') {
    mime = 'image/webp';
    const type = image.toString('ascii',12,16);
    if (type === 'VP8X') {
      if (image[20] & 2) throw new HttpError(400, 'Сохраните один кадр анимации.');
      width = image.readUIntLE(24,3)+1; height = image.readUIntLE(27,3)+1;
    } else if (type === 'VP8 ' && image[23] === 0x9d && image[24] === 1 && image[25] === 0x2a) {
      width = image.readUInt16LE(26) & 0x3fff; height = image.readUInt16LE(28) & 0x3fff;
    } else if (type === 'VP8L' && image[20] === 0x2f) {
      const bits = image.readUInt32LE(21); width = (bits & 0x3fff)+1; height = ((bits >>> 14) & 0x3fff)+1;
    }
  } else if (image.length >= 4 && image[0] === 0xff && image[1] === 0xd8) {
    mime = 'image/jpeg';
    let offset = 2;
    while (offset + 8 < image.length) {
      if (image[offset] !== 0xff) break;
      const marker = image[offset+1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = image.readUInt16BE(offset+2);
      if (length < 2 || offset+2+length > image.length) break;
      if ([0xc0,0xc1,0xc2].includes(marker)) { height=image.readUInt16BE(offset+5); width=image.readUInt16BE(offset+7); break; }
      offset += 2+length;
    }
  }
  if (!mime || !header.includes(mime) || !width || !height || width > 2048 || height > 2048) throw new HttpError(400, 'Повреждённая картинка или размер больше 2048 × 2048.');
  return { image, mime, bytes: image.length };
}
