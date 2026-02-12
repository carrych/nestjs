import { Injectable, Logger } from '@nestjs/common';
import { ShippingStatus } from '../enums/shipping-status.enum';
import {
  CreateShipmentInput,
  ShipmentResult,
  TrackingResult,
} from '../interfaces/delivery-service.interface';

/**
 * NP status code → our ShippingStatus.
 * Source: NovaPoshta API tracking status codes.
 */
const NP_STATUS_MAP: Record<number, ShippingStatus> = {
  1: ShippingStatus.PENDING,
  4: ShippingStatus.DELIVERING,
  5: ShippingStatus.DELIVERING,
  6: ShippingStatus.DELIVERING,
  41: ShippingStatus.DELIVERING,
  101: ShippingStatus.DELIVERING,
  104: ShippingStatus.DELIVERING,
  14: ShippingStatus.DELIVERING,
  7: ShippingStatus.ARRIVED,
  8: ShippingStatus.ARRIVED,
  112: ShippingStatus.ARRIVED,
  9: ShippingStatus.RECEIVED,
  10: ShippingStatus.RECEIVED,
  11: ShippingStatus.RECEIVED,
  106: ShippingStatus.RECEIVED,
  102: ShippingStatus.REFUSED,
  103: ShippingStatus.REFUSED,
  108: ShippingStatus.REFUSED,
  111: ShippingStatus.REFUSED,
};

/** Error codes indicating parcel size issues — should fail immediately. */
const PARCEL_ERROR_CODES = [
  '20000203729',
  '20000203730',
  '20000203731',
  '20000203732',
  '20000203733',
  '20000203734',
];

/** Error code meaning NP needs seat-level dimensions (retry with OptionsSeat). */
const NO_PARCEL_PARAMS_CODE = '20000200226';

@Injectable()
export class NovaPoshtaService {
  private readonly logger = new Logger(NovaPoshtaService.name);
  private readonly apiUrl = 'https://api.novaposhta.ua/v2.0/json/';

  private get apiKey(): string {
    const key = process.env.NP_API_KEY;
    if (!key) throw new Error('NP_API_KEY env variable is not set');
    return key;
  }

  // ────────────────── Public API ──────────────────

  /**
   * Create internet document (shipment) via NovaPoshta API.
   */
  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const sender = await this.getSenderInfo();

    const isWarehouse = !!input.recipientWarehouseRef;

    const contactRecipient = await this.createCounterparty({
      firstName: input.recipientName.split(' ')[1] || input.recipientName,
      lastName: input.recipientName.split(' ')[0] || '',
      phone: input.recipientPhone,
    });

    let recipientAddress: { ref: string; cityRef: string };
    if (isWarehouse) {
      const cityRef = await this.getWarehouseCity(input.recipientWarehouseRef!);
      recipientAddress = { ref: input.recipientWarehouseRef!, cityRef };
    } else {
      recipientAddress = await this.resolveAddress(
        sender.recipientRef,
        input.recipientCity,
        input.recipientStreet!,
        input.recipientBuilding!,
        input.recipientFlat,
      );
    }

    const payer = (input.payer || 'recipient').charAt(0).toUpperCase() + (input.payer || 'recipient').slice(1);

    const documentDTO = {
      PayerType: payer,
      PaymentMethod: 'Cash',
      CargoType: 'Cargo',
      Weight: input.weight,
      ServiceType: isWarehouse ? 'WarehouseWarehouse' : 'WarehouseDoors',
      SeatsAmount: input.seatsCount,
      Description: input.description,
      Cost: input.declaredValue,
      CitySender: sender.citySender,
      Sender: sender.senderRef,
      ContactSender: sender.contactSenderRef,
      SendersPhone: sender.sendersPhone,
      CityRecipient: recipientAddress.cityRef,
      Recipient: sender.recipientRef,
      RecipientAddress: recipientAddress.ref,
      ContactRecipient: contactRecipient,
      RecipientsPhone: input.recipientPhone,
    };

    const doc = await this.createInternetDocument(documentDTO);

