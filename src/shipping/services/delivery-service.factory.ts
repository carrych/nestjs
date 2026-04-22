import { BadRequestException, Injectable } from '@nestjs/common';

import { ShippingCarrier } from '../enums/shipping-carrier.enum';
import { IDeliveryService } from '../interfaces/delivery-service.interface';
import { NovaPoshtaService } from './nova-poshta.service';
import { UkrPoshtaService } from './ukr-poshta.service';

@Injectable()
export class DeliveryServiceFactory {
  constructor(
    private readonly novaPoshta: NovaPoshtaService,
    private readonly ukrPoshta: UkrPoshtaService,
  ) {}

  create(carrier: ShippingCarrier): IDeliveryService {
    switch (carrier) {
      case ShippingCarrier.NOVA_POSHTA:
        return this.novaPoshta;
      case ShippingCarrier.UKR_POSHTA:
        return this.ukrPoshta;
      default:
        throw new BadRequestException(`Unknown shipping carrier: ${carrier}`);
    }
  }
}
