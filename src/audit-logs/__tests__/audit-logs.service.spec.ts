import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuditLogsService } from '../audit-logs.service';
import { AuditLog } from '../entities/audit-log.entity';

const makeLog = (overrides: Partial<AuditLog> = {}): AuditLog =>
  ({
    id: 1,
    userId: 1,
    role: 'user',
    action: 'CREATE_PRODUCT',
    entityType: 'product',
    entityId: '42',
    details: null,
    ip: '127.0.0.1',
    createdAt: new Date(),
    ...overrides,
  }) as AuditLog;

describe('AuditLogsService', () => {
  let service: AuditLogsService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: getRepositoryToken(AuditLog), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(AuditLogsService);
  });

  // ─── log() ────────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('calls repo.save() fire-and-forget', async () => {
      const entry = makeLog();
      mockRepo.create.mockReturnValue(entry);
      mockRepo.save.mockResolvedValue(entry);

      service.log({ action: 'CREATE_PRODUCT', entityType: 'product', entityId: '42' });

      // give the microtask queue a tick to run
      await Promise.resolve();

      expect(mockRepo.save).toHaveBeenCalledWith(entry);
    });

    it('does not throw when repo.save() rejects', async () => {
      mockRepo.create.mockReturnValue({});
      mockRepo.save.mockRejectedValue(new Error('DB down'));

      expect(() =>
        service.log({ action: 'CREATE_PRODUCT' }),
      ).not.toThrow();

      // allow the rejection to be handled silently
      await Promise.resolve();
    });
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated { data, total }', async () => {
      const logs = [makeLog()];
      mockRepo.findAndCount.mockResolvedValue([logs, 1]);

      const result = await service.findAll({ limit: 10, offset: 0 });

      expect(result).toEqual({ data: logs, total: 1 });
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 0, order: { createdAt: 'DESC' } }),
      );
    });

    it('caps limit at 100', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ limit: 999, offset: 0 });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('minimum limit is 1', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ limit: 0, offset: 0 });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('filters by action', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ action: 'DELETE_PRODUCT' });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'DELETE_PRODUCT' }),
        }),
      );
    });

    it('filters by entityType', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ entityType: 'order' });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'order' }),
        }),
      );
    });

    it('filters by userId', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ userId: 7 });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 7 }),
        }),
      );
    });

    it('returns empty list when no logs match', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({ action: 'NONEXISTENT' });

      expect(result).toEqual({ data: [], total: 0 });
    });
  });
});
