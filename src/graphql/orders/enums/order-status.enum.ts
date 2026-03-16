import { registerEnumType } from '@nestjs/graphql';
import { OrderStatus } from '../../../orders/enums/order-status.enum';

registerEnumType(OrderStatus, {
  name: 'OrderStatus',
  description: 'Order lifecycle status',
});

export { OrderStatus };
