'use client';

import {
  EMPLOYEE_CSV_COLUMNS,
  type CompanyDetailDto,
  type EmployeeImportInput,
  type EmployeeImportResultDto,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Download, FileUp, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { FieldError } from '@/components/field-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { companyQueryKey, employeesQueryKey } from '@/lib/company-queries';

/** A ready-to-fill file: the columns, plus two example rows on the company's own domain. */
function templateCsv(domain: string, allergen: string | undefined, diet: string | undefined) {
  return [
    EMPLOYEE_CSV_COLUMNS.join(','),
    `Asha,Iyer,asha.iyer@${domain},+91 98000 00000,no,yes,no,${allergen ?? ''},${diet ?? ''}`,
    `Rahul,Mehta,rahul.mehta@${domain},,no,no,no,,`,
  ].join('\r\n');
}

/**
 * [Should] spec 4.5: bulk-import a company's employees from a CSV file. The API checks every
 * row with the same rules as adding one person; good rows are saved and each bad row is listed
 * with its line number, so the file can be fixed and imported again.
 */
export function ImportEmployeesDialog({
  company,
  allergenExample,
  dietExample,
  onClose,
}: {
  company: CompanyDetailDto;
  allergenExample?: string;
  dietExample?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importFile = useMutation({
    mutationFn: async (chosen: File) =>
      api.post<EmployeeImportResultDto>('/employees/import', {
        companyId: company.id,
        csv: await chosen.text(),
      } satisfies EmployeeImportInput),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: employeesQueryKey });
      void queryClient.invalidateQueries({ queryKey: companyQueryKey(company.id) });
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not import.',
      ),
  });
  const result = importFile.data;
  const domain = company.domains[0]?.domain ?? 'example.com';
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(domain, allergenExample, dietExample))}`;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import employees from a CSV file</DialogTitle>
          <DialogDescription>
            One row per person, into {company.name}. Each row is checked like a new employee: good
            rows are saved, and any row with a problem is listed below to fix and import again.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              {result.errors.length === 0 ? (
                <CircleCheck className="size-4 text-success" />
              ) : (
                <TriangleAlert className="size-4 text-warning-foreground" />
              )}
              {result.created} of {result.rows} {result.rows === 1 ? 'row' : 'rows'} imported
              {result.errors.length > 0
                ? ` - ${result.errors.length} need${result.errors.length === 1 ? 's' : ''} fixing`
                : ''}
              .
            </p>
            {result.errors.length > 0 ? (
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">What to fix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.errors.map((rowError) => (
                      <tr key={rowError.row} className="align-top">
                        <td className="px-3 py-2 tabular-nums">{rowError.row}</td>
                        <td className="px-3 py-2 break-all">{rowError.email ?? '-'}</td>
                        <td className="px-3 py-2 text-destructive">
                          {rowError.messages.join(' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-muted/60 p-3 text-muted-foreground">
              <p>
                Columns: <code className="text-xs">first_name, last_name, email</code> (required),
                then optionally <code className="text-xs">phone</code>, the three yes/no flags{' '}
                <code className="text-xs">
                  can_choose_address, can_change_delivery_time, can_change_packaging
                </code>
                , and <code className="text-xs">allergies</code> /{' '}
                <code className="text-xs">dietary_preferences</code> as names separated by
                semicolons. Emails must be on {company.name}’s domain.
              </p>
              <a
                href={template}
                download={`${company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-employees.csv`}
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-primary underline"
              >
                <Download className="size-4" /> Download a template
              </a>
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground hover:bg-accent/40">
              <FileUp className="size-5" />
              {file ? (
                <span className="font-medium text-foreground">{file.name}</span>
              ) : (
                'Choose a .csv file'
              )}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
            </label>
            <FieldError message={error ?? undefined} />
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  importFile.reset();
                  setFile(null);
                }}
              >
                Import another file
              </Button>
              <Button onClick={onClose}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!file || importFile.isPending}
                onClick={() => file && importFile.mutate(file)}
              >
                {importFile.isPending ? <Loader2 className="animate-spin" /> : <FileUp />}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
