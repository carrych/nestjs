import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { ProductsService } from '../../../products/products.service';
import { Product } from '../../../products/entities/product.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProductLoader {
  private readonly loader: DataLoader<number, Product>;

  constructor(private readonly productsService: ProductsService) {
    this.loader = new DataLoader<number, Product>(async (ids) => {
      const products = await this.productsService.findByIds(ids as number[]);
      const byId = new Map(products.map((p) => [Number(p.id), p]));
      return ids.map((id) => byId.get(id) ?? new Error(`Product #${id} not found`));
    });
  }

  load(id: number): Promise<Product> {
    return this.loader.load(id);
  }
}
