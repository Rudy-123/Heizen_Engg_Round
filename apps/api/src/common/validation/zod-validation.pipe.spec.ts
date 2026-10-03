import { z } from 'zod';
import { ValidationFailedError } from '../errors/domain-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  name: z.string().min(1),
  lines: z.array(z.object({ quantity: z.number().int().positive() })),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value when it is valid', () => {
    const value = { name: 'Paneer bowl', lines: [{ quantity: 2 }] };
    expect(pipe.transform(value)).toEqual(value);
  });

  it('reports every bad field with a dot path the web form can use', () => {
    const run = () => pipe.transform({ name: '', lines: [{ quantity: 1 }, { quantity: 0 }] });

    expect(run).toThrow(ValidationFailedError);
    try {
      run();
    } catch (error) {
      const paths = (error as ValidationFailedError).fieldErrors?.map((e) => e.path);
      expect(paths).toEqual(['name', 'lines.1.quantity']);
    }
  });
});
