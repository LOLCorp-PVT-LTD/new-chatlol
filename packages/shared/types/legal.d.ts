export interface CommunityRule { key: string; title: string; severity: 'severe' | 'high' | 'medium' | 'low'; summary: string; examples: string[] }
export declare const LEGAL_VERSION: string;
export declare const LEGAL_COMPANY: { name: string; number: string; address: string; contact: string; safety: string; law: string };
export declare const COMMUNITY_RULES: CommunityRule[];
export declare const ruleByKey: (k: string) => CommunityRule | undefined;
export declare const SAFETY_RULES: { title: string; body: string }[];
export declare const TERMS: { title: string; body: string }[];
export declare const PRIVACY: { title: string; body: string }[];
export declare const LEGAL_DOCS: Record<'terms' | 'guidelines' | 'safety' | 'privacy', { title: string; sections: { title: string; body: string; examples?: string[]; severity?: string }[] }>;
