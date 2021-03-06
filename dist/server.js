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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs"));
const registry_1 = require("./lib/registry");
const manager_1 = require("./lib/world/manager");
const permissions_1 = require("./lib/permissions");
const player_1 = require("./lib/player/player");
const chat_1 = require("./lib/chat");
const chat = __importStar(require("./lib/chat"));
const semver = __importStar(require("semver"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const uuid_1 = require("uuid");
const normal_1 = __importDefault(require("./default/worldgen/normal"));
const flat_1 = __importDefault(require("./default/worldgen/flat"));
const values_1 = require("./values");
const console_1 = require("./lib/console");
const values_2 = require("voxelservercore/values");
const api_1 = require("voxelservercore/api");
class Server extends events_1.EventEmitter {
    constructor(startServer = true) {
        super();
        this.name = 'VoxelSrv Server';
        this.version = values_1.serverVersion;
        this.playerCount = 0;
        this.status = 'none';
        this.setMaxListeners(200);
        api_1.server_setMessageBuilder(chat_1.MessageBuilder);
        api_1.server_setMessageStringify(chat.convertToPlain);
        if (!fs.existsSync('./logs/'))
            fs.mkdirSync('./logs/');
        if (fs.existsSync('./logs/latest.log'))
            fs.renameSync('./logs/latest.log', `./logs/${Date.now()}.log`);
        this.log = new console_1.Logging(fs.createWriteStream('./logs/latest.log', { flags: 'w' }));
        this.overrides = { worldGenWorkers: ['./', ''] };
        this.status = 'initiating';
        this.console = new Console(this);
        this.registry = new registry_1.Registry(this);
        this.worlds = new manager_1.WorldManager(this);
        this.entities = new manager_1.EntityManager(this);
        this.permissions = new permissions_1.PermissionManager(this);
        this.players = new player_1.PlayerManager(this);
        this.plugins = new PluginManager(this);
        if (startServer) {
            this.startServer();
        }
    }
    async initDefaults() {
        (await Promise.resolve().then(() => __importStar(require('./default/blocks')))).setup(this.registry);
        (await Promise.resolve().then(() => __importStar(require('./default/items')))).setup(this.registry);
        (await Promise.resolve().then(() => __importStar(require('./default/commands')))).setup(this.registry, this);
        this.worlds.addGenerator('normal', normal_1.default);
        this.worlds.addGenerator('flat', flat_1.default);
    }
    async initDefWorld() {
        if (this.worlds.exist('default') == false)
            this.worlds.create('default', this.config.world.seed, this.config.world.generator);
        else
            this.worlds.load('default');
    }
    async startServer() {
        if (this.status != 'initiating')
            return;
        this.status = 'starting';
        ['./logs', './plugins', './players', './worlds', './config'].forEach((element) => {
            if (!fs.existsSync(element)) {
                try {
                    fs.mkdirSync(element);
                    this.log.normal([
                        { text: `Created missing directory: `, color: 'orange' },
                        { text: element, color: 'white' },
                    ]);
                }
                catch (e) {
                    this.log.normal([{ text: `Can't create directory: ${element}! Reason: ${e}`, color: 'red' }]);
                    process.exit();
                }
            }
        });
        this.log.normal([
            { text: `Starting VoxelSRV server version: ${values_1.serverVersion} `, color: 'yellow' },
            { text: `[Protocol: ${values_1.serverProtocol}]`, color: 'lightblue' },
        ]);
        const tmpConfig = this.loadConfig('', 'config');
        this.config = { ...values_1.serverDefaultConfig, ...tmpConfig };
        this.config.world = { ...values_1.serverDefaultConfig.world, ...tmpConfig.world };
        this.permissions.loadGroups(this.loadConfig('', 'permissions'));
        this.saveConfig('', 'config', this.config);
        this.emit('server-config-update', this.config);
        if (this.config.consoleInput) {
            Promise.resolve().then(() => __importStar(require('./lib/console-exec'))).then((x) => {
                x.startCmd(this, this.registry.commands);
            });
        }
        if (this.config.plugins.length > 0)
            this.plugins._loadPlugins(this.config.plugins);
        this.registry._loadPalette();
        await this.initDefaults();
        this.emit('registry-define');
        this.registry._finalize();
        await this.initDefWorld();
        if (this.config.public) {
            this.heartbeatPing();
            this.heartbeatUpdater = setInterval(() => {
                const address = (this.config.useWSS ? 'wss://' : 'ws://') + `${this.config.address}:${this.config.port}`;
                node_fetch_1.default(`${values_1.heartbeatServer}/api/servers`)
                    .then((res) => res.json())
                    .then((json) => {
                    if (json[address] == undefined) {
                        this.heartbeatPing();
                    }
                });
            }, 50000);
        }
        this.status = 'active';
        this.log.normal([
            { text: 'Server started on port: ', color: 'yellow' },
            { text: this.config.port.toString(), color: 'lightyellow' },
        ]);
        this.emit('server-started', this);
    }
    heartbeatPing() {
        const address = (this.config.useWSS ? 'wss://' : 'ws://') + `${this.config.address}:${this.config.port}`;
        node_fetch_1.default(`${values_1.heartbeatServer}/api/addServer?ip=${address}&type=0`)
            .then((res) => res.json())
            .then((json) => { });
    }
    async connectPlayer(socket) {
        if (this.status != 'active')
            return;
        if (this.config.debugProtocol) {
            socket.debugListener = (sender, type, data) => {
                console.log(sender, type, data);
            };
        }
        const secret = this.config.requireAuth ? `${this.config.name}-${uuid_1.v4()}-${uuid_1.v4()}` : '';
        const serverSecret = this.config.requireAuth ? `${uuid_1.v4()}-${uuid_1.v4()}` : '';
        if (this.config.requireAuth) {
            await node_fetch_1.default(values_1.heartbeatServer + '/api/registerAuth', {
                method: 'post',
                body: JSON.stringify({ token: secret, secret: serverSecret }),
                headers: { 'Content-Type': 'application/json' },
            });
        }
        socket.send('LoginRequest', {
            name: this.config.name,
            motd: this.config.motd,
            protocol: values_1.serverProtocol,
            maxPlayers: this.config.maxplayers,
            onlinePlayers: this.playerCount,
            software: `VoxelSrv-Server`,
            auth: this.config.requireAuth,
            secret: secret,
        });
        let loginTimeout = true;
        socket.once('LoginResponse', async (loginData) => {
            loginTimeout = false;
            const check = await this.authenticatePlayer(loginData, secret, serverSecret);
            if (!check.valid) {
                socket.send('PlayerKick', { reason: check.message, time: Date.now() });
                socket.close();
                return;
            }
            if (this.players.isBanned(loginData.uuid)) {
                socket.send('PlayerKick', { reason: 'You are banned!\nReason: ' + this.players.getBanReason(loginData.uuid), time: Date.now() });
                socket.close();
                return;
            }
            else if (this.players.isIPBanned(socket.ip)) {
                socket.send('PlayerKick', { reason: 'You are banned!\nReason: ' + this.players.getIPBanReason(socket.ip), time: Date.now() });
                socket.close();
                return;
            }
            if (this.playerCount >= this.config.maxplayers) {
                socket.send('PlayerKick', { reason: 'Server is full', time: Date.now() });
                socket.close();
                return;
            }
            if (this.players.get(loginData.uuid) != null) {
                socket.send('PlayerKick', {
                    reason: 'Your account is already online!',
                    time: Date.now(),
                });
                socket.close();
            }
            else {
                this.emit('player-connection', loginData.uuid, socket);
                var player = this.players.create(loginData.uuid, loginData, socket);
                socket.send('LoginSuccess', {
                    xPos: player.entity.data.position[0],
                    yPos: player.entity.data.position[1],
                    zPos: player.entity.data.position[2],
                    inventory: JSON.stringify(player.inventory.getObject()),
                    blocksDef: JSON.stringify(this.registry._blockRegistryObject),
                    itemsDef: JSON.stringify(this.registry._itemRegistryObject),
                    armor: JSON.stringify(player.entity.data.armor.getObject()),
                    movement: JSON.stringify(player.movement),
                });
                socket.send('PlayerHealth', {
                    value: player.entity.data.health,
                });
                socket.send('PlayerEntity', { uuid: player.entity.id, model: 'player', texture: 'skins:' + player.id });
                Object.entries(player.world.entities).forEach((data) => {
                    socket.send('EntityCreate', {
                        uuid: data[0],
                        data: JSON.stringify(data[1].getObject().data),
                    });
                });
                const joinMsg = new chat_1.MessageBuilder().hex('#b5f598').text(`${player.displayName} joined the game!`);
                chat.sendMlt([this.console.executorchat, ...Object.values(this.players.getAll())], joinMsg);
                chat.event.emit('system-message', joinMsg);
                this.playerCount = this.playerCount + 1;
                socket.on('close', () => {
                    this.emit('player-disconnect', loginData.uuid);
                    const leaveMsg = new chat_1.MessageBuilder().hex('#f59898').text(`${player.displayName} left the game!`);
                    chat.sendMlt([this.console.executorchat, ...Object.values(this.players.getAll())], leaveMsg);
                    chat.event.emit('system-message', leaveMsg);
                    player.remove();
                    this.playerCount = this.playerCount - 1;
                });
                socket.on('ActionMessage', async (data) => {
                    player.action_chatmessage(data);
                });
                socket.on('ActionBlockBreak', async (data) => {
                    player.action_blockbreak(data);
                });
                socket.on('ActionBlockPlace', async (data) => {
                    player.action_blockplace(data);
                });
                socket.on('ActionMove', async (data) => {
                    player.action_move(data);
                });
                socket.on('ActionMoveLook', async (data) => {
                    player.action_move(data);
                    player.rotate(data.rotation, data.pitch);
                });
                socket.on('ActionLook', async (data) => {
                    player.rotate(data.rotation, data.pitch);
                });
                socket.on('ActionInventoryClick', async (data) => {
                    player.action_invclick(data);
                });
                socket.on('ActionClick', async (data) => {
                    player.action_click(data);
                });
                socket.on('ActionClickEntity', async (data) => {
                    player.action_click(data);
                });
                socket.on('ActionInventoryPick', async (data) => {
                    player.action_blockpick(data);
                });
            }
        });
        setTimeout(() => {
            if (loginTimeout == true) {
                socket.send('PlayerKick', { reason: 'Timeout!' });
                socket.close();
            }
        }, 10000);
    }
    async authenticatePlayer(data, secret, serverSecret) {
        if (data == undefined)
            return { valid: false, auth: false, message: 'No data!' };
        else if (data.username == undefined || data.username.length > 18 || data.username.length < 3 || values_1.invalidNicknameRegex.test(data.username))
            return { valid: false, auth: false, message: 'Invalid username - ' + data.username };
        else if (data.protocol == undefined || data.protocol != values_1.serverProtocol)
            return { valid: false, auth: false, message: 'Unsupported protocol' };
        if (this.config.requireAuth) {
            const checkLogin = await (await node_fetch_1.default(values_1.heartbeatServer + '/api/validateAuth', {
                method: 'post',
                body: JSON.stringify({ uuid: data.uuid, token: data.secret, secret: secret, serverSecret: serverSecret }),
                headers: { 'Content-Type': 'application/json' },
            })).json();
            if (checkLogin.valid) {
                return { valid: true, auth: true, message: '' };
            }
            else {
                data.uuid = 'nl-' + data.username.toLowerCase();
                data.username = '*' + data.username;
                return { valid: this.config.allowNotLogged, auth: false, message: 'You need to be logged' };
            }
        }
        else {
            data.uuid = 'nl-' + data.username.toLowerCase();
            return { valid: true, auth: false, message: '' };
        }
    }
    stopServer() {
        if (this.heartbeatUpdater != undefined) {
            clearInterval(this.heartbeatUpdater);
        }
        this.status = 'stopping';
        this.emit('server-stop', this);
        this.log.normal([{ text: 'Stopping server...', color: 'orange' }]);
        this.saveConfig('', 'permissions', this.permissions.toObject());
        Object.values(this.players.getAll()).forEach((player) => {
            player.kick('Server close');
            player.socket.close();
        });
        Object.values(this.worlds.worlds).forEach((world) => {
            world.unload();
        });
        setTimeout(() => {
            this.emit('server-stopped', this);
            this.removeAllListeners();
            Object.keys(this).forEach((x) => {
                Object.keys(this[x]).forEach((y) => {
                    if (typeof this[x][y] == 'object')
                        this[x][y] = null;
                });
                if (typeof this[x] == 'object')
                    this[x] = null;
            });
        }, 2000);
    }
    loadConfig(namespace, config) {
        if (fs.existsSync(`./config/${namespace}/${config}.json`)) {
            try {
                const data = fs.readFileSync(`./config/${namespace}/${config}.json`);
                return JSON.parse(data.toString());
            }
            catch (e) {
                this.log.error(`Invalid config file (./config/${namespace}/${config}.json)!\n${e}`);
                return {};
            }
        }
        else
            return {};
    }
    saveConfig(namespace, config, data) {
        if (!fs.existsSync(`./config/${namespace}`))
            fs.mkdirSync(`./config/${namespace}`, { recursive: true });
        fs.writeFile(`./config/${namespace}/${config}.json`, JSON.stringify(data, null, 2), function (err) {
            if (err)
                this.log.error(`Cant save config ${namespace}/${config}! Reason: ${err}`);
        });
    }
}
exports.Server = Server;
class Console {
    constructor(s) {
        this.executor = {
            name: '#console',
            id: '#console',
            send: (...args) => this.s.log.normal(...args),
            permissions: new permissions_1.PermissionHolder({ '*': true }),
        };
        this.executorchat = { ...this.executor, send: (...args) => this.s.log.chat(...args) };
        this.s = s;
    }
}
class PluginManager {
    constructor(server) {
        this._server = server;
        this._plugins = {};
    }
    get(name) {
        return this._plugins[name];
    }
    getAll() {
        return this._plugins;
    }
    load(path) {
        try {
            const plugin = path.startsWith('local:') ? require(`${process.cwd()}/plugins/${path.slice(6)}`)(this._server) : require(path)(this._server);
            if (plugin.game == '*' && !semver.satisfies(values_2.version, plugin.supportedAPI)) {
                this._server.log.warn([
                    new chat.ChatComponent('Plugin ', 'orange'),
                    new chat.ChatComponent(plugin.name, 'yellow'),
                    new chat.ChatComponent(` might not support this version of server (VoxelServerCore ${values_2.version})!`, 'orange'),
                ]);
                const min = semver.minVersion(plugin.supportedAPI);
                const max = semver.maxSatisfying(plugin.supportedAPI);
                if (!!min && !!max && (semver.gt(values_1.serverVersion, max) || semver.lt(values_1.serverVersion, min)))
                    this._server.log.warn(`It only support versions from ${min} to ${max}.`);
                else if (!!min && !max && semver.lt(values_1.serverVersion, min))
                    this._server.log.warn(`It only support versions ${min} of VoxelServerCore or newer.`);
                else if (!min && !!max && semver.gt(values_1.serverVersion, max))
                    this._server.log.warn(`It only support versions ${max} of VoxelServerCore or older.`);
            }
            else if (plugin.game == 'voxelsrv' && !semver.satisfies(values_1.serverVersion, plugin.supportedGameAPI)) {
                this._server.log.warn([
                    new chat.ChatComponent('Plugin ', 'orange'),
                    new chat.ChatComponent(plugin.name, 'yellow'),
                    new chat.ChatComponent(` might not support this version of server (VoxelSrv Server ${values_1.serverVersion})!`, 'orange'),
                ]);
                const min = semver.minVersion(plugin.supportedGameAPI);
                const max = semver.maxSatisfying(plugin.supportedGameAPI);
                if (!!min && !!max && (semver.gt(values_1.serverVersion, max) || semver.lt(values_1.serverVersion, min)))
                    this._server.log.warn(`It only support versions from ${min} to ${max}.`);
                else if (!!min && !max && semver.lt(values_1.serverVersion, min))
                    this._server.log.warn(`It only support versions ${min} of VoxelSrv Server or newer.`);
                else if (!min && !!max && semver.gt(values_1.serverVersion, max))
                    this._server.log.warn(`It only support versions ${max} of VoxelSrv Server or older.`);
            }
            else if (plugin.game != 'voxelsrv' && plugin.game != '*') {
                this._server.log.warn([
                    new chat.ChatComponent('Plugin ', 'orange'),
                    new chat.ChatComponent(plugin.name, 'yellow'),
                    new chat.ChatComponent(' might not support this version of server!', 'orange'),
                ]);
            }
            this._server.emit('plugin-load', plugin);
            this._plugins[plugin.name] = plugin;
        }
        catch (e) {
            this._server.emit('plugin-error', path);
            this._server.log.error(`Can't load plugin ${path}!`);
            console.error(e);
            return e;
        }
    }
    loadAllNotLoaded() {
        return false;
    }
    _loadPlugins(list) {
        this._server.emit('plugin-load-list', list);
        for (const file of list) {
            this.load(file);
        }
    }
}
//# sourceMappingURL=server.js.map