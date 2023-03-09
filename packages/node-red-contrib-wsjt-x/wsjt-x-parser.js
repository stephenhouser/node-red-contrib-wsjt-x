/* wsjt-x-parser.js - Parser for decoding WSJT-X messages
 *
 * An out of date reference. 
 * https://github.com/roelandjansen/wsjt-x/blob/master/NetworkMessage.hpp
 * Consult the source for more accurate details:
 * https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html
 * QT
 * https://doc.qt.io/archives/qt-4.8//datastreamformat.html
 *
 * 2021/10/11 Stephen Houser, MIT License
 */
const binaryParser = require('binary-parser').Parser;
const binaryEncoder = require('binary-parser-encoder').Parser;

// Used below in 'choice' sections to select WSJTX or JTDX
// parsing as JTDX has diverged from WSJTX
const PAYLOAD_FORMAT = {
	wsjtx: 20,		// v2.0
	wsjtx21: 21,	// v2.1
	wsjtx23: 23,	// v2.3
	jtdx: 99		// v2.2.157 (2021-12-20)
};

function payload_format(id) {
	switch (id) {
		case 'JTDX':
			return PAYLOAD_FORMAT.jtdx;
		
		case 'WSJTX':
		default:
			return PAYLOAD_FORMAT.wsjtx23;
	}
}

// safely handles circular references
JSON.safeStringify = (obj, indent = 2) => {
	let cache = [];
	const retVal = JSON.stringify(
	  obj,
	  (key, value) =>
		typeof value === "object" && value !== null
		  ? cache.includes(value)
			? undefined // Duplicate reference found, discard key
			: cache.push(value) && value // Store value in our collection
		  : value,
	  indent
	);
	cache = null;
	return retVal;
  };

const nullParser = new binaryParser();

const stringParser = new binaryParser()
	.uint32('length', {
		formatter: function(len) {
			return len === 0xffffffff ? 0 : len;
		}
	})
	.string('string', { length: 'length' });

function stringFormatter(s) {
	return s.string.replace(/^\s+|\s+$/g, '');
}

const dateTimeParser = new binaryParser()
	.uint64('day')
	.uint32('time', { formatter: timeFormatter })
	.uint8('timespec', {
		formatter: function(t) {
			switch (t) {
				case 0: return 'local';
				case 1: return 'utc';
				case 2: return 'offset';
				case 3: return 'timezone';
			}
		}
	})
	.choice('time_options', {
		tag: 'timespec',
		defaultChoice: nullParser,
		choices: {
			2: new binaryParser().uint32('offset'),
		}
	});

// Time is seconds since midnight UTC
function timeFormatter(t) {
	var d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d = new Date(d.valueOf() + t);
	return d.valueOf();
}

// returns the number of bytes remaining in the buffer
const remainingParser = new binaryParser()
	.nest(null, {
		type: new binaryParser()
			.saveOffset('bufferStart')
			.buffer('buffer', {
				length: "readUntil",
				readUntil: "eof",
				type: "uint8"
			})
			.saveOffset('bufferEnd')
			.seek(function() { return this.bufferEnd - this.bufferStart}),
		formatter: function(b) {
			return b.buffer.length; }
		})	

const operation_mode = {
	none: 0,
	na_vhf: 1,
	eu_vhf: 2,
	field_day: 3,
	rtty_ru: 4,
	ww_digi: 5,
	fox: 6,
	hound: 7,
	_names: [
		'NONE', 'NA VHF', 'EU VHF', 'FIELD DAY', 'RTTY RU', 'WW DIGI', 'FOX', 'HOUND'
	],
	format: function(code) {
		return (code < operation_mode._names.length) ? operation_mode._names[code] : 'unknown';
	},
	encode: function(key) {
		return operation_mode._names.indexOf(key);
	}
};

function boolFormatter(b) {
	return b === 1;
}

