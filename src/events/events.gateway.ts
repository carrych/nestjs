import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  jti: string;
}

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGINS ?? '*' },
  namespace: '/ws',
})
@Injectable()
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket): void {
    const token = (client.handshake.auth?.token ?? client.handshake.query?.token) as
      | string
      | undefined;

    if (!token) {
      this.logger.warn(`WS: no token, disconnecting ${client.id}`);
      client.disconnect();
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.logger.warn(`WS: invalid token, disconnecting ${client.id}`);
      client.disconnect();
      return;
    }

    const userId = payload.sub;
    client.data.userId = userId;
    void client.join(`user:${userId}`);
    this.logger.log(`WS connected userId=${userId} socketId=${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`WS disconnected socketId=${client.id} userId=${client.data?.userId}`);
  }

  emitToUser(userId: number, event: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  onApplicationShutdown(): void {
    this.server?.emit('server:shutdown', { message: 'Server restarting' });
    this.server?.disconnectSockets(true);
  }
}
