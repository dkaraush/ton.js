TypeScript wrapper of native libtonlibjson library. [indev]

```js
import { TONClient, TONAddress } from './index';

let client = new TONClient();
client.on('connect', async function () {
	let account = await client.getAccount("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y");
	let transactions = await client.getTransactions(account.address, account.lastTransaction);

	let seqno = await client.runMethod(account.address, "seqno");
});
```

```js
client.getAccount("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y")

{ 
	address: TONAddress {
		bounceable: false,
		testnet: true,
		workchain: 0,
		address: <Buffer@0x10380bb2a 8c 56 e3 5a c7 ba bb 86 10 e6 6a 84 6a 69 0a 4f 8c 42 ca 5d ab 1f f0 21 ba 35 46 e1 c4 01 60 0e>
	},
	balance: 41972983244,
	code: Cell {
		special: false,
		index: 768,
		len: 768,
		data: <Buffer@0x10380bbc8 ff 00 20 dd 20 82 01 4c 97 ba 97 30 ed 44 d0 d7 0b 1f e0 a4 f2 60 83 08 d7 18 20 d3 1f d3 1f d3 1f f8 23 13 bb f2 63 ed 44 d0 d3 1f d3 1f d3 ff d1 51 ... >,
		refs: []
	},
	data: Cell {
		special: false,
		index: 320,
		len: 320,
		data: <Buffer@0x10380bc88 00 00 00 31 29 a9 a3 17 a5 8c c3 4e 6f 98 91 61 15 c6 f4 0f 62 e4 b7 8e cc b5 1f da 18 81 fc 8a de 38 f7 fa 84 a5 48 f1 00 00 00 00 00 00 00 00 00 00 ... >,
		refs: []
	},
	lastTransaction: {
		lt: 3283354000003,
		hash: <Buffer@0x10380bd08 15 d2 d1 d2 cd f5 69 3c 6a c1 64 7d 77 bf bd 4a 67 ee 7a b5 b9 eb a1 cb 6b e2 83 ed a3 4a 07 ca>
	},
	block: {
		workchain: -1,
		shard: '-9223372036854775808',
		seqno: 2450354,
		root_hash: <Buffer@0x10380bd28 21 e9 bf 89 f5 7b 54 b4 ba b1 c5 36 ec db bd 51 97 38 71 b9 49 9e d4 d9 12 81 39 00 4b 68 38 18>,
		file_hash: <Buffer@0x10380bd48 92 9b 2c 18 89 d8 34 44 7c e0 a6 02 9f 70 7d 60 aa 58 b5 50 63 bd dc 36 68 ab 07 61 ac 3a a9 18>
	},
	sync: 2020-02-26T20:33:00.000Z
}
```