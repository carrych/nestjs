import { Module } from '@nestjs/common';
import { ShippingModule } from '../../shipping/shipping.module';
import { ShippingResolver } from './resolvers/shipping.resolver';

@Module({
  imports: [ShippingModule],
  providers: [ShippingResolver],
})
export class GraphqlShippingModule {}
