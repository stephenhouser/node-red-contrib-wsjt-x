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


/* 
 * Schema version really only tells us the QT data stream format.
 */

const binaryParser = require('binary-parser').Parser;
const binaryEncoder = require('binary-parser-encoder').Parser;

// Used below in 'choice' sections to select WSJTX or JTDX
// parsing as JTDX has diverged from WSJTX

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

// parses length (uint32) prefixed-strings
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

// parses WSJT-x/Qt dates
const dateTimeParser = new binaryParser()
	.uint64('day')
	.uint32('time')
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
		defaultChoice: new binaryParser(),
		choices: {
			2: new binaryParser().uint32('offset'),
		}
	})
	.nest('datetime_decode', { type: nullParser, formatter: function(s) {
		const unixtime = (parseFloat(this.day) - 2440587.5) * 86400000;
		var thedate = new Date(unixtime)
		thedate.setUTCHours(0, 0, 0, 0)
		fixed = new Date(thedate.valueOf() + this.time)
		return fixed.toISOString();
	}})
	;

// Time is milli-seconds since midnight UTC
// This creates a datetime object using today as date
function toISODateString(t) {
	var d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d = new Date(d.valueOf() + t);
	return d.toISOString();
}

function boolFormatter(b) {
	return b === 1;
}

function boolEncoder(b) {
	if (typeof(b) == 'string') {
		return b == 'true' ? 1 : 0;
	}

	return b ? 1 : 0;
}

function numberFormatter(n) {
	const n_string = stringFormatter(n);
	return isNaN(n_string) ? n_string : Number(n_string);
}

function maxUnit32Formatter(value) {
	return value === 0xffffffff ? null : value;
}


// Defined message types that WSJT-X will send.
const messageType = {
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
	format: function(code) {	// returns key for code
		for (const key in messageType) {
			if (typeof(messageType[key]) == 'number' && messageType[key] == code) {
				return key;
			}
		}
		return '';
	},
	encode: function(key) {		// returns code for key
		return messageType.hasOwnProperty(key) ? messageType[key] : null;
	}	
};

const replyModifier = {
	shift: 0x01,	// shift
	ctrl: 0x02,		// ctrl or CMD
	alt: 0x04,		// ALT
	windows: 0x10,	// windows key on windows
	keypad: 0x20,	// keypad or arrows
	group: 0x40,	// group switch X11 only
	format: function(code) {	// returns key for code
		for (const key in replyModifier) {
			if (typeof(replyModifier[key]) == 'number' && replyModifier[key] == code) {
				return key;
			}
		}
		return '';
	},
	encode: function(key) {		// returns code for key
		return replyModifier.hasOwnProperty(key) ? replyModifier[key] : null;
	}	
};

const statusOperationMode = {
	none: 0,
	na_vhf: 1,
	eu_vhf: 2,
	field_day: 3,
	rtty_ru: 4,
	ww_digi: 5,
	fox: 6,
	hound: 7,
	arrl_digi: 8,
	format: function(code) {	// returns key for code
		for (const key in statusOperationMode) {
			if (typeof(statusOperationMode[key]) == 'number' && statusOperationMode[key] == code) {
				return key;
			}
		}
		return 'unknown';
	},
	encode: function(key) {		// returns code for key
		return statusOperationMode.hasOwnProperty(key) ? statusOperationMode[key] : null;
	}	
};

// *** Parsers for WSJT-X Datagrams ***

class WSJTXParser {
	// baseParser and baseFields

	// Decodes only the minimal required WSJT-X fields.
	// Used when the full decoder fails and we want some results.
	baseParser = new binaryParser()
		.endianess('big')
		.uint32('magic', { assert: 0xadbccbda })
		.uint32('schema', { assert: function(version) {
			return version >= 0x02 
		}})
		.uint32('type')
		.nest('id', { type: stringParser, formatter: stringFormatter })

	// Used to encode beginning of each message, not used for parsing
	baseFields = ['magic', 'schema', 'type', 'id'];
	baseEncoder = new binaryEncoder()
		.endianess('big')
		.uint32('magic')
		.uint32('schema')
		.uint32('type')
		.uint32('length', { encoder: function(str, obj) { return obj['id'].length; } })
		.string('id', { length: 'length' });

