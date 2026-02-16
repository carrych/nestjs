import { Resolver, Query, Args } from '@nestjs/graphql';
import { PaymentsService } from '../../../payments/payments.service';
import { PaymentType } from '../types/payment.type';
import { PaymentsConnection } from '../types/payments-connection.type';
import { PaymentsFilterInput } from '../inputs/payments-filter.input';
import { PaymentsPaginationInput } from '../inputs/payments-pagination.input';

@Resolver(() => PaymentType)
export class PaymentsResolver {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Query(() => PaymentsConnection, { name: 'payments' })
  async getPayments(
    @Args('filter', { nullable: true }) filter?: PaymentsFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaymentsPaginationInput,
  ): Promise<PaymentsConnection> {
    const limit = Math.min(pagination?.limit ?? 10, 50);
    const offset = pagination?.offset ?? 0;

    const [nodes, totalCount] = await this.paymentsService.findAllWithCount({
      limit,
      offset,
      orderId: filter?.orderId,
      status: filter?.status,
    });

    return {
      nodes,
      totalCount,
      pageInfo: { hasNextPage: offset + limit < totalCount },
    };
  }
}
