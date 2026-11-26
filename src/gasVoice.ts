// A deliberately bounded parser for the shop's gas-order vocabulary.
// Speech recognition supplies text; this module never invents customer details.
export type VoiceGasBrand = 'สยาม' | 'ปตท';
export type VoiceGasSize = 4 | 15;

export interface GasVoiceLine {
  sizeKg?: VoiceGasSize;
  quantity?: number;
}

export interface GasVoiceDraft {
  brand?: VoiceGasBrand;
  items: GasVoiceLine[];
  customerName?: string;
  address?: string;
  phone?: string;
  notes: string[];
  errors: string[];
}

const numberWords: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4,
  ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10,
};
const countToken = '(?:[0-9]+|(?:ยี่|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?สิบ(?:เอ็ด|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?|ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)';
const locationStart = '(?:ที่อยู่|จุดส่ง|จุดหมาย|ส่งที่|หมู่บ้าน|บ้าน|ร้าน|ซอย|หมู่ที่|แถว|หลังวัด|ข้าง|ตรงข้าม|ใกล้|ตลาด|วัด)';

function arabicDigits(text: string) {
  return text.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - '๐'.charCodeAt(0)));
}

function parseCount(text: string) {
  if (/^\d+$/.test(text)) return Number(text);
  if (text in numberWords) return numberWords[text];
  const [tens, units] = text.split('สิบ');
  return (tens ? numberWords[tens] : 1) * 10 + (units ? numberWords[units] : 0);
}

function cleanText(text: string) {
  return text.replace(/^[\s,.;:]+|[\s,.;:]+$/g, '').replace(/\s+/g, ' ')
    .replace(/(?:\s*(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ|ด้วย|หน่อย))+$/u, '')
    .replace(/(?:\s+(?:และ|กับ|แล้ว))+$/u, '').trim();
}

export function gasSizeFromName(name: string): VoiceGasSize | undefined {
  const small = /(?:^|[^0-9])4\s*(?:kg|กก\.?|กิโล(?:กรัม)?|โล)|ถังเล็ก/i.test(name);
  const large = /(?:^|[^0-9])15\s*(?:kg|กก\.?|กิโล(?:กรัม)?|โล)|ถังใหญ่/i.test(name);
  return small === large ? undefined : small ? 4 : 15;
}

