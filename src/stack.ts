abstract class StackEntry {
	toJSON() : object { return {} }
	toEntryJSON() : object { return {} }
	static fromJSON(obj : any | string) : StackEntry|void {
		if (typeof obj === 'string')
			obj = JSON.parse(obj);

		switch (obj['@type']) {
			case 'tvm.stackEntrySlice':
				obj = obj.slice;
			case 'tvm.slice':
				return new Slice(Buffer.from(obj.bytes, 'base64'));

			case 'tvm.stackEntryCell':
				obj = obj.slice;
			case 'tvm.cell':
				return new Cell(Buffer.from(obj.bytes, 'base64'));

			case 'tvm.stackEntryNumber':
				obj = obj.number;
			case 'tvm.numberDecimal':
				return new NumberType(obj.number);

			case 'tvm.stackEntryTuple':
				obj = obj.tuple;
			case 'tvm.tuple':
				return new Tuple(obj.elements.map((element : any) => StackEntry.fromJSON(element)));

			case 'tvm.stackEntryList':
				obj = obj.list;
			case 'tvm.list':
				return new List(obj.elements.map((element : any) => StackEntry.fromJSON(element)));
		}
	}
}

class Slice extends StackEntry {
	bytes : Buffer;
	constructor(bytes: Buffer) {
		super();
		this.bytes = bytes;
	}

	toJSON() : object {
		return {
			'@type': 'tvm.slice',
			'bytes': this.bytes.toString('base64')
		};
	}
	toEntryJSON() : object {
		return {
			'@type': 'tvm.stackEntrySlice',
			'slice': this.toJSON()
		};
	}
}

class Cell extends StackEntry {
	bytes : Buffer;
	constructor(bytes: Buffer) {
		super();
		this.bytes = bytes;
	}

	toJSON() : object {
		return {
			'@type': 'tvm.cell',
			'bytes': this.bytes.toString('base64')
		};
	}
	toEntryJSON() : object {
		return {
			'@type': 'tvm.stackEntryCell',
			'cell': this.toJSON()
		};
	}
}

class NumberType extends StackEntry {
	number : number;
	constructor(number : number) {
		super();
		this.number = number;
	}

	toJSON() : object {
		return {
			'@type': 'tvm.numberDecimal',
			'number': this.number.toString()
		};
	}
	toEntryJSON() : object {
		return {
			'@type': 'tvm.stackEntryNumber',
			'number': this.toJSON()
		};
	}
}

class Tuple extends Array<StackEntry> implements StackEntry {
	constructor(elements? : Array<StackEntry>) {
		super();
		if (elements)
			elements.forEach(element => this.push(element));
	}

	toJSON() : object {
		return {
			'@type': 'tvm.tuple',
			'elements': this.slice(0, this.length).map((element : StackEntry) => element.toEntryJSON())
		};
	}
	toEntryJSON() : object {
		return {
			'@type': 'tvm.stackEntryTuple',
			'tuple': this.toJSON()
		};
	}
}

class List extends Array<StackEntry> implements StackEntry {
	constructor(elements? : Array<StackEntry>) {
		super();
		if (elements)
			elements.forEach(element => this.push(element));
	}

	toJSON() : object {
		return {
			'@type': 'tvm.list',
			'elements': this.slice(0, this.length).map((element : StackEntry) => element.toEntryJSON())
		};
	}
	toEntryJSON(): object {
		return {
			'@type': 'tvm.stackEntryList',
			'list': this.toJSON()
		};
	}
} 

export {
	StackEntry,
	Slice,
	Cell,
	NumberType,
	Tuple,
	List
};