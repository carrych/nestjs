import type { Observable } from 'rxjs';
import type { Metadata, CallOptions } from '@grpc/grpc-js';

export interface AuthorizeRequest {
  orderId: number;
  amount: string;
  currency: string;
  idempotencyKey?: string;
}

export interface AuthorizeResponse {
  paymentId: string;
  status: string;
}

export interface GetPaymentStatusRequest {
  paymentId: string;
}

export interface GetPaymentStatusResponse {
  paymentId: string;
  status: string;
}

export interface PaymentsGrpcClient {
  authorize(
    data: AuthorizeRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<AuthorizeResponse>;
  getPaymentStatus(
    data: GetPaymentStatusRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<GetPaymentStatusResponse>;
}