    return {
      trackingNumber: doc.intDocNumber,
      documentId: doc.ref,
      estimatedDeliveryDate: doc.estimatedDeliveryDate || '',
      shippingCost: doc.costOnSite ? Number(doc.costOnSite) : 0,
    };
  }

  /**
   * Track shipment status by tracking number + recipient phone.
   */
  async trackShipment(
    trackingNumber: string,
    phone: string,
  ): Promise<TrackingResult> {
    const [status] = await this.callApi('TrackingDocument', 'getStatusDocuments', {
      Documents: [{ DocumentNumber: trackingNumber, Phone: phone }],
    });

    const statusCode = Number(status.StatusCode);

    return {
      trackingNumber,
      status: NP_STATUS_MAP[statusCode] ?? ShippingStatus.PENDING,
      statusCode,
      estimatedDeliveryDate: status.ScheduledDeliveryDate || '',
      recipientAddress: status.RecipientAddress || '',
    };
  }

  /**
   * Delete an internet document by its Ref.
   */
  async deleteShipment(documentRef: string): Promise<void> {
    await this.callApi('InternetDocument', 'delete', {
      DocumentRefs: documentRef,
    });
  }

  // ────────────────── Private helpers ──────────────────

  private async getSenderInfo() {
    const senderRes = await this.callApi('Counterparty', 'getCounterparties', {
      CounterpartyProperty: 'Sender',
      Page: '1',
    });

    const senderRef: string = senderRes[0].Ref;

    const contactRes = await this.callApi('Counterparty', 'getCounterpartyContactPersons', {
      Ref: senderRef,
      Page: '1',
    });

    const recipientRes = await this.callApi('Counterparty', 'getCounterparties', {
      CounterpartyProperty: 'Recipient',
      Page: '1',
    });

    // Determine city from sender's address
    const addressRes = await this.callApi('Counterparty', 'getCounterpartyAddresses', {
      Ref: senderRef,
      CounterpartyProperty: 'Sender',
    });
    const citySender = addressRes[0]?.CityRef || '';

    return {
      senderRef,
      contactSenderRef: contactRes[0].Ref,
      sendersPhone: contactRes[0].Phones,
      recipientRef: recipientRes[0].Ref,
      citySender,
    };
  }

  private async createCounterparty(person: {
    firstName: string;
    lastName: string;
    phone: string;
  }): Promise<string> {
    const data = await this.callApi('Counterparty', 'save', {
      FirstName: person.firstName,
      LastName: person.lastName,
      Phone: person.phone,
      CounterpartyType: 'PrivatePerson',
      CounterpartyProperty: 'Recipient',
    });

    return data[0].ContactPerson?.data?.[0]?.Ref || data[0].Ref;
  }

  private async resolveAddress(
    counterpartyRef: string,
    city: string,
    street: string,
    building: string,
    flat?: string,
  ): Promise<{ ref: string; cityRef: string }> {
    const cityRes = await this.callApi('Address', 'searchSettlements', {
      CityName: city,
      Limit: 5,
    });
    const cityRef = cityRes[0]?.Addresses?.[0]?.DeliveryCity;

    const streetRes = await this.callApi('Address', 'getStreet', {
      CityRef: cityRef,
      FindByString: street,
    });

    const addrRes = await this.callApi('Address', 'save', {
      CounterpartyRef: counterpartyRef,
      StreetRef: streetRes[0].Ref,
      BuildingNumber: building,
      Flat: flat || '',
    });

    return { ref: addrRes[0].Ref, cityRef };
  }

  private async getWarehouseCity(warehouseRef: string): Promise<string> {
    const data = await this.callApi('AddressGeneral', 'getWarehouses', {
      Ref: warehouseRef,
    });
    return data[0].CityRef;
  }

  private async createInternetDocument(documentDTO: Record<string, unknown>) {
    const res = await this.apiRequest('InternetDocument', 'save', documentDTO);

    const { data, errorCodes } = res;

    // Check for parcel size errors
    if (errorCodes?.length) {
      for (const code of errorCodes) {
        if (PARCEL_ERROR_CODES.includes(code)) {
          throw new Error(`Nova Poshta parcel parameters error (code: ${code})`);
        }
      }

      // If NP asks for seat-level dimensions, retry won't help without them
      if (errorCodes.includes(NO_PARCEL_PARAMS_CODE)) {
        this.logger.warn('Nova Poshta requested OptionsSeat, but none provided');
      }
    }

    if (!data?.[0]) {
      throw new Error(`Nova Poshta createInternetDocument failed: ${JSON.stringify(res)}`);
    }

    return data[0];
  }

  private async callApi(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, unknown>,
  ) {
    const res = await this.apiRequest(modelName, calledMethod, methodProperties);
    return res.data || [];
  }

  private async apiRequest(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, unknown>,
  ) {
    const body = {
      apiKey: this.apiKey,
      modelName,
      calledMethod,
      methodProperties,
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Nova Poshta API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
