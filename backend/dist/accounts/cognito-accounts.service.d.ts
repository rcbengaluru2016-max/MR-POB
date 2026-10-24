import { ConfigService } from '../config/config.service';
type IdentityAccount = {
    id: string;
    username: string;
    email: string | null;
    displayName: string;
    cognitoSub: string | null;
};
export declare class CognitoAccountsService {
    private readonly config;
    private readonly client;
    constructor(config: ConfigService);
    private parameters;
    private get;
    password(account: IdentityAccount, password: string, bind: (sub: string) => Promise<void>): Promise<void>;
    state(sub: string, state: 'ACTIVE' | 'INACTIVE'): Promise<void>;
}
export {};
