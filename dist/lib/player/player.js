"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPlayerMovement = exports.Player = exports.PlayerManager = void 0;
const vec = __importStar(require("gl-vec3"));
const zlib = __importStar(require("zlib"));
const fs = __importStar(require("fs"));
const chat = __importStar(require("../chat"));
const armorInventory_1 = require("../inventory/armorInventory");
const playerInventory_1 = require("../inventory/playerInventory");
const permissions_1 = require("../permissions");
const helper_1 = require("../world/helper");
const pClient = __importStar(require("voxelsrv-protocol/js/client"));
const pServer = __importStar(require("voxelsrv-protocol/js/server"));
class PlayerManager {
    constructor(server) {
        this.players = {};
        this.banlist = {};
        this.ipbanlist = {};
        this.cache = {};
        this.chunksToSend = [];
        this._lastChunkUpdate = 0;
        this._server = server;
        this._entities = server.entities;
        this._worlds = server.worlds;
        const banlist = this._server.loadConfig('', 'banlist');
        this.banlist = banlist.players != undefined ? banlist.players : {};
        this.ipbanlist = banlist.ips != undefined ? banlist.ips : {};
        this.cache.uuid = this._server.loadConfig('', '.cacheuuid');
        this.cache.ip = this._server.loadConfig('', '.cacheip');
        server.on('entity-create', (data) => {
            this.sendPacketAllExcept('EntityCreate', {
                uuid: data.uuid,
                data: JSON.stringify(data.entity.getObject().data),
            }, this.players[data.uuid.slice(7)]);
        });
        server.on('entity-move', (data) => {
            this.sendPacketAllExcept('EntityMove', data, this.players[data.uuid.slice(7)]);
        });
        server.on('entity-remove', (data) => {
            this.sendPacketAllExcept('EntityRemove', data, this.players[data.uuid.slice(7)]);
        });
        server.on('server-stop', () => {
            this.saveCache();
            this.saveBanlist();
        });
    }
    create(id, data, socket) {
        this.players[id] = new Player(id, data.username, socket, this);
        this._server.emit('player-create', this.players[id]);
        this.cache.uuid[this.players[id].nickname] = this.players[id].id;
        this.cache.ip[id] = this.players[id].ipAddress;
        return this.players[id];
    }
    read(id) {
        try {
            let r = null;
            const name = id + '.json';
            const data = fs.readFileSync('./players/' + name);
            r = JSON.parse(data.toString());
            return r;
        }
        catch (e) {
            this._server.log.error('Tried to load data of player ' + id + ', but it failed! Error: ', e);
        }
    }
    exist(id) {
        const name = id + '.json';
        const r = fs.existsSync('./players/' + name);
        return r;
    }
    save(id, data) {
        try {
            fs.writeFile('./players/' + id + '.json', JSON.stringify(data), (err) => {
                if (err)
                    this._server.log.error('Cant save player ' + id + '! Reason: ' + err);
            });
        }
        catch (e) {
            console.error(e);
        }
    }
    get(id) {
        if (this.players[id] != undefined)
            return this.players[id];
        else
            return null;
    }
    sendMessageToAll(msg) {
        Object.values(this.players).forEach((x) => x.send(msg));
    }
    getAll() {
        return this.players;
    }
    sendPacketAll(type, data) {
        Object.values(this.players).forEach((p) => {
            p.sendPacket(type, data);
        });
    }
    sendPacketAllExcept(type, data, player) {
        Object.values(this.players).forEach((p) => {
            if (p != player)
                p.sendPacket(type, data);
        });
    }
    isBanned(id) {
        return this.banlist[id] != undefined;
    }
    isIPBanned(ip) {
        return this.ipbanlist[ip] != undefined;
    }
    getBanReason(id) {
        return this.banlist[id];
    }
    getIPBanReason(ip) {
        return this.ipbanlist[ip];
    }
    banPlayer(id, reason = 'Unknown reason') {
        this.banlist[id] = reason;
        this._server.emit('player-ban', id, reason);
        if (this.players[id] != undefined)
            this.players[id].kick(reason);
        this.saveBanlist();
    }
    banIP(ip, reason = 'Unknown reason') {
        this.ipbanlist[ip] = reason;
        this._server.emit('player-ipban', ip, reason);
        Object.values(this.players).forEach((player) => {
            if (player.ipAddress == ip)
                player.kick(reason);
        });
        this.saveBanlist();
    }
    saveBanlist() {
        this._server.saveConfig('', 'banlist', { players: this.banlist, ips: this.ipbanlist });
    }
    saveCache() {
        this._server.saveConfig('', '.cacheuuid', this.cache.uuid);
        this._server.saveConfig('', '.cacheip', this.cache.ip);
    }
}
exports.PlayerManager = PlayerManager;
class Player {
    constructor(id, name, socket, players) {
        this.ipAddress = '0.0.0.0';
        this.crafting = {
            items: { 0: null, 1: null, 2: null, 3: null },
            size: 5,
            result: null,
        };
        this.cache = {
            lastBlockCheck: {
                x: 0,
                y: 0,
                z: 0,
                status: false,
            },
            rateLimitChatMessageCounter: 0,
            rateLimitChatMessageTime: Date.now(),
            rateLimitChatMessageLastClear: Date.now(),
        };
        this._chunksToSend = [];
        this.id = id;
        this.nickname = name;
        this.displayName = name;
        this._players = players;
        this._server = players._server;
        this.ipAddress = socket.ip;
        let data;
        if (this._players.exist(this.id))
            data = this._players.read(this.id);
        if (data == null) {
            this.entity = this._players._entities.recreate('player-' + this.id, 'player', {
                name: name,
                nametag: true,
                health: 20,
                maxHealth: 20,
                model: 'player',
                texture: 'skins:' + this.id,
                position: this._server.config.world.spawn,
                rotation: 0,
                pitch: 0,
                hitbox: [0.55, 1.9, 0.55],
                armor: new armorInventory_1.ArmorInventory(null, this._server),
            }, 'default', null);
            this.world = this._players._worlds.get('default');
            this.inventory = new playerInventory_1.PlayerInventory(13, null, this._server);
            this.hookInventory = null;
            this.permissions = new permissions_1.PlayerPermissionHolder(this._server.permissions, {}, ['default']);
            this.movement = { ...exports.defaultPlayerMovement };
            this._server.emit('player-firstjoin', this);
            this._server.emit('player-join', this);
        }
        else {
            this.entity = this._players._entities.recreate('player-' + this.id, 'player', {
                name: data.entity.data.name,
                nametag: data.entity.data.nametag,
                health: data.entity.data.health,
                maxHealth: data.entity.data.maxhealth,
                model: 'player',
                texture: 'skins:' + this.id,
                position: data.entity.data.position,
                rotation: data.entity.data.rotation,
                pitch: data.entity.data.pitch,
                hitbox: [0.55, 1.9, 0.55],
                armor: new armorInventory_1.ArmorInventory(data.entity.data.armor, this._server),
            }, data.world, null);
            this.world = this._players._worlds.get(data.world);
            this.inventory = new playerInventory_1.PlayerInventory(13, data.inventory, this._server);
            if (!!data.permissions)
                this.permissions = new permissions_1.PlayerPermissionHolder(this._server.permissions, data.permissions, [...data.permissionparents, 'default']);
            else
                this.permissions = new permissions_1.PlayerPermissionHolder(this._server.permissions, {}, ['default']);
            this.movement = { ...exports.defaultPlayerMovement, ...data.movement };
            this._server.emit('player-join', this);
        }
        this.socket = socket;
        this.chunks = {};
        this._players.save(this.id, this.getObject());
        this.inventory.event.on('slot-update', (data) => {
            this.sendPacket('PlayerSlotUpdate', {
                slot: parseInt(data.slot),
                data: JSON.stringify(data.data),
                type: data.type,
            });
        });
        this._server.emit('player-created', this);
        this.updateChunks();
        this._chunksInterval = setInterval(async () => {
            if (this._chunksToSend[0] != undefined) {
                const id = this._chunksToSend[0];
                this.sendChunk(id);
                this._chunksToSend.shift();
            }
        }, 100);
    }
    getObject() {
        return {
            id: this.id,
            ipAddress: this.ipAddress,
            nickname: this.nickname,
            entity: this.entity.getObject(),
            inventory: this.inventory.getObject(),
            world: this.world.name,
            permissions: this.permissions.permissions,
            permissionparents: Object.keys(this.permissions.parents),
            movement: this.movement,
        };
    }
    sendPacket(type, data) {
        this.socket.send(type, data);
    }
    remove() {
        this._server.emit('player-remove', this);
        this._server.emit('player-quit', this);
        this._players.save(this.id, this.getObject());
        this.entity.remove();
        clearInterval(this._chunksInterval);
        setTimeout(() => {
            delete this._players.players[this.id];
        }, 10);
    }
    teleport(pos, eworld) {
        this.entity.teleport(pos, eworld);
        this.world = typeof eworld == 'string' ? this._players._worlds.get(eworld) : eworld;
        this.sendPacket('PlayerTeleport', { x: pos[0], y: pos[1], z: pos[2] });
        this.updateChunks();
    }
    move(pos) {
        this._server.emit('player-move', { id: this.id, pos: pos });
        const chunk = this.entity.chunkID.toString();
        this.entity.move(pos);
        if (this.entity.chunkID.toString() != chunk)
            this.updateChunks();
    }
    send(msg) {
        if (typeof msg == 'string')
            msg = chat.convertFromPlain(msg);
        else if (msg instanceof chat.MessageBuilder)
            msg = msg.getGameOutput();
        this.sendPacket('ChatMessage', { message: msg, time: Date.now() });
    }
    sendChunk(id) {
        this.world.getChunk(id).then((chunk) => {
            if (this._server.config.chunkTransportCompression) {
                this.sendPacket('WorldChunkLoad', {
                    x: id[0],
                    y: 0,
                    z: id[1],
                    height: 8,
                    compressed: true,
                    data: zlib.deflateSync(Buffer.from(chunk.data.data.buffer, chunk.data.data.byteOffset)),
                });
            }
            else {
                this.sendPacket('WorldChunkLoad', {
                    x: id[0],
                    y: 0,
                    z: id[1],
                    height: 8,
                    compressed: false,
                    data: Buffer.from(chunk.data.data.buffer, chunk.data.data.byteOffset),
                });
            }
        });
    }
    rotate(rot, pitch) {
        this._server.emit('player-rotate', { id: this.id, rot, pitch });
        this.entity.rotate(rot, pitch);
    }
    kick(reason = '') {
        this.sendPacket('PlayerKick', { reason: reason, date: Date.now() });
        setTimeout(() => {
            this.socket.close();
        }, 20);
    }
    ban(reason = 'Unknown reason') {
        this._players.banPlayer(this.id, reason);
    }
    banIP(reason = 'Unknown reason') {
        this._players.banIP(this.ipAddress, reason);
    }
    updateMovement(key, value) {
        this.sendPacket('PlayerUpdateMovement', { key: key, value: value });
        this.movement[key] = value;
    }
    updatePhysics(key, value) {
        this.sendPacket('PlayerUpdatePhysics', { key: key, value: value });
    }
    applyForce(x, y, z) {
        this.sendPacket('PlayerApplyImpulse', { x, y, z });
    }
    setTab(msg) {
        this.sendPacket('UpdateTextBoard', { type: pServer.UpdateTextBoard.Type.TAB, message: msg, time: Date.now() });
    }
    setFog(mode, density, color, start, stop) {
        if (color != undefined)
            this.sendPacket('EnvironmentFogUpdate', { mode, density, colorRed: color[0], colorGreen: color[1], colorBlue: color[2], start, stop });
        this.sendPacket('EnvironmentFogUpdate', { mode, density });
    }
    setSky(color, colorTop, clouds) {
        this.sendPacket('EnvironmentSkyUpdate', {
            colorRed: color[0],
            colorGreen: color[1],
            colorBlue: color[2],
            colorRedTop: colorTop[0],
            colorGreenTop: colorTop[1],
            colorBlueTop: colorTop[2],
            clouds,
        });
    }
    async updateChunks() {
        const chunk = this.entity.chunkID;
        const loadedchunks = { ...this.chunks };
        for (let w = 0; w <= this._server.config.viewDistance; w++) {
            for (let x = 0 - w; x <= 0 + w; x++) {
                for (let z = 0 - w; z <= 0 + w; z++) {
                    const cid = [chunk[0] + x, chunk[1] + z];
                    const id = cid.toString();
                    if (loadedchunks[id] == undefined) {
                        this.chunks[id] = true;
                        this._chunksToSend.push(cid);
                    }
                    if (this.world.chunks[cid.toString()] != undefined)
                        this.world.chunks[cid.toString()].keepAlive();
                    loadedchunks[cid.toString()] = false;
                }
            }
        }
        const toRemove = Object.entries(loadedchunks);
        toRemove.forEach((item) => {
            if (item[1] == true) {
                delete this.chunks[item[0]];
                const cid = item[0].split(',');
                this.sendPacket('WorldChunkUnload', {
                    x: parseInt(cid[0]),
                    y: 0,
                    z: parseInt(cid[1]),
                    height: 8,
                });
            }
        });
    }
    get getID() {
        return this.id;
    }
    action_blockbreak(data) {
        if (data.x == undefined || data.y == undefined || data.z == undefined)
            return;
        data.cancel = false;
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-blockbreak-${x}`, this, data);
            if (data.cancel)
                return;
        }
        const blockpos = [data.x, data.y, data.z];
        const block = this.world.getBlockSync(blockpos, false);
        const pos = this.entity.data.position;
        if (this.world.isBlockInBounds(blockpos) && vec.dist(pos, blockpos) < 14 && block != undefined && block.unbreakable != true) {
            this.world.setBlock(blockpos, 0, false);
            this._players.sendPacketAll('WorldBlockUpdate', {
                id: 0,
                x: data.x,
                y: data.y,
                z: data.z,
            });
        }
    }
    action_blockplace(data) {
        data.cancel = false;
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-blockplace-${x}`, this, data);
            if (data.cancel)
                return;
        }
        const inv = this.inventory;
        const itemstack = inv.items[inv.selected];
        const pos = this.entity.data.position;
        const blockpos = [data.x, data.y, data.z];
        if (this.world.isBlockInBounds(blockpos) && vec.dist(pos, blockpos) < 14 && itemstack != undefined && itemstack.id != undefined) {
            if (itemstack != null && this._server.registry.items[itemstack.id].block != undefined) {
                const item = this._server.registry.items[itemstack.id];
                //player.inv.remove(id, item.id, 1, {})
                this.world.setBlock(blockpos, item.block.numId, false);
                this._players.sendPacketAll('WorldBlockUpdate', {
                    id: this._players._server.registry.blockPalette[item.block.id],
                    x: data.x,
                    y: data.y,
                    z: data.z,
                });
            }
        }
    }
    action_invclick(data) {
        var _a, _b;
        if (data.inventory == undefined)
            data.inventory = pClient.ActionInventoryClick.TypeInv.MAIN;
        data.cancel = false;
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-invclick-${x}`, this, data);
            if (data.cancel)
                return;
        }
        let inventory;
        let type = 'main';
        switch (data.inventory) {
            case pClient.ActionInventoryClick.TypeInv.MAIN:
                inventory = this.inventory;
                type = 'main';
                break;
            case pClient.ActionInventoryClick.TypeInv.HOOK:
                inventory = this.hookInventory != null ? this.hookInventory : this.inventory;
                type = 'hook';
                break;
            case pClient.ActionInventoryClick.TypeInv.ARMOR:
                inventory = this.entity.data.armor;
                type = 'armor';
                break;
            case pClient.ActionInventoryClick.TypeInv.CRAFTING:
                inventory = this.crafting;
                type = 'crafting';
                break;
            default:
                this.kick('Invalid inventory');
                return;
        }
        if (-2 < data.slot && data.slot <= this.inventory.size && (data.inventory != pClient.ActionInventoryClick.TypeInv.CRAFTING || data.slot < 4)) {
            if (data.type == pClient.ActionInventoryClick.Type.LEFT)
                this.inventory.action_left(inventory, data.slot, type);
            else if (data.type == pClient.ActionInventoryClick.Type.RIGHT)
                this.inventory.action_right(inventory, data.slot, type);
            else if (data.type == pClient.ActionInventoryClick.Type.SELECT && -1 < data.slot && data.slot < 9) {
                this.inventory.select(data.slot);
            }
        }
        else if (data.inventory == pClient.ActionInventoryClick.TypeInv.CRAFTING && data.slot < 4) {
        }
        if (type == 'armor') {
            const item = (_a = inventory.items[data.slot]) === null || _a === void 0 ? void 0 : _a.id;
            this._players.sendPacketAll('EntityArmor', {
                uuid: this.entity.id,
                type: data.slot,
                id: item,
            });
        }
        else if (type == 'main' && data.slot == inventory.selected) {
            const item = (_b = inventory.items[data.slot]) === null || _b === void 0 ? void 0 : _b.id;
            this._players.sendPacketAllExcept('EntityHeldItem', {
                uuid: this.entity.id,
                id: item,
            }, this);
            this.entity.data.helditem = item;
        }
    }
    action_blockpick(data) {
        data.cancel = false;
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-blockpick-${x}`, this, data);
            if (data.cancel)
                return;
        }
        this.inventory.action_switch(data.slot, data.slot2);
    }
    action_chatmessage(data) {
        if (data.message != '') {
            data.cancel = false;
            if (this._server.config.rateLimitChatMessages) {
                this.cache.rateLimitChatMessageCounter = this.cache.rateLimitChatMessageCounter + 1;
                this.cache.rateLimitChatMessageTime = Date.now();
                this.cache.rateLimitChatMessageLastClear = this.cache.rateLimitChatMessageLastClear + 100;
                if (this.cache.rateLimitChatMessageLastClear + 2000 < this.cache.rateLimitChatMessageTime) {
                    this.cache.rateLimitChatMessageLastClear = Date.now();
                    this.cache.rateLimitChatMessageCounter = this.cache.rateLimitChatMessageCounter - 1;
                }
                if (this.cache.rateLimitChatMessageCounter > 10) {
                    this.kick('Spamming in chat');
                    return;
                }
            }
            for (let x = 0; x <= 5; x++) {
                this._server.emit(`player-message-${x}`, this, data);
                if (data.cancel)
                    return;
            }
            if (data.message.charAt(0) == '/') {
                const arg = data.message.split(' ');
                const command = arg[0];
                arg.shift();
                this._server.emit('player-command', this, command, arg);
                if (this._players._server.registry.commands[command]) {
                    try {
                        this._players._server.registry.commands[command].trigger(this, arg);
                    }
                    catch (e) {
                        this._server.log.error(`User ^R${this.nickname}^r tried to execute command ^R${command}^r and it failed! \n ^R`, e);
                        this.send(new chat.MessageBuilder().red('An error occurred during the execution of this command!'));
                    }
                }
                else
                    this.send(new chat.MessageBuilder().red("This command doesn't exist! Check /help for list of available commands."));
            }
            else {
                let shortMessage = data.message;
                if (data.message.length > 512) {
                    shortMessage = data.message.slice(0, 512);
                }
                const msg = new chat.MessageBuilder().white(this.displayName).hex('#eeeeee').text(' » ').white(shortMessage);
                this._server.emit('chat-message', msg, this);
                chat.sendMlt([this._server.console.executorchat, ...Object.values(this._players.getAll())], msg);
            }
        }
    }
    async action_move(data) {
        if (data.x == undefined || data.y == undefined || data.z == undefined)
            return;
        const blockPos = { x: Math.floor(data.x), y: Math.floor(data.y), z: Math.floor(data.z), status: false };
        const pos = this.entity.data.position;
        if (this.cache.lastBlockCheck.x == blockPos.x &&
            this.cache.lastBlockCheck.y == blockPos.y &&
            this.cache.lastBlockCheck.z == blockPos.z &&
            this.cache.lastBlockCheck.status == true) {
            this.sendPacket('PlayerTeleport', { x: pos[0], y: pos[1], z: pos[2] });
            return;
        }
        const local = helper_1.globalToChunk([data.x, data.y, data.z]);
        data.cancel = false;
        if (this.world.chunks[local.id.toString()] == undefined) {
            data.cancel = true;
        }
        else if (data.y < 256) {
            const blockID = this.world.chunks[local.id.toString()].data.get(Math.floor(local.pos[0]), Math.floor(local.pos[1]), Math.floor(local.pos[2]));
            const block = this._server.registry.blocks[this._server.registry.blockIDmap[blockID]];
            if (block == undefined || block.options == undefined)
                data.cancel = true;
            else if (block.options.solid != false && block.options.fluid != true)
                data.cancel = true;
        }
        blockPos.status = data.cancel;
        const move = [data.x, data.y, data.z];
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-move-${x}`, this, data);
            if (data.cancel) {
                this.sendPacket('PlayerTeleport', { x: pos[0], y: pos[1], z: pos[2] });
                this.cache.lastBlockCheck = blockPos;
                return;
            }
        }
        if (Math.abs(data.x) > 120000 || data.y > 120000 || Math.abs(data.z) > 120000) {
            this.sendPacket('PlayerTeleport', { x: pos[0], y: pos[1], z: pos[2] });
            return;
        }
        this.cache.lastBlockCheck = blockPos;
        if (vec.dist(pos, move) < 22)
            this.move(move);
    }
    action_click(data) {
        data.cancel = false;
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-click-${x}`, this, data);
            if (data.cancel)
                return;
        }
    }
    action_entityclick(data) {
        data.cancel = false;
        for (let x = 0; x <= 5; x++) {
            this._server.emit(`player-entityclick-${x}`, this, data);
            if (data.cancel)
                return;
        }
    }
}
exports.Player = Player;
exports.defaultPlayerMovement = {
    airJumps: 0,
    airMoveMult: 0.3,
    crouch: false,
    crouchMoveMult: 0.8,
    jumpForce: 6,
    jumpImpulse: 8.5,
    jumpTime: 500,
    jumping: false,
    maxSpeed: 7.5,
    moveForce: 38,
    responsiveness: 20,
    running: false,
    runningFriction: 0,
    sprint: false,
    sprintMoveMult: 1.2,
    standingFriction: 2,
};
//# sourceMappingURL=player.js.map