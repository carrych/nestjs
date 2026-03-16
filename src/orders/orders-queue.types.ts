export type OrdersProcessMessage = {
  messageId: string;
  orderId: number;
  attempt: number;
  simulate?: 'alwaysFail';
};
