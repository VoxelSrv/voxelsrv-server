import * as fs from 'fs';

import * as types from '../../types';
import type { Server } from '../../server';
import * as format from '../../formats/world';
import { Block } from '../registry';

import * as zlib from 'zlib';
import { promisify } from 'util';

import type { ICoreWorldGenerator, ICoreWorld } from 'voxelservercore/interfaces/world';

const inflatePromise: (arg1: zlib.InputType) => Promise<Buffer> = promisify(zlib.inflate);
const readFilePromise: (arg1: any) => Promise<Buffer> = promisify(fs.readFile);

import ndarray = require('ndarray');
import { WorldManager } from './manager';
import { getRandomSeed, globalToChunk } from './helper';


export class World implements ICoreWorld {
	name: string;
	seed: number;
	generator: any;
	version: number;
	chunks: { [index: string]: Chunk };
	entities: object;
	folder: string;
	chunkFolder: string;
	autoSaveInterval: any;
	chunkUnloadInterval: any;
	active: boolean = false;

	_borderChunkArray: types.IView3duint16 = null;

	_server: Server;
	_worldMen: WorldManager;

	constructor(name: string, seed: number, generator: string, ver: number, server: Server) {
		this._server = server;
		this._worldMen = server.worlds;
		this.name = name;
		this.seed = seed != 0 ? seed : getRandomSeed();
		this.generator = new server.worlds.worldGenerator[generator](this.seed, server);
		if (ver == null) this.version = 1;
		else this.version = ver;
		this.chunks = {};
		this.entities = {};
		this.folder = './worlds/' + name;
		this.chunkFolder = './worlds/' + name + '/chunks';

		if (this._server.config.world.save) {
			if (!fs.existsSync(this.folder)) fs.mkdirSync(this.folder);
			if (!fs.existsSync(this.chunkFolder)) fs.mkdirSync(this.chunkFolder);

			fs.writeFile(this.folder + '/world.json', JSON.stringify(this.getSettings()), function (err) {
				if (err) this._server.log.error('Cant save world ' + this.name + '! Reason: ' + err);
			});

			this.autoSaveInterval = setInterval(async () => {
				this.saveAll();
			}, 30000);
		}

		this.chunkUnloadInterval = setInterval(async () => {
			const chunklist = Object.keys(this.chunks);
			chunklist.forEach((id) => {
				if (Date.now() - this.chunks[id].lastUse >= 5000 && !!this.chunks[id].forceload) this.unloadChunk(this.stringToID(id));
			});
		}, 1000);
	}

	stringToID(id: string): types.XZ {
		const x = id.split(',');

		return [parseInt(x[0]), parseInt(x[1])];
	}

	async getChunk(id: types.XZ): Promise<Chunk> {
		const idS = id.toString();

		if (!this.isChunkInBounds(id)) {
			return this.getBorderChunk(id);
		}

		if (this.chunks[idS] != undefined && this.chunks[idS].metadata.stage > 0) {
			this.chunks[idS].keepAlive();
			return this.chunks[idS];
		}

		if (this.existChunk(id)) {
			const data = await this.readChunk(id);
			this.chunks[idS] = new Chunk(id, data.chunk, data.metadata, false);
			this.chunks[idS].keepAlive();
		} else {
			this.chunks[idS] = new Chunk(id, await this.generator.generateBaseChunk(id), { ...this._worldMen._baseMetadata }, false);
			this.chunks[idS].keepAlive();
		}

		if (this.chunks[idS].metadata.stage < 1) {
			await this.generator.generateChunk(id, this.chunks[idS].data, this);
			this.chunks[idS].metadata.stage = 1;
		}

		return this.chunks[idS];
	}

	getBorderChunk(id: types.XZ) {
		if (this._borderChunkArray == null) {
			this._borderChunkArray = new ndarray(new Uint16Array(262144), [32, 256, 32]);
			this._borderChunkArray.data.fill(this._server.registry.blockPalette[this._server.config.world.borderBlock] || 1);
		}

		return new Chunk(id, this._borderChunkArray, {}, false);
	}

