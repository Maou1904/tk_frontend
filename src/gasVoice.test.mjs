import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gasSizeFromName, parseGasVoice, resolveVoiceGasItem, resolveVoiceGasOrder } from './gasVoice.ts';

test('the spoken example works without spaces before the trailing brand', () => {
  const draft = parseGasVoice('เอ่อ ส่งแก๊สถังใหญ่ บ้านคุณสมชายปตท.');
  assert.deepEqual(draft.errors, []);
  assert.equal(draft.brand, 'ปตท');
  assert.equal(draft.items[0].sizeKg, 15);
  assert.equal(draft.customerName, 'คุณสมชาย');
  assert.equal(draft.address, 'บ้านคุณสมชาย');
  assert.equal(draft.items[0].quantity, undefined);
  assert.equal(draft.phone, undefined);
});

test('brand and size can occur before or after the destination', () => {
  for (const phrase of ['ส่งแก๊ส สยาม ถังเล็ก สองถัง บ้านป้าสมศรี หลังวัด', 'บ้านป้าสมศรี หลังวัด สองถัง สยาม ถังเล็ก']) {
    const draft = parseGasVoice(phrase);
    assert.deepEqual(draft.errors, []);
    assert.equal(draft.brand, 'สยาม');
    assert.equal(draft.items[0].sizeKg, 4);
    assert.equal(draft.items[0].quantity, 2);
    assert.equal(draft.customerName, 'ป้าสมศรี');
    assert.equal(draft.address, 'บ้านป้าสมศรี หลังวัด');
  }
});

test('explicit name and house number are separated without inventing a full address', () => {
  const draft = parseGasVoice('ส่งแก๊ส ป.ต.ท. สิบห้ากิโล ๒ ถัง ลูกค้าคุณสมชาย ที่อยู่บ้านเลขที่ 12/3 หลังวัด');
  assert.deepEqual(draft.errors, []);
  assert.equal(draft.items[0].quantity, 2);
  assert.equal(draft.customerName, 'คุณสมชาย');
  assert.equal(draft.address, 'บ้านเลขที่ 12/3 หลังวัด');
});

test('a landmark alone fills both destination and customer label', () => {
  const draft = parseGasVoice('ส่งแก๊ส ปตท ถังเล็ก ส่งที่หลังวัด');
  assert.equal(draft.address, 'หลังวัด');
  assert.equal(draft.customerName, 'หลังวัด');
});

test('counts before the size and the spoken unit lo are not lost', () => {
  for (const phrase of ['ส่งแก๊ส ปตท สองถังใหญ่ บ้านคุณสมชาย', 'ส่งแก๊ส ปตท สิบห้าโล สองถัง บ้านคุณสมชาย']) {
    const draft = parseGasVoice(phrase);
    assert.deepEqual(draft.errors, []);
    assert.equal(draft.items[0].sizeKg, 15);
    assert.equal(draft.items[0].quantity, 2);
  }
});

test('Thai phone digits and numeric phone strings are accepted only when complete', () => {
  for (const phone of ['081-234-5678', 'ศูนย์แปดหนึ่งสองสามสี่ห้าหกเจ็ดแปด']) {
    const draft = parseGasVoice(`ส่งแก๊ส PTT ถังใหญ่ บ้านคุณสมชาย เบอร์โทร ${phone}`);
    assert.equal(draft.phone, '0812345678');
    assert.equal(draft.address, 'บ้านคุณสมชาย');
  }
  const incomplete = parseGasVoice('ส่งแก๊ส ปตท ถังใหญ่ บ้านคุณสมชาย เบอร์ 08123');
  assert.equal(incomplete.phone, undefined);
  assert.equal(incomplete.notes.length, 1);
});

