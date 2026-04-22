import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { InvoiceMessage } from '../dto/invoice-message.dto';

@Injectable()
export class InvoicePdfService {
  async generate(invoice: InvoiceMessage): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(22).font('Helvetica-Bold').text('SALES INVOICE', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica').text(`Order #${invoice.orderId}`, { align: 'center' });
      doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, { align: 'center' });

      doc.moveDown(1.5);
      doc.fontSize(12).font('Helvetica-Bold').text('Items');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      let total = 0;
      doc.fontSize(11).font('Helvetica');
      for (const item of invoice.items) {
        const subtotal = item.price * item.quantity * (1 - item.discount / 100);
        total += subtotal;
        const discountStr = item.discount > 0 ? ` (${item.discount}% off)` : '';
        doc.text(
          `Product #${item.productId}  ×${item.quantity}  $${item.price.toFixed(2)}${discountStr}  =  $${subtotal.toFixed(2)}`,
        );
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(13).font('Helvetica-Bold').text(`Total: $${total.toFixed(2)}`, { align: 'right' });

      doc.end();
    });
  }
}