	getNeighborIDsChunks(id: types.XZ): types.XZ[] {
		const obj = [];
		let x: number, z: number;

		for (x = id[0] - 1; x != id[0] + 2; x++) {
			for (z = id[1] - 1; z != id[1] + 2; z++) {
				const id: types.XZ = [x, z];
				if (this.isChunkInBounds(id)) obj.push([x, z]);
			}
		}

		return obj;
	}

	existChunk(id: types.XZ): boolean {
		const idS = id.toString();

		const chk = fs.existsSync(this.chunkFolder + '/' + idS + '.chk');
		return chk || this.chunks[id.toString()] != undefined;
	}

	saveAll(): void {
		if (!this._server.config.world.save) return;
		const chunklist = Object.keys(this.chunks);

		fs.writeFile(this.folder + '/world.json', JSON.stringify(this.getSettings()), function (err) {
			if (err) this._server.log.error('Cant save world ' + this.name + '! Reason: ' + err);
		});

		chunklist.forEach((id) => {
			this.saveChunk(this.stringToID(id));
		});
	}

	async saveChunk(id: types.XZ) {
		if (this.isChunkInBounds(id)) {
			const idS = id.toString();

			const chunk = this.chunks[idS];

			if (chunk == undefined || chunk.metadata == undefined || chunk.data == undefined) return;
			const message = format.chunk.create({
				blocks: Buffer.from(chunk.data.data.buffer, chunk.data.data.byteOffset),
				version: chunk.metadata.ver,
				stage: chunk.metadata.stage,
			});

			const buffer = format.chunk.encode(message).finish();
			const data = zlib.deflateSync(buffer);

			fs.writeFile(this.chunkFolder + '/' + idS + '.chk', data, function (err) {
				if (err) this._server.log.console.error('Cant save chunk ' + id + '! Reason: ' + err);
			});
		}
	}

	async readChunk(id: types.XZ): Promise<{ chunk: types.IView3duint16; metadata: any }> {
		const idS = id.toString();

		const exist = this.existChunk(id);
		let chunk = null;
		let meta = null;
		if (exist) {
			const data: Buffer = await readFilePromise(this.chunkFolder + '/' + idS + '.chk');
			const array: Buffer = await inflatePromise(data);
			const decoded = format.chunk.decode(array);

			chunk = new ndarray(new Uint16Array(decoded.blocks.buffer, decoded.blocks.byteOffset), [
				this._worldMen.chunkWitdh,
				this._worldMen.chunkHeight,
				this._worldMen.chunkWitdh,
			]);
			meta = { stage: decoded.stage, version: decoded.version };
		}
		return { chunk: chunk, metadata: meta };
	}

	readChunkSync(id: types.XZ): { chunk: types.IView3duint16; metadata: any } {
		const idS = id.toString();

		const exist = this.existChunk(id);
		let chunk = null;
		let meta = null;
		if (exist) {
			const data = fs.readFileSync(this.chunkFolder + '/' + idS + '.chk');
			const array = zlib.inflateSync(data);
			const decoded = format.chunk.decode(array);

			chunk = new ndarray(new Uint16Array(decoded.blocks.buffer, decoded.blocks.byteOffset), [
				this._worldMen.chunkWitdh,
				this._worldMen.chunkHeight,
				this._worldMen.chunkWitdh,
			]);
			meta = { stage: decoded.stage, version: decoded.version };
		}
		return { chunk: chunk, metadata: meta };
	}

	unloadChunk(id: types.XZ) {
		if (this._server.config.world.save) this.saveChunk(id);
		delete this.chunks[id.toString()];
	}

	isChunkInBounds(id: types.XZ) {
		const border = this._server.config.world.border;
		return Math.abs(id[0]) <= border && Math.abs(id[1]) <= border;
	}

