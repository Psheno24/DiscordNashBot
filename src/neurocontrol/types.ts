export interface NeuroRoleEntry {
  /** Короткое обозначение (на схемах и в панели). */
  designation: string;
  /** Имя роли на сервере (как в Discord). */
  roleName: string;
  /** Возможности и смысл роли. */
  capabilities: string;
}

export interface NeurocontrolFile {
  panel: {
    title: string;
    description: string;
    footer?: string;
  };
  roles: NeuroRoleEntry[];
}
