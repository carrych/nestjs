import { Module } from '@nestjs/common';

import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { FilesModule } from '../files/files.module';
import { InvoiceGeneratorService } from './invoice-generator.service';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { InvoiceQrService } from './services/invoice-qr.service';

@Module({
  imports: [RabbitmqModule, FilesModule],
  providers: [InvoiceGeneratorService, InvoicePdfService, InvoiceQrService],
})
export class InvoiceGeneratorModule {}