export function parseGasVoice(text: string): GasVoiceDraft {
  const draft: GasVoiceDraft = { items: [], notes: [], errors: [] };
  let rest = arabicDigits(text.normalize('NFC')).trim();
  if (!rest) {
    draft.errors.push('พูดหรือพิมพ์รายการที่ต้องการก่อน');
    return draft;
  }
  if (/(?:ไม่เอา|ไม่ใช่|ยกเลิก)/.test(rest)) {
    draft.errors.push('พูดเฉพาะรายการที่ต้องการใหม่ เช่น ส่งแก๊ส ปตท. ถังใหญ่ บ้านคุณสมชาย');
    return draft;
  }
  if (/\d+[.,]\d+\s*ถัง/.test(rest)) {
    draft.errors.push('จำนวนถังต้องเป็นจำนวนเต็ม กรุณาพูดจำนวนใหม่');
    return draft;
  }

  // Strip labelled phone numbers before interpreting quantities or addresses.
  rest = rest.replace(/(?:เบอร์(?:โทร(?:ศัพท์)?)?|โทร(?:ศัพท์)?)\s*([0-9\s-]+|(?:ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|\s)+)/g, (_match, raw: string) => {
    const phone = raw.replace(/ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า/g, (word) => String(numberWords[word])).replace(/[\s-]/g, '');
    if (/^0\d{8,9}$/.test(phone)) {
      if (draft.phone && draft.phone !== phone) draft.errors.push('พบหลายเบอร์โทร กรุณาระบุเพียงเบอร์เดียว');
      draft.phone = phone;
    } else draft.notes.push('ฟังเบอร์โทรไม่ครบ กรุณาตรวจและกรอกเบอร์เอง');
    return ' ';
  });

  const brands = new Set<VoiceGasBrand>();
  // Keep registration digits out of cylinder counts and restore them to the destination.
  const plate = rest.match(/(?:ป้าย)?ทะเบียน(?:รถ)?\s*[:：]?\s*(?:[0-9๐-๙]*[ก-ฮA-Za-z]+[ -]*[0-9๐-๙]+|[0-9๐-๙]+(?:-[0-9๐-๙]+)?)/u)?.[0];
  if (plate) rest = rest.replace(plate, ' ');
  rest = rest.replace(/ป\s*\.?\s*ต\s*\.?\s*ท\s*\.?|ปอ\s*ตอ\s*ทอ|\bptt\b|\bor\b|สยาม(?:แก๊ส)?/gi, (word) => {
    brands.add(/สยาม/.test(word) ? 'สยาม' : 'ปตท');
    return ' ';
  });
  if (brands.size > 1) draft.errors.push('พบทั้งสยามและ ปตท. กรุณาพูดทีละยี่ห้อ');
  else draft.brand = [...brands][0];

  // Return counts must never become the number of full cylinders being sold.
  rest = rest.replace(new RegExp(`(?:จ่ายแล้ว|ยังไม่จ่าย|ค้างจ่าย|คืนถัง(?:เปล่า)?(?:\\s*${countToken}\\s*(?:ถัง)?)?)`, 'g'), () => {
    draft.notes.push('ตรวจคนส่ง การจ่ายเงิน และจำนวนถังคืนในฟอร์มเอง');
    return ' ';
  });
  if (/(?:ครึ่ง|หลาย|ร้อย|พัน|ล้าน)\s*ถัง/.test(rest)) draft.errors.push('ยังแยกจำนวนถังไม่ได้ กรุณาระบุจำนวนเป็นตัวเลขแล้วตามด้วยคำว่าถัง');

  let sharedQuantity: number | undefined;
  rest = rest.replace(new RegExp(`อย่างละ\\s*(${countToken})(?:\\s*ถัง)?`, 'g'), (_word, count: string) => {
    if (sharedQuantity !== undefined) draft.errors.push('พบจำนวนอย่างละซ้ำ กรุณาระบุเพียงครั้งเดียว');
    sharedQuantity = parseCount(count);
    return ' ';
  });

  // Keep sizes and counts in spoken order so a count belongs to its own size.
  // Prefix counts ("สองถังใหญ่") are distinguished from suffix counts
  // ("ถังใหญ่สองถัง") instead of collecting all numbers into a global set.
  type Token = { start: number; end: number; kind: 'size' | 'before' | 'after'; value: number };
  const tokens: Token[] = [];
  for (const match of rest.matchAll(/ถัง\s*(ใหญ่|เล็ก)|(\d+|สิบห้า|สี่)\s*(?:กิโลกรัม|กิโล|กก\.?|kg|โล)/gi)) {
    const value = match[1] ? (match[1] === 'ใหญ่' ? 15 : 4) : parseCount(match[2]);
    if (value !== 4 && value !== 15) draft.errors.push('ตัวทดลองรองรับถัง 4 และ 15 กก. กรุณาเลือกขนาดเอง');
    tokens.push({ start: match.index!, end: match.index! + match[0].length, kind: 'size', value });
  }
  for (const match of rest.matchAll(new RegExp(`(${countToken})\\s*(?=ถัง\\s*(?:ใหญ่|เล็ก))`, 'g'))) {
    tokens.push({ start: match.index!, end: match.index! + match[0].length, kind: 'before', value: parseCount(match[1]) });
  }
  for (const match of rest.matchAll(new RegExp(`(?:จำนวน\\s*)?(${countToken})\\s*ถัง(?!\\s*(?:ใหญ่|เล็ก))`, 'g'))) {
    tokens.push({ start: match.index!, end: match.index! + match[0].length, kind: 'after', value: parseCount(match[1]) });
  }
  tokens.sort((a, b) => a.start - b.start);
  let current: GasVoiceLine | undefined;
  let pendingQuantity: number | undefined;
  for (const token of tokens) {
    if (token.kind === 'size') {
      // Consecutive aliases such as "ถังใหญ่ 15 กก." describe one line.
      if (!current || current.sizeKg !== token.value || current.quantity !== undefined) {
        current = { sizeKg: token.value as VoiceGasSize };
        draft.items.push(current);
      }
      if (pendingQuantity !== undefined) {
        current.quantity = pendingQuantity;
        pendingQuantity = undefined;
      }
    } else if (token.kind === 'before' || !current) {
      if (pendingQuantity !== undefined) draft.errors.push('จำนวนถังไม่ชัดเจน กรุณาบอกขนาดและจำนวนทีละคู่');
      pendingQuantity = token.value;
    } else {
      if (current.quantity !== undefined) draft.errors.push('พบหลายจำนวนสำหรับขนาดเดียว กรุณาระบุจำนวนต่อขนาดเพียงครั้งเดียว');
      current.quantity = token.value;
    }
  }
  if (pendingQuantity !== undefined) {
    if (draft.items.length) draft.errors.push('จำนวนถังไม่ชัดเจน กรุณาบอกขนาดและจำนวนทีละคู่');
    else draft.items.push({ quantity: pendingQuantity });
  }
  if (sharedQuantity !== undefined && !draft.items.length) draft.items.push({});
  for (const line of draft.items) {
    if (sharedQuantity !== undefined) {
      if (line.quantity !== undefined && line.quantity !== sharedQuantity) draft.errors.push('จำนวนอย่างละไม่ตรงกับจำนวนรายขนาด กรุณาระบุใหม่');
      line.quantity = sharedQuantity;
    }
    if (line.quantity !== undefined && (!Number.isSafeInteger(line.quantity) || line.quantity < 1)) draft.errors.push('จำนวนถังต้องเป็นจำนวนเต็มตั้งแต่ 1 ถัง');
  }
  const sizes = draft.items.map((line) => line.sizeKg).filter((size) => size !== undefined);
  if (new Set(sizes).size !== sizes.length) draft.errors.push('พบขนาดเดิมซ้ำ กรุณารวมจำนวนของแต่ละขนาดแล้วพูดใหม่');
  for (const token of [...tokens].reverse()) rest = rest.slice(0, token.start) + ' ' + rest.slice(token.end);

  rest = rest.replace(/^(?:\s*(?:เอ่อ|อ่า|ช่วย|ขอ|เอา|จัดส่ง(?!ที่)|ส่งแก๊ส|ส่ง(?!ที่)|แก๊ส)\s*)+/u, '');
  rest = cleanText(rest);

  const recipient = rest.match(/(?:ให้|ถึง)\s*((?:คุณ|ป้า|ลุง|น้า|พี่|นาย|นางสาว|นาง|เจ๊|ช่าง)\s*.+?)(?=ที่|\s+(?:บ้าน|ร้าน|ซอย|หมู่บ้าน)|$)/u);
  if (recipient) {
    draft.customerName = cleanText(recipient[1]);
    rest = rest.replace(recipient[0], ' ');
    rest = rest.replace(/^\s*ที่\s*/u, 'ส่งที่ ');
  }
  const named = rest.match(new RegExp(`(?:ชื่อลูกค้า|ลูกค้าชื่อ|ลูกค้า|ชื่อ)\\s*(.+?)(?=\\s*${locationStart}|$)`, 'u'));
  if (named) {
    draft.customerName = cleanText(named[1]);
    rest = rest.replace(named[0], ' ');
  }
  rest = rest.replace(/^\s*ที่(?!อยู่)\s*/u, 'ส่งที่ ');
  const address = rest.match(new RegExp(`${locationStart}.*`, 'u'));
  if (address) {
    draft.address = cleanText(address[0].replace(/^(?:ที่อยู่|จุดส่ง|จุดหมาย|ส่งที่)\s*[:：]?\s*/u, ''));
    if (plate) draft.address = `${draft.address} ${plate}`;
    if (!draft.customerName) {
      const houseName = draft.address.match(/^(?:บ้าน|ร้าน)\s*((?:คุณ|ป้า|ลุง|น้า|พี่|นาย|นางสาว|นาง)\s*.+?)(?=\s|หลังวัด|ข้าง|ตรงข้าม|ใกล้|ซอย|หมู่|เลขที่|$)/u);
      if (houseName) draft.customerName = cleanText(houseName[1]);
    }
    // A location-only order uses the destination as its customer label too.
    if (!draft.customerName && draft.address) draft.customerName = draft.address;
  }
  if (!draft.brand && !draft.items.length && !draft.customerName && !draft.address && !draft.phone) {
    draft.errors.push('ยังแยกรายการไม่ได้ ลองพูดว่า ส่งแก๊ส ปตท. ถังใหญ่ บ้านคุณสมชาย');
  }
  return draft;
}