function numberFormatter(n) {
	const n_string = stringFormatter(n);
	return isNaN(n_string) ? n_string : Number(n_string);
}

function maxUnit32Formatter(value) {
	return value === 0xffffffff ? null : value;
}

// (untested)
const colorParser = new binaryParser()
	.uint8('colorspec')
	.uint16('alpha')
	.uint16('red')
	.uint16('green')
	.uint16('blue')
	.uint16('pad');

// Used to encode beginning of each message, not used for parsing
baseFields = ['magic', 'schema', 'type', 'id'];
const baseEncoder = new binaryEncoder()
	.endianess('big')
	.uint32('magic')
	.uint32('schema')
	.uint32('type')
	.uint32('length', { encoder: function(str, obj) { return obj['id'].length; } })
	.string('id', { length: 'length' });

// *** Parsers for WSJT-X Datagrams ***

// Out/In since v2.0
const heartbeatParser = new binaryParser()
	.endianess('big')
	.uint32('max_schema_number')
	.nest('version', { type: stringParser, formatter: stringFormatter })
	.choice(null, {
		tag: function() { return payload_format(this.id); },
		defaultChoice: new binaryParser()
			.nest('revision', { type: stringParser, formatter: stringFormatter }),
		choices: {
			99: new binaryParser()
		}
	});
	
const heartbeatFields = ['max_schema_number', 'version', 'revision'];
const heartbeatEncoder = new binaryEncoder()
	.nest(null, { type: baseEncoder })
	.uint32('max_schema_number')
	.uint32('ver_length', { encoder: function(str, obj) { return obj['version'].length; } })
	.string('version', { length: 'ver_length'} )
	.uint32('rev_length', { encoder: function(str, obj) { return obj['revision'].length; } })
	.string('revision', { length: 'rev_length' });

// Out since v2.0
const statusParser = new binaryParser()
	.uint64('freqency')
	.nest('mode', { type: stringParser, formatter: stringFormatter })
	.nest('dx_call', { type: stringParser, formatter: stringFormatter })
	.nest('report', { type: stringParser, formatter: numberFormatter })
	.nest('tx_mode', { type: stringParser, formatter: stringFormatter })
	.uint8('tx_enabled', { formatter: boolFormatter })
	.uint8('transmitting', { formatter: boolFormatter })
	.uint8('decoding', { formatter: boolFormatter })
	.uint32('rx_df')
	.uint32('tx_df')
	.nest('de_call', { type: stringParser, formatter: stringFormatter })
	.nest('de_grid', { type: stringParser, formatter: stringFormatter })
	.nest('dx_grid', { type: stringParser, formatter: stringFormatter })
	.uint8('tx_watchdog', { formatter: boolFormatter })
	.nest('sub_mode', { type: stringParser, formatter: stringFormatter })
	.uint8('fast_mode', { formatter: boolFormatter })
	.nest('remainingBytes', {type: remainingParser})
	.choice(null, {
		tag: function() { return payload_format(this.id); },
		defaultChoice: new binaryParser() // WSJTX
			.uint8('special_operation_mode', { formatter: operation_mode.format })
			// since v2.1
			.uint32('frequency_tolerance', { formatter: maxUnit32Formatter })
			.uint32('tr_period', { formatter: maxUnit32Formatter })
			.nest('configuration_name', { type: stringParser, formatter: stringFormatter })
			// since v2.3
			.nest('tx_message', { type: stringParser, formatter: stringFormatter }),
		choices: {
			99: new binaryParser()	// JTDX 2.2
				.uint8('tx_first', { formatter: boolFormatter })
		}
	});

// Out since v2.0
const decodeParser = new binaryParser()
	.endianess('big')
	.uint8('new', { formatter: boolFormatter })
	.uint32('time', { formatter: timeFormatter })
	.int32('snr')
	.doublebe('delta_time')
	.uint32('delta_frequency')
	.nest('mode', { type: stringParser, formatter: stringFormatter })
	.nest('message', { type: stringParser, formatter: stringFormatter })
	.uint8('low_confidence')
	.uint8('off_air');

