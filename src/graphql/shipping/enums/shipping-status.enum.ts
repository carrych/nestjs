import { registerEnumType } from '@nestjs/graphql';
import { ShippingStatus } from '../../../shipping/enums/shipping-status.enum';

registerEnumType(ShippingStatus, { name: 'ShippingStatus' });

export { ShippingStatus };