export interface VoiceGasItem {
  id: string;
  brand: string;
  name: string;
  stock: number;
}

export function resolveVoiceGasItem<T extends VoiceGasItem>(items: T[], brand: VoiceGasBrand, sizeKg: VoiceGasSize, quantity: number) {
  const matches = items.filter((item) => item.brand === brand && gasSizeFromName(item.name) === sizeKg);
  if (matches.length !== 1) {
    return { error: matches.length ? `มีถัง ${brand} ${sizeKg} กก. หลายรายการ กรุณาเลือกเอง` : `ไม่พบถัง ${brand} ${sizeKg} กก. ในรายการร้าน กรุณาเลือกถังเอง` };
  }
  const item = matches[0];
  if (quantity > item.stock) return { error: `${item.name} เหลือ ${item.stock} ถัง ไม่พอสำหรับ ${quantity} ถัง` };
  return { item };
}

// Resolve every size before the caller changes any form state.
export function resolveVoiceGasOrder<T extends VoiceGasItem>(items: T[], brand: VoiceGasBrand, requested: GasVoiceLine[], fallbackSize?: VoiceGasSize) {
  const lines: Array<{ item: T; sizeKg: VoiceGasSize; quantity: number }> = [];
  if (!requested.length) return { error: 'ระบุรายการแก๊สอย่างน้อยหนึ่งขนาด' };
  for (const request of requested) {
    const sizeKg = request.sizeKg ?? (requested.length === 1 ? fallbackSize : undefined);
    if (!sizeKg) return { error: 'ระบุขนาดถังให้ครบ เช่น ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง' };
    const quantity = request.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1) return { error: 'จำนวนถังต้องเป็นจำนวนเต็มตั้งแต่ 1 ถัง' };
    const result = resolveVoiceGasItem(items, brand, sizeKg, quantity);
    const item = result.item;
    if (!item) return { error: result.error };
    if (lines.some((line) => line.item.id === item.id)) return { error: 'พบขนาดเดิมซ้ำ กรุณารวมจำนวนของแต่ละขนาดแล้วพูดใหม่' };
    lines.push({ item, sizeKg, quantity });
  }
  return { lines };
}
