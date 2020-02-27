const crc32c = require('fast-crc32c');

function uint(buf : Buffer, isLittleEndian : boolean = true) : number {
	if (buf.length == 1)
		return buf.readUInt8(0);
	if (buf.length == 2)
		if (isLittleEndian)
			return buf.readUInt16LE(0);
		else 
			return buf.readUInt16BE(0);
	if (buf.length == 4)
		if (isLittleEndian)
			return buf.readUInt32LE(0);
		else
			return buf.readUInt32BE(0);
	return 0;
}
function swap16(val : number) : number {
    return ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
}
function swap32(val : number) : number {
    return ((val & 0xFF) << 24)
           | ((val & 0xFF00) << 8)
           | ((val >> 8) & 0xFF00)
           | ((val >> 24) & 0xFF);
}
function buint(x : number, n : number, isLittleEndian : boolean = true) : Buffer {
	let f = (x : any) => x;
	if (!isLittleEndian) {
		if (n == 2) f = swap16;
		else if (n == 4) f = swap32;
	}

	if (n == 1)
		return Buffer.from(new Uint8Array([x]).buffer);
	if (n == 2)
		return Buffer.from(new Uint16Array([f(x)]).buffer);
	if (n == 4)
		return Buffer.from(new Uint32Array([f(x)]).buffer);
	return Buffer.alloc(0);
}
function sum(arr : Array<number>) : number {
	return arr.reduce((a : number, b : number) => a + b, 0);
}

class Cell {
	special : boolean = false;

	index : number = 0;
	len : number; // in bits
	data : Buffer;
	refs : Array<Cell>;

	constructor(len : number = 0, buf? : Buffer, refs? : Array<Cell>) {
		this.len = len;
		this.index = len;
		this.data = buf ? Buffer.concat([buf, Buffer.alloc(128 - buf.length)]) : Buffer.alloc(128);
		this.refs = refs || new Array<Cell>();
	}

	static magicGeneric = Buffer.from('B5EE9C72', 'hex');
	static deserialize(buffer : Buffer) : Cell {
		let magic = buffer.slice(0, 4);
		if (magic.equals(Cell.magicGeneric)) {
			let byte = buffer.readUInt8(4);
			let has_idx = !!(byte & 128);
			let has_crc32c = !!(byte & 64);
			let has_cache_bits = !!(byte & 32);
			let size = byte & 7;

			let off_bytes = buffer.readUInt8(5);
			let o = 6;
			let cells_count = uint(buffer.slice(o, o += size));
			let roots_count = uint(buffer.slice(o, o += size));
			let absent = 	  uint(buffer.slice(o, o += size));

			let tot_cells_size = uint(buffer.slice(o, o += off_bytes), false);

			let root_list = new Array(roots_count);
			for (let i = 0; i < roots_count; ++i)
				root_list[i] = uint(buffer.slice(o, o += size));
			let indexes = undefined;
			if (has_idx) {
				indexes = new Array(cells_count);
				for (let i = 0; i < cells_count; ++i)
					indexes[i] = uint(buffer.slice(o, o += off_bytes));
			}
			let cell_data = buffer.slice(o, o += tot_cells_size);
			if (has_crc32c) {
				let crc = buffer.slice(buffer.length - 4, buffer.length);
				if (crc32c.calculate(buffer.slice(0, buffer.length - 4)) !== crc.readUInt32LE(0))
					throw new Error("CRC32C in BOC doesn't match to the actual");
			}

			let cells = new Array<Cell>(cells_count);
			let refs = new Array(cells_count);

			for (let c = 0; c < cells_count; ++c) {
				let d1 = cell_data.readUInt8(0);
				let refs_count = d1 & 7;

				let is_special = d1 & 8;
				let with_hashes = d1 & 16;
				let level_mask = d1 >> 5;

				let d2 = cell_data.readUInt8(1);
				let isFull = (d2 % 2 == 0), 
					cell_size = (d2) / 2,// + (isFull ? 0 : 0.5),
					cell_fsize = Math.ceil(cell_size);
				let cell = cell_data.slice(2, 2 + cell_fsize);
				
				cells[c] = new Cell(cell_size * 8, cell);
				if (is_special)
					cells[c].special = true;
				if (indexes)
					cells[c].index = indexes[c];

				refs[c] = [];
				let refs_buff = cell_data.slice(2 + cell_fsize, 2 + cell_fsize + refs_count * size);
				for (let r = 0; r < refs_count; ++r) {
					let ref = uint(refs_buff.slice((r) * size, (r + 1) * size), false);
					refs[c].push(ref);
				}

				cell_data = cell_data.slice(2 + cell.length + refs_buff.length);
			}

			for (let c = 0; c < cells_count; ++c)
				for (let r = 0; r < refs[c].length; ++r)
					cells[c].putRef(cells[refs[c][r]]);

			// if (root_list.length == 1)
			return cells[root_list[0]];
			// return root_list.map(i => cells[i]);
		} else {
			// TODO: add support for older versions
			throw new Error("Bad magic. (contact hogwarts)");
		}
	}