// Out/In since v2.0
// Not sent from WSJTX
const clearParser = new binaryParser()
	.endianess('big')
	.nest('remainingBytes', {type: remainingParser})
	.choice(null, {
		tag: 'remainingBytes',
		defaultChoice: new binaryParser(),	// no additional fields
		choices: {
			1: new binaryParser()	// since v2.1
				.uint8('window')
		}
	});

const clearFields = [];
const clearEncoder = new binaryEncoder()
	.nest(null, { type: baseEncoder })
	.uint8('window');

/* Modifiers
 * 0x00 - none
 * 0x02 - shift
 * 0x04 - ctrl or CMD
 * 0x08 - ALT
 * 0x10 - windows key on windows
 * 0x20 - keypad or arrows
 * 0x40 - group switch X11 only
 */
const modifier_type = {
	none: 0x00,
	shift: 0x01,
	ctrl: 0x02,
	alt: 0x04,
	windows: 0x10,
	keypad: 0x20,
	group: 0x40,
	_names: ['none', 'shift', 'alt', 'windows', 'keypad', 'group'],
	format: function(modifiers) {
		return modifiers;
	},
	encode: function(modifiers) {
	}
};

// In  (untested) since v2.0
const replyParser = new binaryParser()
	.endianess('big')
	.uint32('time', { formatter: timeFormatter })
	.int32('snr')
	.doublebe('delta_time')
	.uint32('delta_frequency')
	.nest('mode', { type: stringParser, formatter: stringFormatter })
	.nest('message', { type: stringParser, formatter: stringFormatter })
	.uint8('low_confidence')
	.uint8('modifiers', { format: modifier_type.format });

function replyEncoder(message) {
}

// Out since v2.0
const qsoLoggedParser = new binaryParser()
	.nest('date_time_on', { type: dateTimeParser })
	.nest('dx_call', { type: stringParser, formatter: stringFormatter })
	.nest('dx_grid', { type: stringParser, formatter: stringFormatter })
	.uint64('tx_frequency')
	.nest('mode', { type: stringParser, formatter: stringFormatter })
	.nest('report_sent', { type: stringParser, formatter: numberFormatter })
	.nest('report_received', { type: stringParser, formatter: numberFormatter })
	.nest('tx_power', { type: stringParser, formatter: numberFormatter })
	.nest('comments', { type: stringParser, formatter: stringFormatter })
	.nest('name', { type: stringParser, formatter: stringFormatter })
	.nest('date_time_off', { type: dateTimeParser })
	.nest('operator_call', { type: stringParser, formatter: stringFormatter })
	.nest('my_call', { type: stringParser, formatter: stringFormatter })
	.nest('my_grid', { type: stringParser, formatter: stringFormatter })
	.nest('exchange_sent', { type: stringParser, formatter: stringFormatter })
	.nest('exchange_received', { type: stringParser, formatter: stringFormatter })
	// since 2.3
	.nest('adif_propogation_mode', { type: stringParser, formatter: stringFormatter });

// Out (untested) since v2.0
const closeParser = new binaryParser();

// In (untested) since v2.0
const replayParser = new binaryParser();

// In (untested) since v2.0
const haltTxParser = new binaryParser()
	.endianess('big')
	.uint8('auto_tx_only', { formatter: boolFormatter });

// In (untested) since v2.0
const freeTextParser = new binaryParser()
	.endianess('big')
	.nest('text', { type: stringParser, formatter: stringFormatter })
	.uint8('send', { formatter: boolFormatter });

