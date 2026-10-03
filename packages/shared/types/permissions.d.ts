export type Permission = 'overview' | 'reports' | 'mute' | 'ban' | 'terminate' | 'wallet' | 'premium' | 'items' | 'profiles' | 'boost' | 'payments' | 'personas' | 'staff';
export type Role = 'user' | 'mod' | 'admin';
export declare const PERMISSIONS: { key: Permission; label: string; desc: string; group: 'Panel' | 'Moderation' | 'Economy' }[];
export declare const PERMISSION_KEYS: Permission[];
export declare const ROLE_DEFAULTS: Record<Role, Permission[]>;
export declare const ROLES: { key: Role; label: string }[];
export declare function permissionsOf(u: { role?: Role | string; perms?: string[] } | null | undefined): Permission[];
export declare function can(u: { role?: Role | string; perms?: string[] } | null | undefined, perm: Permission): boolean;
export declare function isStaff(u: { role?: Role | string; perms?: string[] } | null | undefined): boolean;
