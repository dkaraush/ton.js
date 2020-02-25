import { StackEntry, Cell, Slice } from './stack';

const ref = require('ref');
const ffi = require('ffi-napi');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crc16 = require('crc16');
const EventEmitter = require('events');

const _void = ref.types.void;
const _voidPtr = ref.refType(_void);
const _char = ref.types.char;
const _charPtr = ref.types.CString;
const _double = ref.types.double;

const tonlib = ffi.Library('lib/libtonlibjson.dylib', {
	"tonlib_client_json_create": [_voidPtr, []],
	"tonlib_client_json_destroy": [_void, [_voidPtr]],
	"tonlib_client_json_send": [_void, [_voidPtr, _charPtr]],
	"tonlib_client_json_receive": [_charPtr, [_voidPtr, _double]],
	"tonlib_client_json_execute": [_charPtr, [_voidPtr, _charPtr]]
});

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
			let crc = crc16(buffer.slice(0, 34));
			if ((crc >> 8) !== buffer[34] || (crc & 0xff) !== buffer[35])
				throw new Error("CRC hashsum of the address is different from the source: " + string);
			return new TONAddress(workchain, address);
		} else {
			throw new Error("Failed to parse TON address: " + string);
		}
	}

	bounceable : boolean = false;
	testnet : boolean = true;

	workchain : number;
	address : Buffer;
	constructor(workchain : number, address : Buffer, bounceable : boolean = false, testnet : boolean = true) {
		this.workchain = workchain;
		this.address = address;
		this.bounceable = bounceable;
		this.testnet = testnet;
	}

	pack() : string {
		let buffer = Buffer.alloc(36);
		buffer[0] = 0x51 - (this.bounceable ? 0x40 : 0) + (this.testnet ? 0x80 : 0);
		buffer[1] = this.workchain;
		buffer.set(this.address, 2);
		let crc = crc16(buffer.slice(0, 34));
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
	shard: string;
	seqno: number;
	root_hash: Buffer;
	file_hash: Buffer;
}
interface Account {
	address: TONAddress,
	balance : number;
	code: Buffer,
	data: Buffer,
	lastTransaction: TransactionID;
	block: BlockID;
	sync?: Date;
}
interface TransactionID {
	lt: number;
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
	fee: number;
	storage_fee: number;
	other_fee: number;
	inmsg: TransactionMessage;
	outmsgs: TransactionMessage[];
}
class TransactionMessage {
	source?: TONAddress;
	destination?: TONAddress;
	value: number;
	fwd_fee: number;
	ihr_fee: number;
	created_lt: number;
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

		this.value = parseInt(raw.value);
		this.fwd_fee = parseInt(raw.fwd_fee);
		this.ihr_fee = parseInt(raw.ihr_fee);
		this.created_lt = parseInt(raw.created_lt);
		this.body_hash = Buffer.from(raw.body_hash, 'base64');
		this.message = raw.message || undefined;
		this.is_message_encrypted = raw.is_message_encrypted;
	}
}
interface MethodResult {
	gasUsed : number;
	stack : Array<StackEntry>;
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
	initObject() : object {
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

	inited : boolean = false;
	state : boolean = false;

	private instance : Buffer;
	private config : object;
	private keystore : string;
	constructor(
		config : object = TONClient.defaultConfig, 
		keystore : string = TONClient.defaultKeystore()
	) {
		super();
		this.config = config;
		this.keystore = keystore;
		this.instance = Buffer.from("");
		this.init();
	}

	private send(query : object) {
		let buffer = ref.allocCString(JSON.stringify(query));
		tonlib.tonlib_client_json_send(this.instance, buffer);
	}
	
	private async receive(timeout = 2) : Promise<object> {
		let result = await tonlib.tonlib_client_json_receive(this.instance, timeout);
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

	private async init() {
		this.instance = await tonlib.tonlib_client_json_create();
		await this.exec(this.initObject());
		// await this.setVerbosityLevel(0);
		this.inited = true;
		this.emit("connect");
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
			balance: parseInt(result.balance),
			code: Buffer.from(result.code, 'base64'),
			data: Buffer.from(result.data, 'base64'),
			lastTransaction: <TransactionID> {
				lt: parseInt(result.last_transaction_id.lt),
				hash: Buffer.from(result.last_transaction_id.hash, 'base64')
			},
			block: {
				workchain: result.block_id.workchain,
				shard: result.block_id.shard,
				seqno: result.block_id.seqno,
				root_hash: Buffer.from(result.block_id.root_hash, 'base64'),
				file_hash: Buffer.from(result.block_id.file_hash, 'base64')
			},
			sync: new Date(result.sync_utime)
		};
	}

	async getTransactions(address : string | TONAddress, offset? : TransactionID) : Promise<Transactions> {
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
				time: new Date(transaction.utime),
				id: <TransactionID> {
					lt: transaction.transaction_id.lt,
					hash: Buffer.from(transaction.transaction_id.hash, 'base64')
				},
				data: Buffer.from(transaction.data, 'base64'),
				fee: parseInt(transaction.fee),
				storage_fee: parseInt(transaction.storage_fee),
				other_fee: parseInt(transaction.other_fee),
				inmsg: new TransactionMessage(transaction.in_msg),
				outmsgs: transaction.out_msgs.map((raw : any) => new TransactionMessage(raw))
			};
		}

		return <Transactions> {
			transactions,
			last: <TransactionID> {
				lt: result.previous_transaction_id.lt,
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

	async getContractID(address : TONAddress | string) {
		if (typeof address === 'string')
			address = TONAddress.from(address);

		return (await this.exec({
			'@type': 'smc.load',
			'account_address': {
				'account_address': address.pack()
			}
		})).id;
	}

	async runMethod(address : TONAddress | string, method: string | number, stack? : Array<StackEntry>) : Promise<MethodResult> {
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
			stack: stack.map((element : StackEntry) => element.toEntryJSON())
		});

		this.checkObject(result, 'smc.runResult');
		
		return <MethodResult> {
			gasUsed: result.gas_used,
			stack: result.stack ? result.stack.map((element : any) => StackEntry.fromJSON(element)) : undefined,
			exitCode: result.exit_code
		};
	}
}

export {
	TONClient,
	TONAddress
};