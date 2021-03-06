import * as Stack from './stack';
import { BagOfCells } from './boc';

const { crc16xmodem } = require('crc');
const ffi = require('ffi-napi');
const ref = require('ref-napi');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

function delay(ms : number, func : Function) : Promise<any> {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			func()
				.then(resolve)
				.catch(reject);
		}, ms);
	});
}

class TONAddress {
	static from(string : string) : TONAddress {
		string = string.trim();

		if (/^-?\d+\:[a-fA-F0-9]{64}$/.test(string)) {
			let workchain = parseInt(string.substring(0, string.indexOf(':')));
			let address = Buffer.from(string.substring(string.indexOf(':')+1), 'hex');
			return new TONAddress(workchain, address);
		} else if (string.length == 48) {
			let buffer = Buffer.from(string, 'base64');
			let workchain = buffer[1];
			let address = buffer.slice(2, 34);
			let crc = crc16xmodem(buffer.slice(0, 34));
			if ((crc >> 8) !== buffer[34] || (crc & 0xff) !== buffer[35])
				throw new Error("TONAddress: CRC hashsum of the address is different from the source: " + string);
			return new TONAddress(workchain, address);
		} else {
			throw new Error("TONAddress: Failed to parse TON address: " + string);
		}
	}

	bounceable : boolean = false;
	testnet : boolean = true;

	workchain : number;
	address : Buffer;
	constructor(workchain : number, address : Buffer | string, bounceable : boolean = false, testnet : boolean = true) {
		this.workchain = workchain;
		if (typeof address === 'string')
			address = Buffer.from(address, 'hex');
		if (address.length !== 32)
			throw new Error("TONAddress: bad length of address buffer (" + address.length + ", should be: 32)");
		this.address = address;
		this.bounceable = bounceable;
		this.testnet = testnet;
	}

	pack() : string {
		let buffer = Buffer.alloc(36);
		buffer[0] = 0x51 - (this.bounceable ? 0x40 : 0) + (this.testnet ? 0x80 : 0);
		buffer[1] = this.workchain;
		buffer.set(this.address, 2);
		let crc = crc16xmodem(buffer.slice(0, 34));
		buffer[34] = crc >> 8;
		buffer[35] = crc & 0xff;
		return buffer
					.toString('base64')
					.replace(/\-/g, '+')
					.replace(/\_/g, '/');
	}

	toString() {
		return this.workchain + ":" + this.address.toString('hex');
	}
}

interface BlockID {
	workchain: number;
	shard: BigInt;
	seqno: BigInt;
	root_hash: Buffer;
	file_hash: Buffer;
}
interface Account {
	address: TONAddress,
	balance : BigInt;
	code: BagOfCells,
	data: BagOfCells,
	lastTransaction: TransactionID;
	block: BlockID;
	sync?: Date;
}
interface TransactionID {
	lt: BigInt;
	hash: Buffer;
}
interface Transactions {
	transactions: Array<Transaction>;
	last: TransactionID;
}
interface Transaction {
	id: TransactionID;
	time: Date;
	data: Buffer;
	fee: BigInt;
	storage_fee: BigInt;
	other_fee: BigInt;
	inmsg: TransactionMessage;
	outmsgs: TransactionMessage[];
}
class TransactionMessage {
	source?: TONAddress;
	destination?: TONAddress;
	value: BigInt;
	fwd_fee: BigInt;
	ihr_fee: BigInt;
	created_lt: BigInt;
	body_hash: Buffer;
	message?: string;
	is_message_encrypted: boolean;

	constructor(raw : any) {
		try {
			this.source = TONAddress.from(raw.source);
		} catch (e) {
			this.source = undefined;
		}

		try {
			this.destination = TONAddress.from(raw.destination);
		} catch (e) {
			this.destination = undefined;
		}

		this.value = BigInt(raw.value);
		this.fwd_fee = BigInt(raw.fwd_fee);
		this.ihr_fee = BigInt(raw.ihr_fee);
		this.created_lt = BigInt(raw.created_lt);
		this.body_hash = Buffer.from(raw.body_hash, 'base64');
		this.message = raw.message || undefined;
		this.is_message_encrypted = raw.is_message_encrypted;
	}
}
interface MethodResult {
	gasUsed : number;
	stack : Array<Stack.StackEntry>;
	exitCode: number;
}


