import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class FileKeyService {
  forProductImage(productId: number, contentType: string): string {
    const ext = ALLOWED_TYPES[contentType];
    if (!ext) throw new BadRequestException(`Unsupported content type: ${contentType}`);
    return `products/${productId}/images/${Date.now()}-${randomUUID()}.${ext}`;
  }

  getAllowedTypes(): string[] {
    return Object.keys(ALLOWED_TYPES);
  }

  isAllowedType(contentType: string): boolean {
    return contentType in ALLOWED_TYPES;
  }
}