	// Heartbeat Out/In since v2.0
	heartbeatFields = [...this.baseFields, 'max_schema_number', 'version', 'revision'];
	heartbeatParser = new binaryParser()
		.endianess('big')
		.uint32('max_schema_number')
		.nest('version', { type: stringParser, formatter: stringFormatter })
		.nest('revision', { type: stringParser, formatter: stringFormatter });

	heartbeatEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('max_schema_number')
		// .nest(null, { type: stringEncoder('version')} )
		.uint32('ver_length', { encoder: function(str, obj) { return obj['version'].length; } })
		.string('version', { length: 'ver_length'} )
		// .nest(null, { type: stringEncoder('revision')} )
		.uint32('rev_length', { encoder: function(str, obj) { return obj['revision'].length; } })
		.string('revision', { length: 'rev_length' });
		
	// Out since v2.0
	statusParser = new binaryParser()
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

	// Out since v2.0
	decodeParser = new binaryParser()
		.endianess('big')
		.uint8('new', { formatter: boolFormatter })
		.uint32('time')
		.nest('datetime_decode', { type: nullParser, formatter: function(s) {
			return toISODateString(this.time);
		}})
		.int32('snr')
		.doublebe('delta_time')
		.uint32('delta_frequency')
		.nest('mode', { type: stringParser, formatter: stringFormatter })
		.nest('message', { type: stringParser, formatter: stringFormatter })
		.uint8('low_confidence')
		.uint8('off_air');

	// Out/In since v2.0
	// Not sent from WSJTX
	clearParser = new binaryParser();

	// 0  - clear the "Band Activity" window (default)
    // 1  - clear the "Rx Frequency" window
    // 2  - clear both "Band Activity" and "Rx Frequency" windows
	clearFields = [...this.baseFields, 'window'];
	clearEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint8('window');

	// In  (untested) since v2.0
	replyParser = new binaryParser()
		.endianess('big')
		.uint32('time')
		.nest('datetime_decode', { type: nullParser, formatter: function(s) {
			return toISODateString(this.time);
		}})
		.int32('snr')
		.doublebe('delta_time')
		.uint32('delta_frequency')
		.nest('mode', { type: stringParser, formatter: stringFormatter })
		.nest('message', { type: stringParser, formatter: stringFormatter })
		.uint8('low_confidence')
		.uint8('modifiers', { formatter: replyModifier.format });

	replyFields = [...this.baseFields, 'time', 'snr', 'delta_time', 'delta_frequency', 'mode', 'message', 'low_confidence', 'modifiers'];
	replyEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('time')
		.int32('snr')
		.doublebe('delta_time')
		.uint32('delta_frequency')
		.uint32('mode_length', { encoder: function(str, obj) { return obj['mode'].length; } })
		.string('mode', { length: 'mode_length'} )
		.uint32('msg_length', { encoder: function(str, obj) { return obj['message'].length; } })
		.string('message', { length: 'msg_length' })
		.uint8('low_confidence')
		.uint8('modifiers');

	// Out since v2.0
	qsoLoggedParser = new binaryParser()
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

	// Out since v2.0
	closeParser = new binaryParser()
		.endianess('big');

	// In (untested) since v2.0
	replayParser = new binaryParser();

	replayFields = [...this.baseFields];
	replayEncoder =  new binaryEncoder()
		.nest(null, { type: this.baseEncoder })

	// In (untested) since v2.0
	haltTxParser = new binaryParser()
		.endianess('big')
		.uint8('auto_tx_only', { formatter: boolFormatter });

	haltTxFields = [...this.baseFields, 'auto_tx_only'];
	haltTxEncoder =  new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint8('auto_tx_only', { encoder: boolEncoder });

	// In (untested) since v2.0
	freeTextParser = new binaryParser()
		.endianess('big')
		.nest('text', { type: stringParser, formatter: stringFormatter })
		.uint8('send', { formatter: boolFormatter });

	freeTextFields = [...this.baseFields, 'text', 'send'];
	freeTextEncoder =  new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('text_length', { encoder: function(str, obj) { return obj['text'].length; } })
		.string('text', { length: 'text_length' })	
		.uint8('send');
	