class TONClient extends EventEmitter {
	static Gram : number = 1000000000;
	static defaultConfig = {
		"liteservers": [
			{
				"@type": "liteserver.desc",
				"ip": 1137658550,
				"port": 4924,
				"id": {
					"@type": "pub.ed25519",
					"key": "peJTw/arlRfssgTuf9BMypJzqOi7SXEqSPSWiEw2U1M="
				}
			}
		],
		"validator": {
			"@type": "validator.config.global",
			"zero_state": {
				"workchain": -1,
				"shard": '-9223372036854775808',
				"seqno": 0,
				"root_hash": "F6OpKZKqvqeFp6CQmFomXNMfMj2EnaUSOXN+Mh+wVWk=",
				"file_hash": "XplPz01CXAps5qeSWUtxcyBfdAo5zVb1N979KLSKD24="
			}
		}
	};
	static defaultKeystore() : string {
		let keystore = path.join(os.homedir(), "ton-keystore");
		if (!fs.existsSync(keystore))
			fs.mkdirSync(keystore);
		return keystore.toString();
	}
	private stringifyJSON(obj : any) : string {
		return JSON.stringify(obj, (key : string, value : any) => {
			if (typeof value === 'bigint')
				return value.toString();
			if (value instanceof Buffer)
				return value.toString('base64');
			return value;
		});
	}

	inited : boolean = false;

	private lib : any;
	private instance : Buffer;
	private config : object;
	private keystore : string;
	constructor(
		libPath : string = __dirname + "/../lib/libtonlibjson.dylib",
		config : object = TONClient.defaultConfig, 
		keystore : string = TONClient.defaultKeystore()
	) {
		super();
		this.lib = ffi.Library(libPath, {
			"tonlib_client_json_create": ['void*', []],
			"tonlib_client_json_destroy": ['void', ['void*']],
			"tonlib_client_json_send": ['void', ['void*', ref.types.CString]],
			"tonlib_client_json_receive": [ref.types.CString, ['void*', 'double']],
			"tonlib_client_json_execute": [ref.types.CString, ['void*', ref.types.CString]]
		});
		this.config = config;
		this.keystore = keystore;
		this.instance = Buffer.from("");
	}

	static async connect(
		libPath : string = __dirname + "/../lib/libtonlibjson.dylib",
		config : object = TONClient.defaultConfig, 
		keystore : string = TONClient.defaultKeystore()
	) : Promise<TONClient> {
		let client = new TONClient();
		await client.init();
		return client;
	}

	private send(query : object) {
		let buffer = Buffer.from(this.stringifyJSON(query) + String.fromCharCode(0), 'utf8');
		this.lib.tonlib_client_json_send(this.instance, buffer);
	}
	
	private async receive(timeout = 2) : Promise<object> {
		let result = await this.lib.tonlib_client_json_receive(this.instance, timeout);
		if (typeof result === 'string' && result.length > 0) {
			result = JSON.parse(result);
			if (result['@type'] === 'updateSyncState')
				return delay(500, () => this.receive(timeout));
		} else 
			throw new Error("Bad libtonlibjson response: " + result);
		return result;
	}

	private async exec(query : object, timeout = 2) : Promise<any> {
		this.send(query);
		return this.receive(timeout);
	}

	private initObject() : object {
		return {
			'@type': 'init',
			'options': {
				'@type': 'options',
				'config': {
					'@type': 'config',
					'config': JSON.stringify(this.config),
					'use_callbacks_for_network': false,
					'blockchain_name': '',
					'ignore_cache': false
				},
				'keystore_type': {
					'@type': 'keyStoreTypeDirectory',
					'directory': this.keystore
				}
			}
		};
	}
	private async init() : Promise<void> {
		this.instance = await this.lib.tonlib_client_json_create();
		if (this.instance.length == 0)
			throw new Error("Failed to initialize library");
		await this.exec(this.initObject());
		await this.setVerbosityLevel(0);
		this.inited = true;
	}

	private async setVerbosityLevel(level : number) {
		return this.exec({
			'@type': 'setLogVerbosityLevel',
			'new_verbosity_level': level
		})
	}

	private checkObject(obj : any, type : string) {
		if (typeof obj !== 'object' || typeof obj["@type"] !== 'string')
			throw new Error("Bad libtonlibjson response: " + obj);
		if (obj["@type"] !== type)
			throw new Error("Bad libtonlibjson response, @type != " + type + ": " + obj['@type']);
	}



