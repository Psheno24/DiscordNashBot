export interface CatalogRole {
  key: string;
  name: string;
  layer: string;
  assignment: string;
  color: string;
  hoist: boolean;
  mentionable: boolean;
  permissions: string[];
  discordDescription?: string;
}

export interface ServerChannels {
  adminPanel: { name: string; topic: string };
  publicPanel: { name: string; topic: string };
}

export interface RolesCatalog {
  meta: { setting: string; note: string };
  server: {
    categories: { admin: string; publicRoot: string };
    channels: ServerChannels;
    adminVisibilityRoles: string[];
  };
  roles: CatalogRole[];
  roleOrderTopToBottom: string[];
}
