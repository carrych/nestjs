import { Injectable, Logger } from '@nestjs/common';
import { ShippingStatus } from '../enums/shipping-status.enum';
import {
  CreateShipmentInput,
  IDeliveryService,
  ShipmentResult,
  TrackingResult,
} from '../interfaces/delivery-service.interface';

/**
 * UkrPoshta event status → our ShippingStatus.
 */
const UK_STATUS_MAP: Record<number, ShippingStatus> = {
  10100: ShippingStatus.DELIVERING,
  20700: ShippingStatus.DELIVERING,
  21500: ShippingStatus.DELIVERING,
  31300: ShippingStatus.DELIVERING,
  21700: ShippingStatus.ARRIVED,
  31100: ShippingStatus.ARRIVED,
  31400: ShippingStatus.ARRIVED,
  41000: ShippingStatus.RECEIVED,
  41010: ShippingStatus.REFUSED,
  31200: ShippingStatus.REFUSED,
};

@Injectable()
export class UkrPoshtaService implements IDeliveryService {
  private readonly logger = new Logger(UkrPoshtaService.name);
  private readonly baseUrl = 'https://dev.ukrposhta.ua/ecom/0.0.1/';
  private readonly trackingUrl = 'https://dev.ukrposhta.ua/status-traking/0.0.1/';

  private get token(): string {
    const t = process.env.UKRPOSHTA_TOKEN;
    if (!t) throw new Error('UKRPOSHTA_TOKEN env variable is not set');
    return t;
  }

  private get eComToken(): string {
    const t = process.env.UKRPOSHTA_ECOM;
    if (!t) throw new Error('UKRPOSHTA_ECOM env variable is not set');
    return t;
  }

  // ────────────────── Public API ──────────────────

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const senderAddress = await this.request('/addresses', 'POST', {
      postcode: process.env.UKRPOSHTA_SENDER_POSTCODE || '01001',
    });

    const sender = await this.request('/clients', 'POST', {
      firstName: process.env.UKRPOSHTA_SENDER_FIRST_NAME || 'Sender',
      lastName: process.env.UKRPOSHTA_SENDER_LAST_NAME || 'Shop',
      phoneNumber: process.env.UKRPOSHTA_SENDER_PHONE || '380000000000',
      addressId: senderAddress.id,
      type: 'INDIVIDUAL',
    });

    const recipientAddress = await this.request('/addresses', 'POST', {
      postcode: input.recipientCity, // postcode or city code
      houseNumber: input.recipientBuilding || '',
      apartmentNumber: input.recipientFlat || '',
    });

    const recipient = await this.request('/clients', 'POST', {
      firstName: input.recipientName.split(' ')[1] || input.recipientName,
      lastName: input.recipientName.split(' ')[0] || '',
      phoneNumber: input.recipientPhone,
      addressId: recipientAddress.id,
      type: 'INDIVIDUAL',
    });

    const isWarehouse = !!input.recipientWarehouseRef;

    const shipment = await this.request('/shipments', 'POST', {
      sender: { uuid: sender.uuid },
      recipient: { uuid: recipient.uuid },
      deliveryType: isWarehouse ? 'W2W' : 'W2D',
      parcels: [
        {
          weight: input.weight,
          length: input.seatsCount,
          declaredPrice: input.declaredValue,
          description: input.description,
          price: 0,
        },
      ],
      recipientAddressId: recipientAddress.id,
    });

    return {
      trackingNumber: shipment.barcode,
      documentId: shipment.uuid,
      estimatedDeliveryDate: shipment.deliveryDate || '',
      shippingCost: shipment.deliveryPrice ? Number(shipment.deliveryPrice) : 0,
    };
  }

  async trackShipment(trackingNumber: string, _phone?: string): Promise<TrackingResult> {
    try {
      const statusData = await this.request(
        `statuses/last?barcode=${trackingNumber}`,
        'GET',
        undefined,
        this.trackingUrl,
      );

      const eventCode = parseInt(statusData.event, 10);

      return {
        trackingNumber,
        status: UK_STATUS_MAP[eventCode] ?? ShippingStatus.PENDING,
        statusCode: eventCode,
        estimatedDeliveryDate: '',
        recipientAddress: '',
      };
    } catch {
      return {
        trackingNumber,
        status: ShippingStatus.PENDING,
        statusCode: 0,
        estimatedDeliveryDate: '',
        recipientAddress: '',
      };
    }
  }

  // ────────────────── Private helpers ──────────────────

  private async request(path: string, method: string, body?: unknown, baseUrl?: string) {
    const url = `${baseUrl || this.baseUrl}${path}?token=${this.token}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.eComToken}`,
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`UkrPoshta API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
