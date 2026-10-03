import { Injectable } from '@nestjs/common';
import {
  REFERENCE_KIND_INFO,
  REFERENCE_KINDS,
  type CreateReferenceItemInput,
  type ReferenceDataDto,
  type ReferenceItemDto,
  type ReferenceKind,
  type UpdateReferenceItemInput,
} from '@fernleaf/shared';
import { BusinessRuleError, NotFoundError } from '../common/errors/domain-error.js';
import { isRecordNotFound, isUniqueViolation } from '../common/errors/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The five reference tables (allergens, dietary tags, stations, portion sizes, packaging
 * types) have identical columns, so one small interface lets a single service manage them.
 */
interface ReferenceTable {
  findMany(args: { orderBy: { sortOrder?: 'asc'; name?: 'asc' }[] }): Promise<ReferenceItemDto[]>;
  count(): Promise<number>;
  create(args: { data: { name: string; sortOrder: number } }): Promise<ReferenceItemDto>;
  update(args: {
    where: { id: string };
    data: UpdateReferenceItemInput;
  }): Promise<ReferenceItemDto>;
}

@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  private table(kind: ReferenceKind): ReferenceTable {
    const tables = {
      allergens: this.prisma.allergen,
      'dietary-tags': this.prisma.dietaryTag,
      'kitchen-stations': this.prisma.kitchenStation,
      'portion-sizes': this.prisma.portionSize,
      'packaging-types': this.prisma.packagingType,
    } satisfies Record<ReferenceKind, unknown>;
    return tables[kind] as unknown as ReferenceTable;
  }

  /** Every list, in display order - one request fills all the pickers in the UI. */
  async getAll(): Promise<ReferenceDataDto> {
    const lists = await Promise.all(
      REFERENCE_KINDS.map((kind) =>
        this.table(kind).findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      ),
    );
    return Object.fromEntries(
      REFERENCE_KINDS.map((kind, index) => [kind, lists[index]!.map(pick)]),
    ) as ReferenceDataDto;
  }

  async create(kind: ReferenceKind, input: CreateReferenceItemInput): Promise<ReferenceItemDto> {
    const table = this.table(kind);
    try {
      const sortOrder = await table.count(); // new items go to the end of the list
      return pick(await table.create({ data: { name: input.name, sortOrder } }));
    } catch (error) {
      throw this.translate(error, kind, input.name);
    }
  }

  async update(
    kind: ReferenceKind,
    id: string,
    input: UpdateReferenceItemInput,
  ): Promise<ReferenceItemDto> {
    try {
      return pick(await this.table(kind).update({ where: { id }, data: input }));
    } catch (error) {
      throw this.translate(error, kind, input.name);
    }
  }

  private translate(error: unknown, kind: ReferenceKind, name: string | undefined): unknown {
    if (isUniqueViolation(error)) {
      const message = `There is already a ${REFERENCE_KIND_INFO[kind].singular} called “${name}”.`;
      return new BusinessRuleError('NAME_TAKEN', message, [{ path: 'name', message }]);
    }
    if (isRecordNotFound(error)) return new NotFoundError(REFERENCE_KIND_INFO[kind].singular);
    return error;
  }
}

function pick(row: ReferenceItemDto): ReferenceItemDto {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: row.isActive };
}
