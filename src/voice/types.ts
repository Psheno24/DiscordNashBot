export interface VoiceLadderTier {
  roleName: string;
  /** Порог: суммарные минуты в голосе (не считая AFK), с момента первого учёта. */
  voiceMinutesTotal: number;
}

export interface VoiceLadderFile {
  /** Пояснение к порогам (только для людей; бот не читает). */
  _note?: string;
  ladder: VoiceLadderTier[];
}
