import { registerEnumType } from '@nestjs/graphql';
import { PaymentStatus } from '../../../payments/enums/payment-status.enum';
import { PaymentMethod } from '../../../payments/enums/payment-method.enum';
import { PaymentType } from '../../../payments/enums/payment-type.enum';

registerEnumType(PaymentStatus, { name: 'PaymentStatus' });
registerEnumType(PaymentMethod, { name: 'PaymentMethod' });
registerEnumType(PaymentType, { name: 'PaymentDirection' });

export { PaymentStatus, PaymentMethod, PaymentType };
