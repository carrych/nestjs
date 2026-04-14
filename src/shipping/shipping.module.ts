import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Shipping } from './entities/shipping.entity';
import { Order } from '../orders/entities/order.entity';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { NovaPoshtaService } from './services/nova-poshta.service';
import { UkrPoshtaService } from './services/ukr-poshta.service';
import { InvoicesClientModule } from '../invoices-client/invoices-client.module';

@Module({
  imports: [TypeOrmModule.forFeature([Shipping, Order]), InvoicesClientModule],
  controllers: [ShippingController],
  providers: [ShippingService, NovaPoshtaService, UkrPoshtaService],
  exports: [ShippingService, NovaPoshtaService, UkrPoshtaService],
})
export class ShippingModule {}
