/** The message under a form field, from client-side validation or from the server. */
export function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}
