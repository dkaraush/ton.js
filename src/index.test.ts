import {TONClient, TONAddress} from './index';
import 'mocha';

const assert = require('assert');

function checkAddress(source : string, isValid : boolean, workchain? : number, address? : Buffer, testnet? : boolean, bounceable? : boolean) {
	if (isValid) {
		if (workchain === undefined || address === undefined || testnet === undefined || bounceable === undefined)
			throw new Error('checkAddress(): bad arguments');
		describe('"'+source+'" is a valid address', function () {
			let addressResult = TONAddress.from(source);
			it('workchain = ' + workchain, () => assert.strictEqual(addressResult.workchain, workchain));
			it('address = 0x' + address.toString('hex'), () => 
				assert.ok(addressResult.address.equals(address))
			);
			it('testnet = ' + testnet, () => assert.strictEqual(addressResult.testnet, testnet));
			it('bounceable = ' + bounceable, () => assert.strictEqual(addressResult.bounceable, bounceable));
		});
	} else {
		it('"'+source+'" is not a valid address', () => assert.throws(() => TONAddress.from(source)));
	}
}

describe('TONAddress tests', () => {
	checkAddress('EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y', true, 
				 0, Buffer.from('8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', 'hex'), true, false);
	checkAddress('0:8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', true, 
				 0, Buffer.from('8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', 'hex'), true, false);
	checkAddress('-1:87BFD7DEE01903D1B05C8CD54BE523F972150AA4FB3C4C0BC42C611E9CA89844', true,
				 -1, Buffer.from('87BFD7DEE01903D1B05C8CD54BE523F972150AA4FB3C4C0BC42C611E9CA89844', 'hex'), true, false);

	checkAddress('EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8-', false);
	checkAddress('0:8C56E35AC7BABB8610E6A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', false);
	checkAddress('0:8C56E35AC7BABB8610E6A846A690A4F8C42CA5DAB1FF021BA3546E1C401600EY', false);
	checkAddress('08C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', false);
	checkAddress(':08C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', false);
	checkAddress(':8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E', false);
	checkAddress('0:8C56E35AC7BABB8610E66A846A690A4F8C42:CA5DAB1FF021BA3546E1C401600E', false);
	checkAddress('0:8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E:', false);
	checkAddress('87BFD7DEE01903D1B05C8CD54BE523F972150AA4FB3C4C0BC42C611E9CA89844', false);

	it('"0:8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E" right packed (bounceable)', () => {
		let address = TONAddress.from('0:8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E');
		address.bounceable = true;
		assert.strictEqual(address.pack(), 'kQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDgSS');
	});
	it('"0:8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E" right packed (unbounceable)', () => {
		let address = TONAddress.from('0:8C56E35AC7BABB8610E66A846A690A4F8C42CA5DAB1FF021BA3546E1C401600E');
		address.bounceable = false;
		assert.strictEqual(address.pack(), '0QCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDllX');
	});
});

describe('TONClient', async () => {
	let client : TONClient;
	it('init', async () => {
		client = await TONClient.connect();
	});
	it('getAccount("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y")', async () => {
		await client.getAccount("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y");
	});
	it('getTransactions("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y")', async () => {
		await client.getTransactions("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y");
	});
	it('runMethod("EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y", "seqno")', async () => {
		await client.runMethod('EQCMVuNax7q7hhDmaoRqaQpPjELKXasf8CG6NUbhxAFgDr8Y', 'seqno');
	})
});