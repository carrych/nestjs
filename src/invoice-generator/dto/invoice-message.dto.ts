export interface InvoiceItem {
  productId: number;
  quantity: number;
  price: number;
  discount: number;
}

export interface InvoiceMessage {
  orderId: number;
  userId: number;
  type: string;
  correlationId?: string;
  items: InvoiceItem[];
}
