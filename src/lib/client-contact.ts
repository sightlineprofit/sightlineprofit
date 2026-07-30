export const CLIENT_COMMUNICATION_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "text", label: "Text message" },
  { value: "in_person", label: "In person" },
] as const;

export type ClientCommunicationPreference = (typeof CLIENT_COMMUNICATION_OPTIONS)[number]["value"];

export function clientCommunicationLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CLIENT_COMMUNICATION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const clientCommunicationSchema = [
  "email",
  "phone",
  "text",
  "in_person",
] as const;
