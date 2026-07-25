export type UserRef = { platform: string; platformUserId: string };

/** A tappable button: label + an opaque action string (routed by App.action). */
export type Button = { label: string; action: string };

export type Reply =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; rows: Button[][] }
  | { kind: 'confirm'; text: string; captureId: number }
  | { kind: 'request-location'; text: string }
  | { kind: 'document'; filename: string; content: string; caption: string };
