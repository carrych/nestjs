import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ShippingCarrier } from '../enums/shipping-carrier.enum';
import { DeliveryServiceFactory } from '../services/delivery-service.factory';
import { NovaPoshtaService } from '../services/nova-poshta.service';
import { UkrPoshtaService } from '../services/ukr-poshta.service';

const mockNovaPoshtaService = { createShipment: jest.fn(), trackShipment: jest.fn() };
const mockUkrPoshtaService = { createShipment: jest.fn(), trackShipment: jest.fn() };

describe('DeliveryServiceFactory', () => {
  let factory: DeliveryServiceFactory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryServiceFactory,
        { provide: NovaPoshtaService, useValue: mockNovaPoshtaService },
        { provide: UkrPoshtaService, useValue: mockUkrPoshtaService },
      ],
    }).compile();

    factory = module.get<DeliveryServiceFactory>(DeliveryServiceFactory);
  });

  it('returns NovaPoshtaService for NOVA_POSHTA carrier', () => {
    const service = factory.create(ShippingCarrier.NOVA_POSHTA);
    expect(service).toBe(mockNovaPoshtaService);
  });

  it('returns UkrPoshtaService for UKR_POSHTA carrier', () => {
    const service = factory.create(ShippingCarrier.UKR_POSHTA);
    expect(service).toBe(mockUkrPoshtaService);
  });

  it('throws BadRequestException for unknown carrier', () => {
    expect(() => factory.create('meest' as ShippingCarrier)).toThrow(BadRequestException);
  });
});
