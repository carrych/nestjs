import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClientGrpc } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';

import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { PAYMENTS_GRPC_CLIENT } from '../payments-grpc-client/payments-grpc-client.module';

// gRPC service interface (mirrors proto/payments.proto)
interface PaymentsGrpcService {
  authorize(data: {
    orderId: number;
    amount: string;
    currency: string;
    idempotencyKey?: string;
  }): Observable<{ paymentId: string; status: string }>;

  capture(data: { paymentId: string }): Observable<{ paymentId: string; status: string }>;

  refund(data: {
    paymentId: string;
    amount: string;
  }): Observable<{ paymentId: string; status: string }>;

  getPaymentStatus(data: { paymentId: string }): Observable<{ paymentId: string; status: string }>;
}

type RequestWithId = Request & { requestId?: string };

@Controller('payments')
export class PaymentsController implements OnModuleInit {
  private grpcPayments: PaymentsGrpcService;

  constructor(
    private readonly paymentsService: PaymentsService,
    @Inject(PAYMENTS_GRPC_CLIENT) private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.grpcPayments = this.grpcClient.getService<PaymentsGrpcService>('Payments');
  }

  // ── REST CRUD ──────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryPaymentDto) {
    return this.paymentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentDto,
    @Req() req: RequestWithId,
  ) {
    return this.paymentsService.update(id, dto, req.requestId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.remove(id);
  }

  // ── gRPC payment lifecycle (routes through payments-grpc service) ──

  /** Authorize a payment — creates a pending payment record via gRPC microservice */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('authorize')
  @HttpCode(HttpStatus.CREATED)
  authorize(
    @Body()
    body: {
      orderId: number;
      amount: string;
      currency?: string;
      idempotencyKey?: string;
    },
  ) {
    return this.grpcPayments.authorize({
      orderId: body.orderId,
      amount: body.amount,
      currency: body.currency ?? 'UAH',
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** Capture an authorized payment — updates status to received via gRPC */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post(':paymentId/capture')
  capture(@Param('paymentId') paymentId: string) {
    return this.grpcPayments.capture({ paymentId });
  }

  /** Refund a payment — creates OUT payment record via gRPC */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post(':paymentId/refund')
  refund(@Param('paymentId') paymentId: string, @Body() body: { amount: string }) {
    return this.grpcPayments.refund({ paymentId, amount: body.amount });
  }

  /** Get payment status by transaction number via gRPC */
  @Get('status/:paymentId')
  getStatus(@Param('paymentId') paymentId: string) {
    return this.grpcPayments.getPaymentStatus({ paymentId });
  }
}
