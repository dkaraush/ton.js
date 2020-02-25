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
		address: <Buffer 8c 56 e3 5a c7 ba bb 86 10 e6 6a 84 6a 69 0a 4f 8c 42 ca 5d ab 1f f0 21 ba 35 46 e1 c4 01 60 0e>
	},
	balance: 41972983244,
	code: <Buffer b5 ee 9c 72 41 01 01 01 00 62 00 00 c0 ff 00 20 dd 20 82 01 4c 97 ba 97 30 ed 44 d0 d7 0b 1f e0 a4 f2 60 83 08 d7 18 20 d3 1f d3 1f d3 1f f8 23 13 bb ... >,
	data: <Buffer b5 ee 9c 72 41 01 01 01 00 2a 00 00 50 00 00 00 31 29 a9 a3 17 a5 8c c3 4e 6f 98 91 61 15 c6 f4 0f 62 e4 b7 8e cc b5 1f da 18 81 fc 8a de 38 f7 fa 84 ... >,
	lastTransaction: TransactionID {
		lt: 3283354000003,
		hash: <Buffer 15 d2 d1 d2 cd f5 69 3c 6a c1 64 7d 77 bf bd 4a 67 ee 7a b5 b9 eb a1 cb 6b e2 83 ed a3 4a 07 ca>
	},
	block: BlockID {
		workchain: -1,
		shard: '-9223372036854775808',
		seqno: 2426126,
		root_hash: <Buffer 60 d5 29 c6 67 c7 14 e9 97 b8 58 1a 96 66 a1 cb c7 c6 bc 95 e2 33 95 a9 d6 ab ca d3 c6 e9 e5 71>,
		file_hash: <Buffer 96 8c b6 31 7c 01 2c 86 17 fb ae bb 1c b5 77 93 67 ad d5 5a 08 17 4e 7a 88 75 94 32 a1 da d9 db>
	},
	sync: Date {1970-01-19T07:37:28.670Z} // !!! FIX !!!
}
```