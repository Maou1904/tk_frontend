export interface CartItem {
  id: string;
  name: string;
  barcode: string;
  price: number;
  quantity: number;
  discount: number;
  item_type: 'PRODUCT' | 'GAS' | 'LOTTERY' | 'TOPUP';
}