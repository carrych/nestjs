import { Module } from '@nestjs/common';
import { PaymentsModule } from '../../payments/payments.module';
import { PaymentsResolver } from './resolvers/payments.resolver';

@Module({
  imports: [PaymentsModule],
  providers: [PaymentsResolver],
})
export class GraphqlPaymentsModule {}