// Out (untested) since v2.0
const wsprDecodeParser = new binaryParser()
	.endianess('big')
	.uint8('new', { formatter: boolFormatter })
	.uint32('time', { formatter: timeFormatter })
	.int32('snr')
	.doublebe('delta_time')
	.uint64('frequency')
	.uint32('drift')
	.nest('callsign', { type: stringParser, formatter: stringFormatter })
	.nest('grid', { type: stringParser, formatter: stringFormatter })
	.uint32('power')
	.uint8('off_air');

// In (untested) since v2.0
const locationParser = new binaryParser()
	.endianess('big')
	.nest('location', { type: stringParser, formatter: stringFormatter });

// Out since v2.0
const loggedAdifParser = new binaryParser()
	.endianess('big')
	.nest('adif_text', { type: stringParser, formatter: stringFormatter });

// In (untested) since v2.0
const highlightCallsignParser = new binaryParser()
	.endianess('big')
	.nest('background_color', { type: colorParser })
	.nest('foreground_color', { type: colorParser })
	.uint8('highlight_last', { formatter: boolFormatter });

// In (untested) since v2.1
const swicthConfigurationParser = new binaryParser()
	.endianess('big')
	.nest('configuration_name', { type: stringParser, formatter: stringFormatter });

// In (untested) since v2.1
const configureParser = new binaryParser()
	.endianess('big')
	.nest('mode', { type: stringParser, formatter: stringFormatter })
	.uint32('frequency_tolerance', { formatter: maxUnit32Formatter })
	.nest('sub_mode', { type: stringParser, formatter: stringFormatter })
	.uint8('fast_mode', { formatter: boolFormatter })
	.uint32('tr_period', { formatter: maxUnit32Formatter })
	.uint32('rx_df')
	.nest('dx_call', { type: stringParser, formatter: stringFormatter })
	.nest('dx_grid', { type: stringParser, formatter: stringFormatter })
	.uint8('generate_message', { formatter: boolFormatter });

// *** The root parser ***

// Defined message types that WSJT-X will send.
const message_type = {
	heartbeat: 0,
	status: 1,
	decode: 2,
	clear: 3,
	reply: 4,
	qso_logged: 5,
	close: 6,
	replay: 7,
	halt_tx: 8,
	free_text: 9,
	wspr_decode: 10,
	location: 11,
	logged_adif: 12,
	highlight_callsign: 13,
	switch_configuration: 14,
	configure: 15,
	_names: [
		'heartbeat', 'status', 'decode', 'clear', 'reply', 'qso-logged',
		'close', 'replay', 'halt-tx', 'free-text', 'wspr-decode', 'location',
		'logged-adif', 'highlight-callsign', 'switch-configuration', 'configure'
	],
	format: function(code) {
		return (code < message_type._names.length) ? message_type._names[code] : 'unknown';
	},
	encode: function(key) {
		return message_type._names.indexOf(key);
	}
};

// Decodes only the minimal required WSJT-X fields.
// Used when the full decoder fails and we want some results.
const short_wsjtxParser = new binaryParser()
	.endianess('big')
	.uint32('magic')
	.uint32('version')
	.uint32('type')
	.nest('id', { type: stringParser, formatter: stringFormatter });

// Core WSJT-X decoder/parser, uses other sub-parsers depending on 'type'
const wsjtxParser = new binaryParser()
	.endianess('big')
	.uint32('magic', { assert: 0xadbccbda })
	.uint32('schema', { assert: function(version) {
		return version >= 0x02 
	}})
	.uint32('type')
	.nest('id', { type: stringParser, formatter: stringFormatter })
	.choice(null, {
		tag: 'type',
		defaultChoice: nullParser,
		choices: {
			0: heartbeatParser,
			1: statusParser,
			2: decodeParser,
			3: clearParser,
			4: replyParser,
			5: qsoLoggedParser,
			6: closeParser,
			7: replayParser,
			8: haltTxParser,
			9: freeTextParser,
			10: wsprDecodeParser,
			11: locationParser,
			12: loggedAdifParser,
			13: highlightCallsignParser,
			14: swicthConfigurationParser,
			15: configureParser
		}
	});