	// methods
	async getAccount(address : string | TONAddress) {
		if (!this.inited)
			throw new Error('TONClient is not inited');

		if (typeof address === 'string')
			address = TONAddress.from(address);

		let result = await this.exec({
			'@type': 'raw.getAccountState',
			'account_address': {
				'account_address': address.pack()
			}
		});
		this.checkObject(result, 'raw.fullAccountState');

		return <Account> {
			address,
			balance: BigInt(result.balance),
			code: BagOfCells.deserialize(Buffer.from(result.code, 'base64')),
			data: BagOfCells.deserialize(Buffer.from(result.data, 'base64')),
			lastTransaction: <TransactionID> {
				lt: BigInt(result.last_transaction_id.lt),
				hash: Buffer.from(result.last_transaction_id.hash, 'base64')
			},
			block: <BlockID> {
				workchain: result.block_id.workchain,
				shard: BigInt(result.block_id.shard),
				seqno: BigInt(result.block_id.seqno),
				root_hash: Buffer.from(result.block_id.root_hash, 'base64'),
				file_hash: Buffer.from(result.block_id.file_hash, 'base64')
			},
			sync: new Date(result.sync_utime * 1000)
		};
	}

	async getTransactions(address : string | TONAddress, offset? : TransactionID) : Promise<Transactions> {
		if (!this.inited)
			throw new Error('TONClient is not inited');
		
		if (typeof address === 'string')
			address = TONAddress.from(address);

		if (typeof offset === 'undefined') {
			let account = await this.getAccount(address);
			offset = <TransactionID> account.lastTransaction;
		}

		let result = await this.exec({
			'@type': 'raw.getTransactions',
			'account_address': {
			  'account_address': address.pack(),
			},
			'from_transaction_id': {
				'@type': 'internal.transactionId',
				'lt': offset.lt,
				'hash': offset.hash.toString('base64')
			}
		});
		this.checkObject(result, 'raw.transactions');

		let transactions = new Array(result.transactions.length);
		for (let i = 0; i < transactions.length; ++i) {
			let transaction = result.transactions[i];
			transactions[i] = <Transaction> {
				time: new Date(transaction.utime * 1000),
				id: <TransactionID> {
					lt: BigInt(transaction.transaction_id.lt),
					hash: Buffer.from(transaction.transaction_id.hash, 'base64')
				},
				data: Buffer.from(transaction.data, 'base64'),
				fee: BigInt(transaction.fee),
				storage_fee: BigInt(transaction.storage_fee),
				other_fee: BigInt(transaction.other_fee),
				inmsg: new TransactionMessage(transaction.in_msg),
				outmsgs: transaction.out_msgs.map((raw : any) => new TransactionMessage(raw))
			};
		}

		return <Transactions> {
			transactions,
			last: <TransactionID> {
				lt: BigInt(result.previous_transaction_id.lt),
				hash: Buffer.from(result.previous_transaction_id.hash, 'base64')
			}
		};
	}

	async sendMessage(body : Buffer) {
		await this.exec({
			'@type': 'raw.sendMessage',
			'body': body.toString('base64')
		});
	}

	private async getContractID(address : TONAddress | string) {
		if (!this.inited)
			throw new Error('TONClient is not inited');
		
		if (typeof address === 'string')
			address = TONAddress.from(address);

		return (await this.exec({
			'@type': 'smc.load',
			'account_address': {
				'account_address': address.pack()
			}
		})).id;
	}

	async runMethod(address : TONAddress | string, method: string | number, stack? : Array<Stack.StackEntry>) : Promise<MethodResult> {
		if (!this.inited)
			throw new Error('TONClient is not inited');
		
		if (typeof address === 'string')
			address = TONAddress.from(address);
		if (typeof stack === 'undefined')
			stack = [];

		let methodObject = typeof method === 'string' ? {
			'@type': 'smc.methodIdName',
			'name': method
		} : {
			'@type': 'smc.methodIdNumber',
			'number': method 
		};
		
		let result = await this.exec({
			'@type': 'smc.runGetMethod',
			id: await this.getContractID(address),
			method: methodObject,
			stack: stack.map((element : Stack.StackEntry) => element.toEntryJSON())
		});

		this.checkObject(result, 'smc.runResult');
		
		return <MethodResult> {
			gasUsed: result.gas_used,
			stack: result.stack ? result.stack.map((element : any) => Stack.StackEntry.fromJSON(element)) : undefined,
			exitCode: result.exit_code
		};
	}
}

export {
	TONClient,
	TONAddress,
	BagOfCells,
	Stack 
};