	isBlockInBounds(pos: types.XYZ) {
		const border = this._server.config.world.border;
		return Math.abs(Math.floor(pos[0] / 32)) <= border && Math.abs(Math.floor(pos[2] / 32)) <= border;
	}

	getSettings() {
		return {
			name: this.name,
			seed: this.seed,
			generator: this.generator.name,
			version: this.version,
		};
	}

	async getBlock(data: types.XYZ, allowgen: boolean): Promise<Block> {
		const local = globalToChunk(data);

		if ((this.isChunkInBounds(local.id) && this.existChunk(local.id)) || allowgen) {
			return this._server.registry.blocks[
				this._server.registry.blockIDmap[(await this.getChunk(local.id)).data.get(local.pos[0], local.pos[1], local.pos[2])]
			];
		}

		return this._server.registry.blocks['air'];
	}

	getBlockSync(data: types.XYZ, allowgen: boolean = false): Block {
		const local = globalToChunk(data);
		const cid: string = local.id.toString();

		if (this.isChunkInBounds(local.id)) {
			if (this.chunks[cid] != undefined) {
				const id = this.chunks[cid].data.get(local.pos[0], local.pos[1], local.pos[2]);
				this.chunks[cid].keepAlive();
				return this._server.registry.blocks[this._server.registry.blockIDmap[id]];
			} else if (this.existChunk(local.id)) {
				const data = this.readChunkSync(local.id);
				this.chunks[cid] = new Chunk(local.id, data.chunk, data.metadata, false);
				this.chunks[cid].keepAlive();
				return this._server.registry.blocks[this._server.registry.blockIDmap[this.chunks[cid].data.get(local.pos[0], local.pos[1], local.pos[2])]];
			} else if (allowgen) {
				return this._server.registry.blocks[this._server.registry.blockIDmap[this.generator.getBlock(data[0], data[1], data[2])]];
			}
		}
		return this._server.registry.blocks['air'];
	}

	async setBlock(data: types.XYZ, block: string | number | Block, allowgen: boolean = false) {
		const local = globalToChunk(data);
		if (this.isChunkInBounds(local.id)) {
			let id = 0;
			switch (typeof block) {
				case 'number':
					id = block;
					break;
				case 'object':
					id = block.numId;
					break;
				case 'string':
					id = this._server.registry.blockPalette[block];
				default:
					return;
			}

			const chunk = await this.getChunk(local.id);
			chunk.data.set(local.pos[0], local.pos[1], local.pos[2], id);
		}
	}

	async setRawBlock(data: types.XYZ, block: number) {}

	unload() {
		this.saveAll();
		clearInterval(this.autoSaveInterval);
		clearInterval(this.chunkUnloadInterval);

		setTimeout(() => {
			delete this._worldMen.worlds[this.name];
		}, 50);
	}
}

export class Chunk {
	id: types.XZ;
	data: types.IView3duint16;
	metadata: any;
	lastUse: number;
	forceload: boolean;

	constructor(id: types.XZ, blockdata: types.IView3duint16, metadata: object, bool: boolean) {
		this.id = id;
		this.data = blockdata;
		this.metadata = metadata;
		this.lastUse = Date.now();
		this.forceload = !!bool;
	}

	set(x: number, y: number, z: number, id: number) {
		this.data.set(x, y, z, id);
	}

	get(x: number, y: number, z: number): number {
		return this.data.get(x, y, z);
	}

	keepAlive() {
		this.lastUse = Date.now();
	}
}

export interface IWorldGenerator extends ICoreWorldGenerator {
	getBlock(x: number, y: number, z: number, biomes): number;
	getBiome(x: number, z: number);
	getBiomesAt(x: number, z: number): { main; possible: { [index: string]: number }; height: number; size: number };
	generateBaseChunk(id: types.XZ, chunk: types.IView3duint16): Promise<types.IView3duint16>;
	generateChunk(id: types.XZ, chunk: types.IView3duint16, world: World): Promise<void>;
}

interface IWorldGeneratorConstructor {
	new (seed: number, server: Server): IWorldGenerator;
}