	totalCellsCount() : number {
		return 1 + sum(this.refs.map((cell : Cell) => cell.totalCellsCount()));
	}
	/*
		serialized_boc#b5ee9c72 has_idx:(## 1) has_crc32c:(## 1)
			has_cache_bits:(## 1) flags:(## 2) { flags = 0 }
			size:(## 3) { size <= 4 }
			off_bytes:(## 8) { off_bytes <= 8 }
			cells:(##(size * 8))
			roots:(##(size * 8)) { roots >= 1 }
			absent:(##(size * 8)) { roots + absent <= cells }
			tot_cells_size:(##(off_bytes * 8))
			root_list:(roots * ##(size * 8))
			index:has_idx?(cells * ##(off_bytes * 8))
			cell_data:(tot_cells_size * [ uint8 ])
			crc32c:has_crc32c?uint32
			= BagOfCells;
	// */
	cellData() : Buffer {
		let i = 1; 
		let toadd : Cell[] = [this], ntoadd = [];
		let res = [];
		while (toadd.length > 0) {
			for (let a = 0; a < toadd.length; ++a) {
				let cell = toadd[a];
				res.push(Buffer.concat([
					Buffer.from(new Uint8Array([
						(cell.refs.length & 7) | (cell.special ? 8 : 0),// | (3 << 5),
						(~~(cell.len / 8) * 2 + ((cell.len & 7) != 0 ? 1 : 0))
					])),
					cell.data.slice(0, Math.ceil(cell.len / 8)),
					Buffer.from(new Uint8Array(cell.refs.map(() => i++)))
				]));
				for (let ref of toadd[a].refs)
					ntoadd.push(ref);
			}

			toadd = ntoadd;
			ntoadd = [];
		}
		return Buffer.concat(res);
	}
	indexes(off_bytes : number) : Buffer {
		return Buffer.concat([
			buint(this.index, off_bytes),
			Buffer.concat(this.refs.map((ref : Cell) => ref.indexes(off_bytes)))
		]);
	}
	serialize() : Buffer {
		const size = 1, off_bytes = 2;
		let cells_count = this.totalCellsCount();
		let cell_data = this.cellData();
		let buff = Buffer.concat([
			Cell.magicGeneric,
			Buffer.from(new Uint8Array([
				size | 128 | 64, // has_idx, has_crc32c
				off_bytes,
				cells_count, // cells_count
				1, // roots_count = 1
				0, // absent
			])),
			buint(cell_data.length, off_bytes, false), // tot_cells_size
			Buffer.from(new Uint8Array([
				0
			])),
			this.indexes(off_bytes),
			cell_data,
			Buffer.alloc(4)
		]);
		buff.writeUInt32LE(crc32c.calculate(buff.slice(0, buff.length-4)), buff.length - 4);
		return buff;
	}

	putRef(cell : Cell) {
		if (this.refs.length > 4)
			throw new Error("Cannot put more than 4 references in cell");

		this.refs.push(cell);
	}

	putBuffer(buff : Buffer) {
		if (this.len + buff.length * 8 > 1023)
			throw new Error("Out of cell.");
	}

	toString(tab : number = 0) {
		let s : string = "  ".repeat(tab) + "x[" + this.len + "]{" + this.data.slice(0, Math.ceil(this.len/8)).toString('hex');
		if (this.len % 8 > 0)
			s = s.substring(0, s.length-1) + "_";
		s += "}";
		for (let ref of this.refs)
			s += '\n' + ref.toString(tab + 1);
		return s;
	}
}

export {
	Cell
};