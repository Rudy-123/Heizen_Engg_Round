import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  addMenuItemSchema,
  companyMenuHidingSchema,
  menuCategoryInputSchema,
  menuPreviewQuerySchema,
  reorderSchema,
  updateMenuItemSchema,
  type CompanyMenuHidingInput,
  type MenuCategoryDto,
  type MenuCategoryInput,
  type MenuPreviewDto,
} from '@fernleaf/shared';
import { RequirePermissions } from '../auth/access.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { MenuService } from './menu.service.js';

/** Every write returns the whole (small) menu, so the screen simply redraws from it. */
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @RequirePermissions('MENU_READ')
  @Get('categories')
  list(): Promise<MenuCategoryDto[]> {
    return this.menu.listCategories();
  }

  @RequirePermissions('MENU_WRITE')
  @Post('categories')
  create(
    @Body(new ZodValidationPipe(menuCategoryInputSchema)) body: MenuCategoryInput,
  ): Promise<MenuCategoryDto[]> {
    return this.menu.createCategory(body);
  }

  @RequirePermissions('MENU_WRITE')
  @Put('categories/order')
  reorder(
    @Body(new ZodValidationPipe(reorderSchema)) body: { ids: string[] },
  ): Promise<MenuCategoryDto[]> {
    return this.menu.reorderCategories(body.ids);
  }

  @RequirePermissions('MENU_WRITE')
  @Put('categories/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(menuCategoryInputSchema)) body: MenuCategoryInput,
  ): Promise<MenuCategoryDto[]> {
    return this.menu.updateCategory(id, body);
  }

  @RequirePermissions('MENU_WRITE')
  @Post('categories/:id/items')
  addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMenuItemSchema)) body: { dishId: string },
  ): Promise<MenuCategoryDto[]> {
    return this.menu.addItem(id, body.dishId);
  }

  @RequirePermissions('MENU_WRITE')
  @Put('categories/:id/items/order')
  reorderItems(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: { ids: string[] },
  ): Promise<MenuCategoryDto[]> {
    return this.menu.reorderItems(id, body.ids);
  }

  @RequirePermissions('MENU_WRITE')
  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMenuItemSchema)) body: { isActive: boolean },
  ): Promise<MenuCategoryDto[]> {
    return this.menu.updateItem(id, body.isActive);
  }

  @RequirePermissions('MENU_WRITE')
  @Delete('items/:id')
  removeItem(@Param('id') id: string): Promise<MenuCategoryDto[]> {
    return this.menu.removeItem(id);
  }

  @RequirePermissions('MENU_WRITE')
  @Put('hiding/:companyId')
  setHiding(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(companyMenuHidingSchema)) body: CompanyMenuHidingInput,
  ): Promise<CompanyMenuHidingInput> {
    return this.menu.setCompanyHiding(companyId, body);
  }

  /** The menu exactly as one employee would see it, with the reason for everything hidden. */
  @RequirePermissions('MENU_READ')
  @Get('preview')
  preview(
    @Query(new ZodValidationPipe(menuPreviewQuerySchema)) query: { employeeId: string },
  ): Promise<MenuPreviewDto> {
    return this.menu.menuForEmployee(query.employeeId);
  }
}