	// Out (untested) since v2.0
	wsprDecodeParser = new binaryParser()
		.endianess('big')
		.uint8('new', { formatter: boolFormatter })
		.uint32('time')
		.nest('datetime_decode', { type: nullParser, formatter: function(s) {
			return toISODateString(this.time);
		}})		
		.int32('snr')
		.doublebe('delta_time')
		.uint64('frequency')
		.uint32('drift')
		.nest('callsign', { type: stringParser, formatter: stringFormatter })
		.nest('grid', { type: stringParser, formatter: stringFormatter })
		.uint32('power')
		.uint8('off_air');

	// In (untested) since v2.0
	locationParser = new binaryParser()
		.endianess('big')
		.nest('location', { type: stringParser, formatter: stringFormatter });

	locationFields = [...this.baseFields, 'location'];
	locationEncoder =  new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('location_length', { encoder: function(str, obj) { return obj['location'].length; } })
		.string('location', { length: 'location_length' });
	
	// Out since v2.0
	loggedAdifParser = new binaryParser()
		.endianess('big')
		.nest('adif_text', { type: stringParser, formatter: stringFormatter });

	// (untested) parses colors
	colorParser = new binaryParser()
		.uint8('colorspec')
		.uint16('alpha')
		.uint16('red')
		.uint16('green')
		.uint16('blue')
		.uint16('pad');

	// In (untested) since v2.0
	highlightCallsignParser = new binaryParser()
		.endianess('big')
		.nest('background_color', { type: this.colorParser })
		.nest('foreground_color', { type: this.colorParser })
		.uint8('highlight_last', { formatter: boolFormatter });

	highlightCallsignFields = [...this.baseFields, 'background_color', 'foreground_color', 'highlight_last'];
	highlightCallsignEncoder =  new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		// .nest('background_color', { type: this.colorParser })
		// .nest('foreground_color', { type: this.colorParser })
		// .uint8('highlight_last', { formatter: boolFormatter });
		
	// Core WSJT-X decoder/parser, uses other sub-parsers depending on 'type'
	parser = new binaryParser()
		.nest(null, { type: this.baseParser })
		.choice(null, {
			tag: 'type',
			defaultChoice: new binaryParser(),
			choices: {
				0: this.heartbeatParser,
				1: this.statusParser,
				2: this.decodeParser,
				3: this.clearParser,
				4: this.replyParser,
				5: this.qsoLoggedParser,
				6: this.closeParser,
				7: this.replayParser,
				8: this.haltTxParser,
				9: this.freeTextParser,
				10: this.wsprDecodeParser,
				11: this.locationParser,
				12: this.loggedAdifParser,
				13: this.highlightCallsignParser
			}
		});

	decode(buffer) {
		return this.parser.parse(buffer)
	}
	
		// Checks that msg has keys that match everything in field_list
	// returns the fields that are missing or an empty list
	checkFields(msg, field_list) {
		const missing_fields = [...field_list];
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
	checkedEncoder(msg, encoder, field_list) {
		const missing = this.checkFields(msg, field_list);
		if (missing.length <= 0) {
			return encoder.encode(msg);
		}

		//console.log(`Missing fields ${missing} in message to be encoded`);
		throw new Error(`Missing fields [${missing}] in message to be encoded`);
		return null;
	}

	encode(msg) {
		const type_code = messageType.encode(msg.type);
		if (type_code < 0) {
			return null;
		}
		
		// make a copy with defaults
		const encode_msg = {
			...msg,
			'magic':  0xadbccbda,
			'type': type_code
		};

		if (!encode_msg.hasOwnProperty('schema')) {
			encode_msg['schema'] = 2;
		}

		if (!encode_msg.hasOwnProperty('id')) {
			encode_msg['id'] = 'NODEJS';
		}
		
		switch (type_code) {
			case messageType.clear:
				return this.checkedEncoder(encode_msg, this.clearEncoder, this.clearFields);

			case messageType.heartbeat:
				return this.checkedEncoder(encode_msg, this.heartbeatEncoder, this.heartbeatFields);

			case messageType.reply:
				return this.checkedEncoder(encode_msg, this.replyEncoder, this.replyFields);

			case messageType.halt_tx:
				return this.checkedEncoder(encode_msg, this.haltTxEncoder, this.haltTxFields);

			default:
				console.error(`wsjtx.encode(${msg.type}) not implemented.`);
				return null;
		}
	}
}

class WSJTXParser_v200 extends WSJTXParser {
	statusParser = this.statusParser
		.uint8('special_operation_mode', { formatter: statusOperationMode.format })

