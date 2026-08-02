import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CategoriesController } from '../categories/categories.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { ProductsController } from '../products/products.controller';
import { StoresController } from '../stores/stores.controller';
import { SuppliersController } from '../suppliers/suppliers.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

type ControllerMethod =
  | keyof CategoriesController
  | keyof DashboardController
  | keyof ProductsController
  | keyof StoresController
  | keyof SuppliersController;

const guardedHandlers: Array<{
  controller:
    | typeof CategoriesController
    | typeof ProductsController
    | typeof StoresController
    | typeof SuppliersController;
  method: ControllerMethod;
}> = [
  { controller: ProductsController, method: 'getSummary' },
  { controller: ProductsController, method: 'getCatalog' },
  { controller: ProductsController, method: 'findAll' },
  { controller: ProductsController, method: 'findById' },
  { controller: StoresController, method: 'findAll' },
  { controller: CategoriesController, method: 'findAll' },
  { controller: CategoriesController, method: 'getLangameOverview' },
  { controller: SuppliersController, method: 'findAll' },
];

describe('operational B2B authentication boundary', () => {
  it('protects every dashboard endpoint at controller level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DashboardController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, DashboardController)).not.toHaveLength(
      0,
    );
  });

  it.each(guardedHandlers)(
    'protects $controller.name.$method with JWT and capability authorization',
    ({ controller, method }) => {
      const handler =
        controller.prototype[method as keyof typeof controller.prototype];

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).not.toHaveLength(0);
    },
  );
});
