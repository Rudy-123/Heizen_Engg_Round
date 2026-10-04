import { normaliseHeader, parseCsv, parseYesNo, splitList } from './csv.js';

describe('parseCsv', () => {
  it('reads plain rows, with LF or CRLF line ends', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps commas, line breaks and doubled quotes inside quoted fields', () => {
    expect(parseCsv('name,note\n"Rao, Nandini","said ""hi""\nthen left"\n')).toEqual([
      ['name', 'note'],
      ['Rao, Nandini', 'said "hi"\nthen left'],
    ]);
  });

  it('keeps empty fields and drops Excel’s byte-order mark', () => {
    expect(parseCsv('﻿a,b,c\n1,,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('import helpers', () => {
  it('matches headers however they are written', () => {
    expect(['First name', 'first_name', 'FirstName'].map(normaliseHeader)).toEqual([
      'firstname',
      'firstname',
      'firstname',
    ]);
  });

  it('understands yes/no in the usual spellings, and refuses anything else', () => {
    expect(['yes', 'Y', 'TRUE', '1'].map(parseYesNo)).toEqual([true, true, true, true]);
    expect(['', 'no', 'n', 'false', '0'].map(parseYesNo)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(parseYesNo('maybe')).toBeNull();
  });

  it('splits lists on semicolons or pipes', () => {
    expect(splitList(' Peanuts; Gluten |Dairy;; ')).toEqual(['Peanuts', 'Gluten', 'Dairy']);
  });
});
