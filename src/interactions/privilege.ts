import { PermissionFlagsBits, type GuildMember } from "discord.js";

export function canRunInstall(member: GuildMember | null, ownerId: string): boolean {
  if (!member) return false;
  if (member.id === ownerId) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