test('conflicting brands, duplicate sizes, counts, cancellation and fractional counts require correction', () => {
  for (const phrase of [
    'ส่งแก๊ส ปตท สยาม ถังใหญ่ บ้านคุณสมชาย',
    'ส่งแก๊ส ปตท ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ถังใหญ่ 1 ถัง บ้านคุณสมชาย',
    'ส่งแก๊ส ปตท ถังใหญ่ 2 ถัง 3 ถัง บ้านคุณสมชาย',
    'ส่งแก๊ส ปตท ถังใหญ่ 0 ถัง บ้านคุณสมชาย',
    'ส่งแก๊ส ปตท ถังใหญ่ 1.5 ถัง บ้านคุณสมชาย',
    'ไม่เอา ปตท เอาสยาม ถังใหญ่ บ้านคุณสมชาย',
    'ส่งแก๊ส ปตท 48 กิโล บ้านคุณสมชาย',
    '',
  ]) assert.ok(parseGasVoice(phrase).errors.length, phrase);
});

test('return quantities and paid status do not become order quantities', () => {
  const draft = parseGasVoice('ส่งแก๊ส ปตท ถังใหญ่ 2 ถัง คืนถัง 1 ถัง จ่ายแล้ว บ้านคุณสมชาย');
  assert.deepEqual(draft.errors, []);
  assert.equal(draft.items[0].quantity, 2);
  assert.equal(draft.address, 'บ้านคุณสมชาย');
  assert.ok(draft.notes.length > 0);
  assert.equal('paid' in draft, false);
});

test('inventory matching is exact by brand and size and rejects missing or ambiguous products', () => {
  const items = [
    { id: 'ptt15', brand: 'ปตท', name: 'ถังแก๊ส 15 KG', stock: 3 },
    { id: 'siam15', brand: 'สยาม', name: 'ถังแก๊ส 15 กก.', stock: 7 },
    { id: 'ptt4', brand: 'ปตท', name: 'ถังแก๊ส 4 กก.', stock: 0 },
  ];
  assert.equal(resolveVoiceGasItem(items, 'ปตท', 15, 1).item.id, 'ptt15');
  assert.ok(resolveVoiceGasItem(items, 'ปตท', 15, 4).error);
  assert.ok(resolveVoiceGasItem(items, 'ปตท', 4, 1).error);
  assert.ok(resolveVoiceGasItem(items, 'สยาม', 4, 1).error);
  assert.ok(resolveVoiceGasItem([...items, { ...items[0], id: 'duplicate' }], 'ปตท', 15, 1).error);
  assert.equal(gasSizeFromName('ถังแก๊ส 115 กก.'), undefined);
  assert.equal(gasSizeFromName('ถังแก๊ส 4 กก. หรือ 15 กก.'), undefined);
});

test('multiple sizes retain their own counts regardless of order or count syntax', () => {
  for (const phrase of [
    'ปตท ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ส่งที่หลังวัด',
    'ปตท สองถังใหญ่กับหนึ่งถังเล็ก ส่งที่หลังวัด',
    'ปตท 15 กิโล 2 ถัง 4 กิโล 1 ถัง ส่งที่หลังวัด',
    'ส่งที่หลังวัด ปตท ถังใหญ่สองถัง และถังเล็กหนึ่งถัง',
  ]) {
    const draft = parseGasVoice(phrase);
    assert.deepEqual(draft.errors, [], phrase);
    assert.deepEqual(draft.items, [{ sizeKg: 15, quantity: 2 }, { sizeKg: 4, quantity: 1 }], phrase);
    assert.equal(draft.customerName, 'หลังวัด');
    assert.equal(draft.address, 'หลังวัด');
  }
  const reverse = parseGasVoice('ปตท ถังเล็ก 3 ถัง ถังใหญ่ 1 ถัง ส่งที่หลังวัด');
  assert.deepEqual(reverse.items, [{ sizeKg: 4, quantity: 3 }, { sizeKg: 15, quantity: 1 }]);
});

