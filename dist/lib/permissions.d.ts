import type { Server } from '../server';
declare type PermissionList = {
    [index: string]: boolean | null;
};
declare type Parents = {
    [index: string]: PermissionHolder;
};
import { IParentedPermissionHolder, ICorePermissionHolder, ICorePermissionManager } from 'voxelservercore/interfaces/permissions';
export declare class PermissionManager implements ICorePermissionManager {
    groups: {};
    _server: Server;
    constructor(server: any);
    loadGroups(groups2: any): void;
    createGroup(name: string, group: PermissionHolder): void;
    removeGroup(name: string): void;
    getGroup(name: string): any;
    getAllGroups(): {};
    toObject(): {};
}
export declare class PermissionHolder implements ICorePermissionHolder {
    readonly permissions: PermissionList;
    constructor(permissions?: PermissionList);
    check(perm: string | string[]): null | boolean;
    checkStrict(perm: string | string[]): null | boolean;
    add(perm: string, bool?: boolean): void;
    remove(perm: string): void;
}
export declare class PlayerPermissionHolder extends PermissionHolder implements IParentedPermissionHolder {
    parents: Parents;
    _pm: PermissionManager;
    constructor(pm: PermissionManager, permissions?: PermissionList, parents?: Array<string>);
    check(perm: string | string[]): null | boolean;
    checkStrict(perm: string | string[]): null | boolean;
    addParent(parent: string): void;
    removeParent(parent: string): void;
}
export {};
//# sourceMappingURL=permissions.d.ts.map