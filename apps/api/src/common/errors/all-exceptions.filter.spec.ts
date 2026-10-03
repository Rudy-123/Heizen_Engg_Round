import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { toErrorBody } from './all-exceptions.filter.js';
import { BusinessRuleError, ConflictError } from './domain-error.js';

describe('toErrorBody', () => {
  it('keeps the status, code and field errors of our own errors', () => {
    const error = new BusinessRuleError(
      'COMBINATION_SUM_MISMATCH',
      'Combinations add up to 9, not 10.',
      [{ path: 'lines.0.combinations', message: 'Must add up to 10.' }],
    );
    expect(toErrorBody(error)).toEqual({
      statusCode: 422,
      code: 'COMBINATION_SUM_MISMATCH',
      message: 'Combinations add up to 9, not 10.',
      fieldErrors: [{ path: 'lines.0.combinations', message: 'Must add up to 10.' }],
    });
  });

  it('leaves out fieldErrors when there are none', () => {
    expect(toErrorBody(new ConflictError('Unit already started.'))).toEqual({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Unit already started.',
    });
  });

  it("maps Nest's built-in HTTP exceptions to our codes", () => {
    expect(toErrorBody(new NotFoundException('Cannot GET /api/nope'))).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(toErrorBody(new ForbiddenException())).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('hides the details of unexpected errors', () => {
    expect(toErrorBody(new Error('connection string leaked here'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    });
  });
});