test('shared counts and omitted counts are distinct for each size', () => {
  assert.deepEqual(parseGasVoice('ปตท ถังใหญ่กับถังเล็ก อย่างละสองถัง').items, [{ sizeKg: 15, quantity: 2 }, { sizeKg: 4, quantity: 2 }]);
  const omitted = parseGasVoice('ปตท ถังใหญ่และถังเล็ก ส่งที่หลังวัด');
  assert.deepEqual(omitted.errors, []);
  assert.deepEqual(omitted.items, [{ sizeKg: 15 }, { sizeKg: 4 }]);
  const partlyOmitted = parseGasVoice('ปตท ถังใหญ่ ถังเล็ก 3 ถัง ส่งที่หลังวัด');
  assert.deepEqual(partlyOmitted.items, [{ sizeKg: 15 }, { sizeKg: 4, quantity: 3 }]);
  assert.ok(parseGasVoice('ปตท ถังใหญ่ 2 ถัง ถังเล็ก อย่างละ3ถัง').errors.length);
  assert.deepEqual(parseGasVoice('ปตท ถังใหญ่ 15 กิโล 2 ถัง').items, [{ sizeKg: 15, quantity: 2 }]);
});

test('explicit names take priority over location labels; missing identity stays absent', () => {
  const explicit = parseGasVoice('ปตท ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง ลูกค้าคุณสมชาย ส่งที่หลังวัด');
  assert.equal(explicit.customerName, 'คุณสมชาย');
  assert.equal(explicit.address, 'หลังวัด');
  const absent = parseGasVoice('ปตท ถังใหญ่ 2 ถัง ถังเล็ก 1 ถัง');
  assert.equal(absent.customerName, undefined);
  assert.equal(absent.address, undefined);
  const place = parseGasVoice('ปตท ถังใหญ่ ส่งที่อู่ช่างชัย');
  assert.equal(place.customerName, 'อู่ช่างชัย');
  assert.equal(place.address, 'อู่ช่างชัย');
});

test('the actual shop phrase separates a recipient and the place after thi', () => {
  const single = parseGasVoice('ส่งปตทถังใหญ่ 1 ถังให้คุณเจเจที่ดอนภูตา');
  assert.deepEqual(single.errors, []);
  assert.deepEqual(single.items, [{ sizeKg: 15, quantity: 1 }]);
  assert.equal(single.customerName, 'คุณเจเจ');
  assert.equal(single.address, 'ดอนภูตา');
  const mixed = parseGasVoice('ส่งปตทถังใหญ่ 2 ถัง ถังเล็ก1ถังให้คุณเจเจที่ดอนภูตา');
  assert.deepEqual(mixed.errors, []);
  assert.deepEqual(mixed.items, [{ sizeKg: 15, quantity: 2 }, { sizeKg: 4, quantity: 1 }]);
  assert.equal(mixed.customerName, 'คุณเจเจ');
  assert.equal(mixed.address, 'ดอนภูตา');
});

test('all sizes resolve together; a later missing or insufficient size cannot return a partial order', () => {
  const items = [
    { id: 'ptt15', brand: 'ปตท', name: 'ถังแก๊ส 15 KG', stock: 3 },
    { id: 'ptt4', brand: 'ปตท', name: 'ถังแก๊ส 4 KG', stock: 2 },
  ];
  const requested = [{ sizeKg: 15, quantity: 2 }, { sizeKg: 4, quantity: 1 }];
  const result = resolveVoiceGasOrder(items, 'ปตท', requested);
  assert.deepEqual(result.lines.map((line) => [line.item.id, line.quantity]), [['ptt15', 2], ['ptt4', 1]]);
  const insufficient = resolveVoiceGasOrder(items, 'ปตท', [{ sizeKg: 15, quantity: 2 }, { sizeKg: 4, quantity: 3 }]);
  assert.ok(insufficient.error);
  assert.equal(insufficient.lines, undefined);
  assert.equal(resolveVoiceGasOrder(items.slice(0, 1), 'ปตท', requested).lines, undefined);
  assert.ok(resolveVoiceGasOrder(items, 'ปตท', [{ sizeKg: 15, quantity: 2 }, { sizeKg: 15, quantity: 2 }]).error);
  assert.deepEqual(resolveVoiceGasOrder(items, 'ปตท', [{ sizeKg: 15 }, { sizeKg: 4 }]).lines.map((line) => line.quantity), [1, 1]);
});
