import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

import { EventsGateway } from '../events.gateway';

const mockJwtService = {
  verify: jest.fn(),
};

function makeSocket(token?: string, authToken?: string) {
  return {
    id: 'socket-123',
    data: {} as Record<string, unknown>,
    handshake: {
      auth: authToken !== undefined ? { token: authToken } : {},
      query: token !== undefined ? { token } : {},
    },
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    gateway = module.get(EventsGateway);
  });

  describe('handleConnection()', () => {
    it('joins user room when token is valid (auth.token)', () => {
      mockJwtService.verify.mockReturnValue({ sub: 7 });
      const client = makeSocket(undefined, 'valid-token');

      gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('user:7');
      expect(client.data.userId).toBe(7);
    });

    it('joins user room when token is in query string', () => {
      mockJwtService.verify.mockReturnValue({ sub: 99 });
      const client = makeSocket('query-token');

      gateway.handleConnection(client as never);

      expect(client.join).toHaveBeenCalledWith('user:99');
    });

    it('disconnects when no token provided', () => {
      const client = makeSocket();

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when JWT verification fails', () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const client = makeSocket(undefined, 'bad-token');

      gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });
  });
});
