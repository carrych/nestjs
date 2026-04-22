import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class InvoiceQrService {
  async generateDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, { type: 'image/png' });
  }
}
