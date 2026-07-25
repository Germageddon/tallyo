export type UserRef = { platform: string; platformUserId: string };

export type Reply =
  | { kind: 'text'; text: string }
  | { kind: 'confirm'; text: string; captureId: number }
  | { kind: 'document'; filename: string; content: string; caption: string };
