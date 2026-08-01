export type UserRef = { platform: string; platformUserId: string };

export type Button = { label: string; action: string };

export type Reply =
  | { kind: 'text'; text: string }
  // edit: replace the message the button came from instead of sending a new one
  | { kind: 'buttons'; text: string; rows: Button[][]; edit?: boolean }
  | { kind: 'confirm'; text: string; captureId: number }
  | { kind: 'request-location'; text: string }
  | { kind: 'document'; filename: string; content: string; caption: string };
