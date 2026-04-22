import { Test } from '@nestjs/testing';
import { InvoicePdfService } from '../services/invoice-pdf.service';

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [InvoicePdfService],
    }).compile();
    service = module.get(InvoicePdfService);
  });

  it('generates a Buffer starting with PDF magic bytes', async () => {
    const buf = await service.generate({
      orderId: 1,
      userId: 2,
      type: 'sales',
      items: [{ productId: 10, quantity: 2, price: 50, discount: 10 }],
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.toString('ascii', 0, 4)).toBe('%PDF');
  });

  it('produces a larger PDF when there are more items', async () => {
    const single = await service.generate({
      orderId: 1,
      userId: 2,
      type: 'sales',
      items: [{ productId: 1, quantity: 1, price: 10, discount: 0 }],
    });
    const many = await service.generate({
      orderId: 1,
      userId: 2,
      type: 'sales',
      items: Array.from({ length: 10 }, (_, i) => ({
        productId: i + 1,
        quantity: 2,
        price: 100,
        discount: 5,
      })),
    });
    expect(many.length).toBeGreaterThan(single.length);
  });
});
