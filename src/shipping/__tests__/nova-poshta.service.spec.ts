import { Test, TestingModule } from '@nestjs/testing';
import { NovaPoshtaService } from '../services/nova-poshta.service';
import { ShippingStatus } from '../enums/shipping-status.enum';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('NovaPoshtaService', () => {
  let service: NovaPoshtaService;

  beforeEach(async () => {
    process.env.NP_API_KEY = 'test-api-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [NovaPoshtaService],
    }).compile();

    service = module.get<NovaPoshtaService>(NovaPoshtaService);
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.NP_API_KEY;
  });

  function mockApiResponse(data: unknown, ok = true) {
    mockFetch.mockResolvedValueOnce({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Internal Server Error',
      json: () => Promise.resolve(data),
    });
  }

  describe('trackShipment', () => {
    it('should return tracking result with mapped status', async () => {
      mockApiResponse({
        data: [
          {
            StatusCode: '7',
            ScheduledDeliveryDate: '2025-06-15',
            RecipientAddress: 'Kyiv, Branch #5',
          },
        ],
      });

      const result = await service.trackShipment('20450012345678', '380501234567');

      expect(result.trackingNumber).toBe('20450012345678');
      expect(result.status).toBe(ShippingStatus.ARRIVED);
      expect(result.statusCode).toBe(7);
      expect(result.estimatedDeliveryDate).toBe('2025-06-15');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.novaposhta.ua/v2.0/json/');
      const body = JSON.parse(options.body);
      expect(body.apiKey).toBe('test-api-key');
      expect(body.calledMethod).toBe('getStatusDocuments');
    });

    it('should map delivering status codes correctly', async () => {
      for (const code of [4, 5, 6, 41, 101, 104, 14]) {
        mockFetch.mockReset();
        mockApiResponse({
          data: [{ StatusCode: String(code), ScheduledDeliveryDate: '', RecipientAddress: '' }],
        });

        const result = await service.trackShipment('123', '380501234567');
        expect(result.status).toBe(ShippingStatus.DELIVERING);
      }
    });

    it('should map received status codes correctly', async () => {
      for (const code of [9, 10, 11, 106]) {
        mockFetch.mockReset();
        mockApiResponse({
          data: [{ StatusCode: String(code), ScheduledDeliveryDate: '', RecipientAddress: '' }],
        });

        const result = await service.trackShipment('123', '380501234567');
        expect(result.status).toBe(ShippingStatus.RECEIVED);
      }
    });

    it('should map refused status codes correctly', async () => {
      for (const code of [102, 103, 108, 111]) {
        mockFetch.mockReset();
        mockApiResponse({
          data: [{ StatusCode: String(code), ScheduledDeliveryDate: '', RecipientAddress: '' }],
        });

        const result = await service.trackShipment('123', '380501234567');
        expect(result.status).toBe(ShippingStatus.REFUSED);
      }
    });

    it('should default to PENDING for unknown status codes', async () => {
      mockApiResponse({
        data: [{ StatusCode: '999', ScheduledDeliveryDate: '', RecipientAddress: '' }],
      });

      const result = await service.trackShipment('123', '380501234567');
      expect(result.status).toBe(ShippingStatus.PENDING);
    });
  });

  describe('deleteShipment', () => {
    it('should call NP API with delete method', async () => {
      mockApiResponse({ data: [{ Ref: 'some-ref' }] });

      await service.deleteShipment('some-document-ref');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.calledMethod).toBe('delete');
      expect(body.modelName).toBe('InternetDocument');
      expect(body.methodProperties.DocumentRefs).toBe('some-document-ref');
    });
  });

  describe('createShipment', () => {
    it('should call NP API sequence and return shipment result', async () => {
      // getSenderInfo: getCounterparties (sender)
      mockApiResponse({ data: [{ Ref: 'sender-ref' }] });
      // getSenderInfo: getCounterpartyContactPersons
      mockApiResponse({ data: [{ Ref: 'contact-sender-ref', Phones: '380501111111' }] });
      // getSenderInfo: getCounterparties (recipient)
      mockApiResponse({ data: [{ Ref: 'recipient-ref' }] });
      // getSenderInfo: getCounterpartyAddresses
      mockApiResponse({ data: [{ CityRef: 'city-sender-ref' }] });
      // createCounterparty
      mockApiResponse({ data: [{ ContactPerson: { data: [{ Ref: 'contact-recipient-ref' }] } }] });
      // getWarehouseCity
      mockApiResponse({ data: [{ CityRef: 'city-recipient-ref' }] });
      // createInternetDocument (NP API returns PascalCase)
      mockApiResponse({
        data: [
          {
            Ref: 'doc-ref-123',
            IntDocNumber: '20450099887766',
            EstimatedDeliveryDate: '2025-06-20',
            CostOnSite: '85',
          },
        ],
        errorCodes: [],
      });

      const result = await service.createShipment({
        weight: 1.5,
        seatsCount: 1,
        declaredValue: 5000,
        description: 'Test parcel',
        recipientName: 'Ivanov Ivan',
        recipientPhone: '380509876543',
        recipientCity: 'Kyiv',
        recipientWarehouseRef: 'warehouse-ref-123',
      });

      expect(result.trackingNumber).toBe('20450099887766');
      expect(result.documentId).toBe('doc-ref-123');
      expect(result.shippingCost).toBe(85);
      expect(result.estimatedDeliveryDate).toBe('2025-06-20');
    });
  });

  describe('error handling', () => {
    it('should throw when NP_API_KEY is not set', async () => {
      delete process.env.NP_API_KEY;

      await expect(service.trackShipment('123', '380501234567')).rejects.toThrow(
        'NP_API_KEY env variable is not set',
      );
    });

    it('should throw on API HTTP error', async () => {
      mockApiResponse(null, false);

      await expect(service.trackShipment('123', '380501234567')).rejects.toThrow(
        'Nova Poshta API error',
      );
    });
  });
});
