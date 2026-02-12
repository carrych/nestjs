import { ShippingStatus } from '../enums/shipping-status.enum';

export type DeliveryPayer = 'sender' | 'recipient';

export interface CreateShipmentInput {
  weight: number;
  seatsCount: number;
  declaredValue: number;
  description: string;
  payer?: DeliveryPayer;

  /** Recipient */
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientWarehouseRef?: string;
  recipientStreet?: string;
  recipientBuilding?: string;
  recipientFlat?: string;
}

export interface ShipmentResult {
  trackingNumber: string;
  documentId: string;
  estimatedDeliveryDate: string;
  shippingCost: number;
}

export interface TrackingResult {
  trackingNumber: string;
  status: ShippingStatus;
  statusCode: number;
  estimatedDeliveryDate: string;
  recipientAddress: string;
}
