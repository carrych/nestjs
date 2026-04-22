import { Test } from '@nestjs/testing';
import { InvoiceQrService } from '../services/invoice-qr.service';

describe('InvoiceQrService', () => {
  let service: InvoiceQrService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [InvoiceQrService],
    }).compile();
    service = module.get(InvoiceQrService);
  });

  it('returns a base64 PNG data URL', async () => {
    const dataUrl = await service.generateDataUrl('https://example.com/invoice.pdf');
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(100);
  });

  it('encodes different URLs into different QR codes', async () => {
    const a = await service.generateDataUrl('https://cdn.example.com/a.pdf');
    const b = await service.generateDataUrl('https://cdn.example.com/b.pdf');
    expect(a).not.toBe(b);
  });
});
