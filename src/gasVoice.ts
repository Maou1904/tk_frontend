// A deliberately bounded parser for the shop's gas-order vocabulary.
// Speech recognition supplies text; this module never invents customer details.
export type VoiceGasBrand = 'สยาม' | 'ปตท';
export type VoiceGasSize = 4 | 15;

export interface GasVoiceDraft {
  brand?: VoiceGasBrand;
  sizeKg?: VoiceGasSize;
  quantity?: number;
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
    .replace(/(?:\s*(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ|ด้วย|หน่อย))+$/u, '').trim();
}

export function gasSizeFromName(name: string): VoiceGasSize | undefined {
  const small = /(?:^|[^0-9])4\s*(?:kg|กก\.?|กิโล(?:กรัม)?|โล)|ถังเล็ก/i.test(name);
  const large = /(?:^|[^0-9])15\s*(?:kg|กก\.?|กิโล(?:กรัม)?|โล)|ถังใหญ่/i.test(name);
  return small === large ? undefined : small ? 4 : 15;
}

export function parseGasVoice(text: string): GasVoiceDraft {
  const draft: GasVoiceDraft = { notes: [], errors: [] };
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
  rest = rest.replace(/ป\s*\.?\s*ต\s*\.?\s*ท\s*\.?|ปอ\s*ตอ\s*ทอ|\bptt\b|\bor\b|สยาม(?:แก๊ส)?/gi, (word) => {
    brands.add(/สยาม/.test(word) ? 'สยาม' : 'ปตท');
    return ' ';
  });
  if (brands.size > 1) draft.errors.push('พบทั้งสยามและ ปตท. กรุณาพูดทีละยี่ห้อ');
  else draft.brand = [...brands][0];

  // "สองถังใหญ่" carries a count as well as a size. Keep the size words.
  const quantities = new Set<number>();
  rest = rest.replace(new RegExp(`(${countToken})\\s*(ถัง\\s*(?:ใหญ่|เล็ก))`, 'g'), (_word, count: string, size: string) => {
    quantities.add(parseCount(count));
    return ` ${size} `;
  });
  const sizes = new Set<VoiceGasSize>();
  rest = rest.replace(/ถัง\s*(ใหญ่|เล็ก)|((?:\d+|สิบห้า|สี่))\s*(?:กิโลกรัม|กิโล|กก\.?|kg|โล)/gi, (_word, label: string | undefined, number: string | undefined) => {
    const size = label ? (label === 'ใหญ่' ? 15 : 4) : parseCount(number!);
    if (size === 4 || size === 15) sizes.add(size);
    else draft.errors.push('ตัวทดลองรองรับถัง 4 และ 15 กก. กรุณาเลือกขนาดเอง');
    return ' ';
  });
  if (sizes.size > 1) draft.errors.push('พบหลายขนาด กรุณาพูดทีละขนาดถัง');
  else draft.sizeKg = [...sizes][0];

  // Return counts must never become the number of full cylinders being sold.
  rest = rest.replace(new RegExp(`(?:จ่ายแล้ว|ยังไม่จ่าย|ค้างจ่าย|คืนถัง(?:เปล่า)?(?:\\s*${countToken}\\s*(?:ถัง)?)?)`, 'g'), () => {
    draft.notes.push('ตรวจคนส่ง การจ่ายเงิน และจำนวนถังคืนในฟอร์มเอง');
    return ' ';
  });
  rest = rest.replace(new RegExp(`(?:จำนวน\\s*)?(${countToken})\\s*ถัง`, 'g'), (_word, count: string) => {
    quantities.add(parseCount(count));
    return ' ';
  });
  if (quantities.size > 1) draft.errors.push('พบหลายจำนวน กรุณาพูดจำนวนถังเพียงครั้งเดียว');
  else if (quantities.size === 1) {
    draft.quantity = [...quantities][0];
    if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1) draft.errors.push('จำนวนถังต้องเป็นจำนวนเต็มตั้งแต่ 1 ถัง');
  }
  if (/(?:ครึ่ง|หลาย|ร้อย|พัน|ล้าน)\s*ถัง/.test(rest)) draft.errors.push('ยังแยกจำนวนถังไม่ได้ กรุณาระบุจำนวนเป็นตัวเลขแล้วตามด้วยคำว่าถัง');

  rest = rest.replace(/^(?:\s*(?:เอ่อ|อ่า|ช่วย|ขอ|เอา|จัดส่ง|ส่งแก๊ส|ส่ง|แก๊ส)\s*)+/u, '');
  rest = cleanText(rest);

  const named = rest.match(new RegExp(`(?:ชื่อลูกค้า|ลูกค้าชื่อ|ลูกค้า|ชื่อ)\\s*(.+?)(?=\\s*${locationStart}|$)`, 'u'));
  if (named) {
    draft.customerName = cleanText(named[1]);
    rest = rest.replace(named[0], ' ');
  }
  const address = rest.match(new RegExp(`${locationStart}.*`, 'u'));
  if (address) {
    draft.address = cleanText(address[0].replace(/^(?:ที่อยู่|จุดส่ง|จุดหมาย|ส่งที่)\s*[:：]?\s*/u, ''));
    if (!draft.customerName) {
      const houseName = draft.address.match(/^(?:บ้าน|ร้าน)\s*((?:คุณ|ป้า|ลุง|น้า|พี่|นาย|นางสาว|นาง)\s*.+?)(?=\s|หลังวัด|ข้าง|ตรงข้าม|ใกล้|ซอย|หมู่|เลขที่|$)/u);
      if (houseName) draft.customerName = cleanText(houseName[1]);
    }
  }
  if (!draft.brand && !draft.sizeKg && !draft.quantity && !draft.customerName && !draft.address && !draft.phone) {
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
