import { PermissionFlagsBits } from "discord.js";

const MAP: Record<string, bigint> = {
  Administrator: PermissionFlagsBits.Administrator,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  KickMembers: PermissionFlagsBits.KickMembers,
  BanMembers: PermissionFlagsBits.BanMembers,
  ModerateMembers: PermissionFlagsBits.ModerateMembers,
  ManageMessages: PermissionFlagsBits.ManageMessages,
  ManageThreads: PermissionFlagsBits.ManageThreads,
  ManageNicknames: PermissionFlagsBits.ManageNicknames,
  ViewAuditLog: PermissionFlagsBits.ViewAuditLog,
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  Connect: PermissionFlagsBits.Connect,
  Speak: PermissionFlagsBits.Speak,
  UseVAD: PermissionFlagsBits.UseVAD,
  Stream: PermissionFlagsBits.Stream,
  ManageEvents: PermissionFlagsBits.ManageEvents,
};

export function resolvePermissionNames(names: string[]): bigint {
  let bits = 0n;
  for (const n of names) {
    const b = MAP[n];
    if (b === undefined) throw new Error(`Неизвестное право в каталоге: ${n}`);
    bits |= b;
  }
  return bits;
}
