const ref = require('ref');
const ffi = require('ffi-napi');

let _void = ref.types.void;
let _voidPtr = ref.refType(_void);
let _char = ref.types.char;
let _charPtr = ref.refType(_char);
let _double = ref.types.double;

let TONLib = ffi.Library('lib/libtonlibjson.dylib', {
	"tonlib_client_json_create": [_voidPtr, []],
	"tonlib_client_json_destroy": [_void, [_voidPtr]],
	"tonlib_client_json_send": [_void, [_voidPtr, _charPtr]],
	"tonlib_client_json_receive": [_charPtr, [_voidPtr, _double]],
	"tonlib_client_json_execute": [_charPtr, [_voidPtr, _charPtr]]
});

async function main () {
	let tonlib = await TONLib.tonlib_client_json_create();
	console.log(await TONLib.tonlib_client_json_receive(tonlib, 1));
}
main();