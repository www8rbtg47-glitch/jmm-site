export type ColorDTO = {
  id: string;
  name: string;
  hex: string;
};

export type LengthOptionDTO = {
  id: string;
  value: number;
};

export type StockEntryDTO = {
  colorId: string;
  lengthOptionId: string;
  quantity: number;
};

export type ProductDTO = {
  id: string;
  name: string;
  description: string;
  pricePerUnit: number;
  categoryId: string;
  categoryLabel: string;
  unitId: string;
  unitLabel: string;
  colors: ColorDTO[];
  lengths: LengthOptionDTO[];
  stock: StockEntryDTO[];
};

export type CategoryDTO = { id: string; label: string };
export type UnitDTO = { id: string; label: string };

export type CartItemDTO = {
  productId: string;
  productName: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  lengthOptionId: string;
  length: number;
  quantity: number;
  pricePerUnit: number;
};

export type CustomerInfoDTO = {
  name: string;
  email: string;
  phone: string;
};

export type OrderItemDTO = {
  id: string;
  productId: string | null;
  productName: string;
  colorId: string | null;
  colorName: string;
  lengthOptionId: string | null;
  length: number;
  quantity: number;
  pricePerUnit: number;
};

export type OrderStatus = "en_attente" | "confirmee" | "refusee";

export type OrderDTO = {
  id: string;
  status: OrderStatus;
  paymentMethod: string;
  total: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  adminNote: string;
  createdAt: string;
  confirmedAt: string | null;
  items: OrderItemDTO[];
};
