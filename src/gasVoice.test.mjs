import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gasSizeFromName, parseGasVoice, resolveVoiceGasItem } from './gasVoice.ts';

test('the spoken example works without spaces before the trailing brand', () => {
  const draft = parseGasVoice('เอ่อ ส่งแก๊สถังใหญ่ บ้านคุณสมชายปตท.');
  assert.deepEqual(draft.errors, []);
  assert.equal(draft.brand, 'ปตท');
  assert.equal(draft.sizeKg, 15);
  assert.equal(draft.customerName, 'คุณสมชาย');
  assert.equal(draft.address, 'บ้านคุณสมชาย');
  assert.equal(draft.quantity, undefined);
  assert.equal(draft.phone, undefined);
});

test('brand and size can occur before or after the destination', () => {
  for (const phrase of ['ส่งแก๊ส สยาม ถังเล็ก สองถัง บ้านป้าสมศรี หลังวัด', 'บ้านป้าสมศรี หลังวัด สองถัง สยาม ถังเล็ก']) {
    const draft = parseGasVoice(phrase);
    assert.deepEqual(draft.errors, []);
    assert.equal(draft.brand, 'สยาม');
    assert.equal(draft.sizeKg, 4);
    assert.equal(draft.quantity, 2);
    assert.equal(draft.customerName, 'ป้าสมศรี');
    assert.equal(draft.address, 'บ้านป้าสมศรี หลังวัด');
  }
});

test('explicit name and house number are separated without inventing a full address', () => {
  const draft = parseGasVoice('ส่งแก๊ส ป.ต.ท. สิบห้ากิโล ๒ ถัง ลูกค้าคุณสมชาย ที่อยู่บ้านเลขที่ 12/3 หลังวัด');
  assert.deepEqual(draft.errors, []);
  assert.equal(draft.quantity, 2);
  assert.equal(draft.customerName, 'คุณสมชาย');
  assert.equal(draft.address, 'บ้านเลขที่ 12/3 หลังวัด');
});

test('a landmark alone never becomes a made-up customer name', () => {
  const draft = parseGasVoice('ส่งแก๊ส ปตท ถังเล็ก ส่งที่หลังวัด');
  assert.equal(draft.address, 'หลังวัด');
  assert.equal(draft.customerName, undefined);
});

test('counts before the size and the spoken unit lo are not lost', () => {
  for (const phrase of ['ส่งแก๊ส ปตท สองถังใหญ่ บ้านคุณสมชาย', 'ส่งแก๊ส ปตท สิบห้าโล สองถัง บ้านคุณสมชาย']) {
    const draft = parseGasVoice(phrase);
    assert.deepEqual(draft.errors, []);
    assert.equal(draft.sizeKg, 15);
    assert.equal(draft.quantity, 2);
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

test('conflicting brands, sizes, counts, cancellation and fractional counts require correction', () => {
  for (const phrase of [
    'ส่งแก๊ส ปตท สยาม ถังใหญ่ บ้านคุณสมชาย',
    'ส่งแก๊ส ปตท ถังใหญ่ ถังเล็ก บ้านคุณสมชาย',
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
  assert.equal(draft.quantity, 2);
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
