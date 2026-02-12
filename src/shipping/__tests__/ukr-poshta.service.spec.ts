import { Test, TestingModule } from '@nestjs/testing';
import { UkrPoshtaService } from '../services/ukr-poshta.service';
import { ShippingStatus } from '../enums/shipping-status.enum';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('UkrPoshtaService', () => {
  let service: UkrPoshtaService;

  beforeEach(async () => {
    process.env.UKRPOSHTA_TOKEN = 'test-token';
    process.env.UKRPOSHTA_ECOM = 'test-ecom';
    process.env.UKRPOSHTA_SENDER_POSTCODE = '01001';
    process.env.UKRPOSHTA_SENDER_FIRST_NAME = 'Shop';
    process.env.UKRPOSHTA_SENDER_LAST_NAME = 'Test';
    process.env.UKRPOSHTA_SENDER_PHONE = '380501111111';

    const module: TestingModule = await Test.createTestingModule({
      providers: [UkrPoshtaService],
    }).compile();

    service = module.get<UkrPoshtaService>(UkrPoshtaService);
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.UKRPOSHTA_TOKEN;
    delete process.env.UKRPOSHTA_ECOM;
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
    it('should return ARRIVED for status event 21700', async () => {
      mockApiResponse({ event: '21700' });

      const result = await service.trackShipment('UA123456789');

      expect(result.trackingNumber).toBe('UA123456789');
      expect(result.status).toBe(ShippingStatus.ARRIVED);
      expect(result.statusCode).toBe(21700);
    });

    it('should map delivering events correctly', async () => {
      for (const event of [10100, 20700, 21500, 31300]) {
        mockFetch.mockReset();
        mockApiResponse({ event: String(event) });

        const result = await service.trackShipment('UA1');
        expect(result.status).toBe(ShippingStatus.DELIVERING);
      }
    });

    it('should map received event 41000', async () => {
      mockApiResponse({ event: '41000' });

      const result = await service.trackShipment('UA1');
      expect(result.status).toBe(ShippingStatus.RECEIVED);
    });

    it('should map refused events correctly', async () => {
      for (const event of [41010, 31200]) {
        mockFetch.mockReset();
        mockApiResponse({ event: String(event) });

        const result = await service.trackShipment('UA1');
        expect(result.status).toBe(ShippingStatus.REFUSED);
      }
    });

    it('should default to PENDING when tracking API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.trackShipment('UA1');
      expect(result.status).toBe(ShippingStatus.PENDING);
      expect(result.statusCode).toBe(0);
    });

    it('should default to PENDING for unknown event code', async () => {
      mockApiResponse({ event: '99999' });

      const result = await service.trackShipment('UA1');
      expect(result.status).toBe(ShippingStatus.PENDING);
    });
  });

  describe('createShipment', () => {
    it('should call UkrPoshta API sequence and return shipment result', async () => {
      // Create sender address
      mockApiResponse({ id: 1 });
      // Create sender client
      mockApiResponse({ uuid: 'sender-uuid' });
      // Create recipient address
      mockApiResponse({ id: 2 });
      // Create recipient client
      mockApiResponse({ uuid: 'recipient-uuid' });
      // Create shipment
      mockApiResponse({
        barcode: 'UA987654321',
        uuid: 'shipment-uuid',
        deliveryDate: '2025-06-22',
        deliveryPrice: '95',
      });

      const result = await service.createShipment({
        weight: 2.0,
        seatsCount: 1,
        declaredValue: 3000,
        description: 'Test parcel',
        recipientName: 'Petrov Petro',
        recipientPhone: '380509876543',
        recipientCity: '01001',
      });

      expect(result.trackingNumber).toBe('UA987654321');
      expect(result.documentId).toBe('shipment-uuid');
      expect(result.shippingCost).toBe(95);
      expect(result.estimatedDeliveryDate).toBe('2025-06-22');

      // Verify auth headers were sent
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1].headers.Authorization).toBe('Bearer test-ecom');
    });
  });

  describe('error handling', () => {
    it('should throw when UKRPOSHTA_TOKEN is not set', async () => {
      delete process.env.UKRPOSHTA_TOKEN;

      mockFetch.mockRejectedValueOnce(new Error('should not reach'));

      await expect(
        service.createShipment({
          weight: 1,
          seatsCount: 1,
          declaredValue: 100,
          description: 'test',
          recipientName: 'Test',
          recipientPhone: '380501234567',
          recipientCity: '01001',
        }),
      ).rejects.toThrow('UKRPOSHTA_TOKEN env variable is not set');
    });
  });
});
