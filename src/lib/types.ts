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