	qsoLoggedParser = this.qsoLoggedParser
		.nest('exchange_sent', { type: stringParser, formatter: stringFormatter })
		.nest('exchange_received', { type: stringParser, formatter: stringFormatter });
}

class WSJTXParser_v210 extends WSJTXParser_v200 {
	statusParser = this.statusParser
		.uint32('frequency_tolerance', { formatter: maxUnit32Formatter })
		.uint32('tr_period', { formatter: maxUnit32Formatter })
		.nest('configuration_name', { type: stringParser, formatter: stringFormatter })

	// In (untested) since v2.1
	swicthConfigurationParser = new binaryParser()
		.endianess('big')
		.nest('configuration_name', { type: stringParser, formatter: stringFormatter });

	// In (untested) since v2.1
	configureParser = new binaryParser()
		.endianess('big')
		.nest('mode', { type: stringParser, formatter: stringFormatter })
		.uint32('frequency_tolerance', { formatter: maxUnit32Formatter })
		.nest('sub_mode', { type: stringParser, formatter: stringFormatter })
		.uint8('fast_mode', { formatter: boolFormatter })
		.uint32('tr_period', { formatter: maxUnit32Formatter })
		.uint32('rx_df')
		.nest('dx_call', { type: stringParser, formatter: stringFormatter })
		.nest('dx_grid', { type: stringParser, formatter: stringFormatter })
		.uint8('generate_messages', { formatter: boolFormatter });

	// Core WSJT-X decoder/parser, uses other sub-parsers depending on 'type'
	parser = new binaryParser()
		.nest(null, { type: this.baseParser })
		.choice(null, {
			tag: 'type',
			defaultChoice: new binaryParser(),
			choices: {
				0: this.heartbeatParser,
				1: this.statusParser,
				2: this.decodeParser,
				3: this.clearParser,
				4: this.replyParser,
				5: this.qsoLoggedParser,
				6: this.closeParser,
				7: this.replayParser,
				8: this.haltTxParser,
				9: this.freeTextParser,
				10: this.wsprDecodeParser,
				11: this.locationParser,
				12: this.loggedAdifParser,
				13: this.highlightCallsignParser,
				14: this.swicthConfigurationParser,
				15: this.configureParser
			}
		});
}

class WSJTXParser_v230 extends WSJTXParser_v210 {
	statusParser = this.statusParser
		.nest('tx_message', { type: stringParser, formatter: stringFormatter });

	qsoLoggedParser = this.qsoLoggedParser
		.nest('adif_propogation_mode', { type: stringParser, formatter: stringFormatter });
}

class JTDXParser extends WSJTXParser_v210 {
	statusParser = this.statusParser
		.uint8('tx_first', { formatter: boolFormatter });
}

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

function getParser(version_string, schema=2) {
	if (typeof(version) != 'number') {
		version = parseFloat(version_string);
	}

	if (version >= 2.3) {
		return new WSJTXParser_v230();
	}

	if (version >= 2.1) {
		return new WSJTXParser_v210();
	}

	return new WSJTXParser_v200();
}

// Decode a Buffer of data (from a UDP datagram) into an object
// with keys and values representing the parsed data.
function decode(buffer, version=2.3, schema=2) {
	const decoded = getParser(version, schema).decode(buffer);
	decoded.type = messageType.format(decoded.type);

	if (decoded.hasOwnProperty('message')) {
		const message_decode = decode_exchange(decoded.message);
		decoded.message_decode = message_decode;
	}

	return decoded;
}

// Enocde object to a UDP-ready buffer
// Returns a Buffer on success or a string error message.
// Check the return type!
function encode(msg, version='2.6', schema=2) {
	// console.log(`Encode:\t${JSON.stringify(msg)}`);

	const encoded = getParser(version, schema).encode(msg);
	return encoded;
}

module.exports = {
	decode: decode,
	encode: encode
};