// Heuristically attempt decoding common WSJT-X exchange messages
// Not perfect, but works in many cases.
function decode_exchange(message) {
	const exchange = message.split(' ');
	if (exchange[0] === 'CQ') {
		if (exchange.length == 4) {
			return { type: 'cq', dx_call: exchange[1], de_call: exchange[2], de_grid: exchange[3] };
		} else {
			return { type: 'cq', de_call: exchange[1], de_grid: exchange[2] };
		}
	}

	if (exchange.length <= 2) {
		return { type: 'tx?', dx_call: exchange[0], de_call: exchange[1] };
	}

	if (exchange[2] === '73') {
		return { type: 'tx5', dx_call: exchange[0], de_call: exchange[1], message: exchange[2] };
	}

	if (exchange[2] === 'RR73' || exchange[2] === 'RRR') {
		return { type: 'tx4', dx_call: exchange[0], de_call: exchange[1], message: exchange[2] };
	}

	if (exchange[2].startsWith('+') || exchange[2].startsWith('-')) {
		return { type: 'tx2', dx_call: exchange[0], de_call: exchange[1], snr: parseInt(exchange[2]) };
	}

	if (exchange[2].startsWith('R')) {
		return { type: 'tx3', dx_call: exchange[0], de_call: exchange[1], snr: parseInt(exchange[2].slice(1)) };
	}

	return { type: 'tx1', dx_call: exchange[0], de_call: exchange[1], de_grid: exchange[2] };
}


// Decode a Buffer of data (from a UDP datagram) into an object
// with keys and values representing the parsed data.
function decode(buffer) {
	try {
		const decoded = wsjtxParser.parse(buffer);
		decoded.type = message_type.format(decoded.type);

		if (decoded.hasOwnProperty('message')) {
			const message_decode = decode_exchange(decoded.message);
			decoded.message_decode = message_decode;
		}

		return decoded;
	} catch (error) {
		const short_decode = short_wsjtxParser.parse(buffer);

		console.error(error);
		console.error(short_decode);
		return null;
	}
}

// Checks that msg has keys that match everything in field_list
// returns the fields that are missing or an empty list
function checkFields(msg, field_list) {
	const missing_fields = [...baseFields, ...field_list];
	Object.keys(msg).forEach(key => {
		const idx = missing_fields.indexOf(key);
		if (idx > -1) {
			missing_fields.splice(idx, 1);
		}
	});

	return missing_fields;
}

// Calls the encoder.encode() function after checking that the
// message has all the required fields.
// Returns the encoded Buffer or a 'string' error message.
function checkedEncoder(msg, encoder, field_list) {
	const missing = checkFields(msg, field_list);
	if (missing.length <= 0) {
		return encoder.encode(msg);
	}

	//console.log(`Missing fields ${missing} in message to be encoded`);
	return `Missing fields [${missing}] in message to be encoded`;
}

// Enocde object to a UDP-ready buffer
// Returns a Buffer on success or a string error message.
// Check the return type!
function encode(obj) {
	console.log(`Encode:\t${JSON.stringify(obj)}`);

	const type_code = message_type.encode(obj.type);
	if (type_code < 0) {
		return null;
	}

	const msg = {
		'magic':  2914831322,
		'schema': 2,
		'id': 'NODE-JS',
		'type': type_code,
		...obj
	};	// make a copy with defaults

	console.log(`\t${JSON.stringify(msg)}`);
	try {
		switch (type_code) {
			case message_type.clear:
				return checkedEncoder(msg, clearEncoder, clearFields);

			case message_type.heartbeat:
				return checkedEncoder(msg, heartbeatEncoder, heartbeatFields);

			default:
				console.error(`wsjtx.encode(${obj.type}) not implemented.`);
				return null;
		}
	} catch (error) {
		console.error(error);
		return null;
	}
}

module.exports = {
	decode: decode,
	encode: encode
};