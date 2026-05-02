type DecimalLike = {
  toNumber: () => number;
};

export type CostBasisProduct = {
  id: string;
  purchasePrice?: DecimalLike | null;
};

export type CostBasisSnapshot = {
  storeId: string;
  productId: string;
  snapshotDate?: Date;
  quantity: DecimalLike;
  product?: {
    purchasePrice?: DecimalLike | null;
  } | null;
};

export type ProductCostBasis = {
  productId: string;
  stockQuantity: number;
  stockCost: number;
  unitCost: number | null;
};

type StockLayer = {
  quantity: number;
  unitCost: number;
};

type StockState = {
  layers: StockLayer[];
};

export function buildProductCostBasis(
  products: CostBasisProduct[] = [],
  snapshots: CostBasisSnapshot[] = [],
): Map<string, ProductCostBasis> {
  const priceByProduct = new Map(
    products.map((product) => [
      product.id,
      product.purchasePrice?.toNumber() ?? 0,
    ]),
  );
  const snapshotsByStoreProduct = new Map<string, CostBasisSnapshot[]>();

  snapshots.forEach((snapshot) => {
    const key = `${snapshot.storeId}:${snapshot.productId}`;
    const current = snapshotsByStoreProduct.get(key) ?? [];
    current.push(snapshot);
    snapshotsByStoreProduct.set(key, current);
  });

  const basisByProduct = new Map<string, ProductCostBasis>();

  snapshotsByStoreProduct.forEach((items) => {
    const sortedItems = [...items].sort(
      (a, b) =>
        (a.snapshotDate?.getTime() ?? 0) - (b.snapshotDate?.getTime() ?? 0),
    );
    const state: StockState = { layers: [] };

    sortedItems.forEach((snapshot) => {
      const targetQuantity = Math.max(0, snapshot.quantity.toNumber());
      const currentQuantity = state.layers.reduce(
        (sum, layer) => sum + layer.quantity,
        0,
      );
      const delta = targetQuantity - currentQuantity;

      if (delta > 0) {
        state.layers.push({
          quantity: delta,
          unitCost:
            snapshot.product?.purchasePrice?.toNumber() ??
            priceByProduct.get(snapshot.productId) ??
            0,
        });
        return;
      }

      if (delta < 0) {
        consumeOldestLayers(state.layers, Math.abs(delta));
      }
    });

    state.layers.forEach((layer) => {
      const snapshotProductId = sortedItems[0]?.productId;

      if (!snapshotProductId || layer.quantity <= 0) {
        return;
      }

      const current = basisByProduct.get(snapshotProductId) ?? {
        productId: snapshotProductId,
        stockQuantity: 0,
        stockCost: 0,
        unitCost: null,
      };
      current.stockQuantity += layer.quantity;
      current.stockCost += layer.quantity * layer.unitCost;
      basisByProduct.set(snapshotProductId, current);
    });
  });

  products.forEach((product) => {
    const current = basisByProduct.get(product.id) ?? {
      productId: product.id,
      stockQuantity: 0,
      stockCost: 0,
      unitCost: null,
    };

    current.unitCost =
      current.stockQuantity > 0
        ? current.stockCost / current.stockQuantity
        : (product.purchasePrice?.toNumber() ?? null);
    basisByProduct.set(product.id, current);
  });

  return basisByProduct;
}

function consumeOldestLayers(layers: StockLayer[], quantity: number) {
  let remaining = quantity;

  while (remaining > 0 && layers.length > 0) {
    const layer = layers[0];
    const consumed = Math.min(layer.quantity, remaining);
    layer.quantity -= consumed;
    remaining -= consumed;

    if (layer.quantity <= 0) {
      layers.shift();
    }
  }
}
