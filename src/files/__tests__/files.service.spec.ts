import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { FilesService } from '../files.service';
import { FileRecord } from '../entities/file-record.entity';
import { FileStatus } from '../enums/file-status.enum';
import { FileVisibility } from '../enums/file-visibility.enum';
import { StorageService } from '../services/storage.service';
import { FileKeyService } from '../services/file-key.service';
import { PresignDto } from '../dto/presign.dto';

const makeFile = (overrides: Partial<FileRecord> = {}): FileRecord => ({
  id: 'file-uuid-1',
  ownerId: 1,
  entityType: 'product-image',
  entityId: '5',
  key: 'products/5/images/test.jpg',
  bucket: 'test-bucket',
  contentType: 'image/jpeg',
  size: null,
  status: FileStatus.PENDING,
  visibility: FileVisibility.PRIVATE,
  expiresAt: new Date(Date.now() + 10 * 60_000), // 10 min from now
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('FilesService', () => {
  let service: FilesService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockStorage = {
    presignPutUrl: jest.fn().mockResolvedValue('https://mock-upload-url'),
    objectExists: jest.fn().mockResolvedValue(true),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getViewUrl: jest.fn().mockReturnValue('https://mock-view-url/products/5/images/test.jpg'),
    getBucketName: jest.fn().mockReturnValue('test-bucket'),
    getExpiresIn: jest.fn().mockReturnValue(900),
  };

  const mockKeyService = {
    forProductImage: jest.fn().mockReturnValue('products/5/images/uuid.jpg'),
    isAllowedType: jest.fn().mockReturnValue(true),
  };

  const mockTxManager = {
    getRepository: jest.fn().mockReturnValue({ update: jest.fn() }),
    query: jest.fn().mockResolvedValue([{ id: 1 }]),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: (m: unknown) => Promise<void>) => cb(mockTxManager)),
    query: jest.fn().mockResolvedValue([{ id: 5 }]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(FileRecord), useValue: mockRepo },
        { provide: StorageService, useValue: mockStorage },
        { provide: FileKeyService, useValue: mockKeyService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(FilesService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // presign
  // ──────────────────────────────────────────────────────────────────────────
  describe('presign()', () => {
    const dto: PresignDto = {
      entityType: 'product-image',
      entityId: '5',
      contentType: 'image/jpeg',
      size: 204_800,
    };

    it('creates FileRecord with PENDING status and returns uploadUrl', async () => {
      const saved = makeFile();
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);

      const result = await service.presign(dto, 1);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: FileStatus.PENDING, ownerId: 1 }),
      );
      expect(result.uploadUrl).toBe('https://mock-upload-url');
      expect(result.uploadMethod).toBe('PUT');
    });

    it('throws BadRequestException for disallowed contentType', async () => {
      mockKeyService.isAllowedType.mockReturnValueOnce(false);
      await expect(service.presign({ ...dto, contentType: 'application/pdf' }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if product does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.presign(dto, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // complete
  // ──────────────────────────────────────────────────────────────────────────
  describe('complete()', () => {
    it('transitions status to READY and returns viewUrl', async () => {
      const file = makeFile();
      mockRepo.findOne.mockResolvedValue(file);

      const result = await service.complete('file-uuid-1', 1);

      expect(result.status).toBe(FileStatus.READY);
      expect(result.viewUrl).toBe('https://mock-view-url/products/5/images/test.jpg');
    });

    it('throws ForbiddenException if file belongs to another user', async () => {
      mockRepo.findOne.mockResolvedValue(makeFile({ ownerId: 99 }));
      await expect(service.complete('file-uuid-1', 1)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if status is already READY', async () => {
      mockRepo.findOne.mockResolvedValue(makeFile({ status: FileStatus.READY }));
      await expect(service.complete('file-uuid-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if upload window expired', async () => {
      mockRepo.findOne.mockResolvedValue(
        makeFile({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.complete('file-uuid-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if file not found in S3', async () => {
      mockRepo.findOne.mockResolvedValue(makeFile());
      mockStorage.objectExists.mockResolvedValueOnce(false);
      await expect(service.complete('file-uuid-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if product does not exist during complete', async () => {
      mockRepo.findOne.mockResolvedValue(makeFile());
      mockTxManager.query.mockResolvedValueOnce([]);
      await expect(service.complete('file-uuid-1', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // findOwnedOrFail
  // ──────────────────────────────────────────────────────────────────────────
  describe('findOwnedOrFail()', () => {
    it('returns the file if owner matches', async () => {
      const file = makeFile();
      mockRepo.findOne.mockResolvedValue(file);
      await expect(service.findOwnedOrFail('file-uuid-1', 1)).resolves.toEqual(file);
    });

    it('throws NotFoundException if file not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOwnedOrFail('missing-uuid', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if different owner', async () => {
      mockRepo.findOne.mockResolvedValue(makeFile({ ownerId: 42 }));
      await expect(service.findOwnedOrFail('file-uuid-1', 1)).rejects.toThrow(ForbiddenException);
    });
  });
});
