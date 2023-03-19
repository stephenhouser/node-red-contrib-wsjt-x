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

const MINIMUM_SCHEMA = 2;		// the minimun schema we understand
const DEFAULT_SCHEMA = 3;		// the default schema to encode
const DEFAULT_VERSION = 2.6;	// the default version to decode/encode
const DEFAULT_ID = "NODE-JS";	// the default ID of this side of the conversaion
const WSJTX_MAGIC = 0xadbccbda;	// the WSJT-X magic packet header sequence

// Utility function to print out objects.
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

// Utilitiy functions for working with enumerations
// get the enum for a given value
function keyForValue(enumType, value) {	// returns key for enum value
	for (const key in enumType) {
		if (typeof (enumType[key]) == 'number' && enumType[key] == value) {
			const key_dash = key.replace('_', '-');
			return key_dash;
		}
	}
	return '';
}

function valueForKey(enumType, key) {		// returns code for key
	const under_key = key.replace('-', '_');
	return enumType.hasOwnProperty(under_key) ? enumType[under_key] : null;
}

// a parser that parses nothing
const nullParser = new binaryParser();

// parses length (uint32) prefixed-strings
const stringParser = new binaryParser()
	.uint32('length', {
		formatter: function (len) {
			return len === 0xffffffff ? 0 : len;
		}
	})
	.string('string', { length: 'length' });

// formats a parsed string for regular use
function stringFormatter(s) {
	return s.string.replace(/^\s+|\s+$/g, '');
}

// parses WSJT-x/Qt dates
// Adds synthesized field `datetime_decode`
// which contains the ISO formatted date and time. 
const dateTimeParser = new binaryParser()
	.uint64('day')
	.uint32('time')
	.uint8('timespec', {
		formatter: function (t) {
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
	.nest('datetime_decode', {
		type: nullParser,
		formatter: function (s) {
			// converts julain day and time to UTC timestamp
			const unixtime = (parseFloat(this.day) - 2440587.5) * 86400000;
			var gregorian_day = new Date(unixtime)
			gregorian_day.setUTCHours(0, 0, 0, 0)

			const timestamp = new Date(gregorian_day.valueOf() + this.time)
			return timestamp.toISOString();
		}
	});

// Times in WSJT-X are milli-seconds since midnight UTC
// This creates a datetime object using today as date
// This is not accurate for packet captures and replay of old data.
function toISODateString(ms_since_midnight) {
	var today = new Date();
	today.setUTCHours(0, 0, 0, 0);

	const timestamp = new Date(today.valueOf() + ms_since_midnight);
	return timestamp.toISOString();
}

// format a boolean value for JavaScript
function boolFormatter(b) {
	return b === 1;
}

// encode a boolean value
function boolEncoder(b) {
	if (typeof (b) == 'string') {
		return b == 'true' ? 1 : 0;
	}

	return b ? 1 : 0;
}

// format a number for JavaScript
function numberFormatter(n) {
	const n_string = stringFormatter(n);
	return isNaN(n_string) ? n_string : Number(n_string);
}

// for uint32 numbers that can have a null value, WSJT-X specifies MAX_INT
function maxUint32Formatter(value) {
	return value === 0xffffffff ? null : value;
}

// to encode a null value as MAX_INT
function maxUint32Encoder(value) {
	return value == null ? 0xffffffff : value;
}

function formatColor(val) {
	// Invalid=0, RGB=1, HSV=2, CMYK=3, HSL=4
	// TODO: formatColor() assumes RGBA color spec everything else is Invalid
	if (val.colorspec == 0x01) {
		const color = ((val.red & 0xFF) << 24)
						| ((val.green & 0xFF) << 16) 
	 					| ((val.blue & 0xFF) << 8) 
	 					| (val.alpha & 0xFF);
		const unsigned = color >>> 0; // fixes unsigned integers
		return '#' + unsigned.toString(16);
	}

	return null; // invalid QColor
}

function encodeColor(val, obj) {
	//QColor::Rgb	1  <<-- This code only encodes RGBA color spec
	// Invalid=0, RGB=1, HSV=2, CMYK=3, HSL=4
	if (!val || val.length < 1) {
		// if null is given send an invalid QColor
		return { colorspec: 0x00, alpha: 0, red: 0, green: 0, blue: 0, pad: 0 };
	}

	let color_code = val.startsWith('#') ? val.substring(1) : val;
	if (color_code.length != 6 && color_code.length != 8) {
		throw new Error(`Invalid color code ${val}. Must be #rrggbbaa or #rrggbb format`);
	}

	color_code = (color_code.length == 6) ? color_code + 'FF' : color_code;		
	const color = parseInt(color_code, 16);
	return {
		colorspec: 0x01,
		alpha: ((color >> 0) & 0xFF) * 0x101,
		red: ((color >> 24) & 0xFF) * 0x101,
		green: ((color >> 16) & 0xFF) * 0x101,
		blue: ((color >> 8) & 0xFF) * 0x101,
		pad: 0x00
	};
}

// *** Parsers for WSJT-X Datagrams ***

// Some new versions of WSJT-X add fields to the messages. So we use a
// base class to parse and encode and then subclasses to parse and
// encode for newer versions.
// Our base class is approximately WSJT-X v1.9 or so.
class WSJTXParser {
	constructor(schema = DEFAULT_SCHEMA) {
		this.schema = schema;
	}

	// Defined message types that WSJT-X will send and that we understand.
	// provides a method for us to translate between the name and the coded number.
	messageType = {
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
	};

	// baseParser and baseFields

	// Decodes only the minimal required WSJT-X fields.
	// Used when the full decoder fails and we want some results.
	baseFields = ['magic', 'schema', 'type', 'id'];
	baseParser = new binaryParser()
		.endianess('big')
		.uint32('magic', { assert: WSJTX_MAGIC })
		.uint32('schema', { assert: version => version >= MINIMUM_SCHEMA })
		.uint32('type')
		.nest('id', {type: stringParser, formatter: stringFormatter })
		;

	// Used to encode beginning of each message, not used for parsing
	baseEncoder = new binaryEncoder()
		.endianess('big')
		.uint32('magic')
		.uint32('schema')
		.uint32('type')
		.uint32('id_length', { encoder: (val, obj) => obj['id'].length })
		.string('id', { length: 'id_length' })
		;

	// Heartbeat Out/In since v2.0
	heartbeatFields = ['max_schema_number', 'version', 'revision'];
	heartbeatParser = new binaryParser()
		.uint32('max_schema_number')
		.nest('version', { type: stringParser, formatter: stringFormatter })
		.nest('revision', { type: stringParser, formatter: stringFormatter })
		;

	heartbeatEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('max_schema_number')
		.uint32('version_length', { encoder: (val, obj) => obj['version'].length })
		.string('version', { length: 'version_length' })
		.uint32('revision_length', { encoder: (val, obj) => obj['revision'].length })
		.string('revision', { length: 'revision_length' })
		;

	// Out since v2.0
	statusFields = [];
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
		;

	statusEncoder = new binaryEncoder()
		// TODO: v2.1 statusEncoder
		;

	// Out since v2.0
	decodeFields = [];
	decodeParser = new binaryParser()
		.uint8('new', { formatter: boolFormatter })
		.uint32('time')
		.nest('datetime_decode', {
			type: nullParser,
			// v => syntax does not give the right this object.
			formatter: function (s) { return toISODateString(this.time) }
		})
		.int32('snr')
		.doublebe('delta_time')
		.uint32('delta_frequency')
		.nest('mode', { type: stringParser, formatter: stringFormatter })
		.nest('message', { type: stringParser, formatter: stringFormatter })
		.uint8('low_confidence')
		.uint8('off_air')
		;

	decodeEncoder = new binaryEncoder()
		// TODO: v2.1 decodeEncoder
		;

	// Out/In since v2.0
	// Not sent from WSJTX
	clearFields = ['window'];
	clearParser = new binaryParser()
		;

	// 0  - clear the "Band Activity" window (default)
	// 1  - clear the "Rx Frequency" window
	// 2  - clear both "Band Activity" and "Rx Frequency" windows
	clearEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint8('window')
		;

	// In (untested) since v2.0
	// Defined reply modifiers.
	// provides a method for us to translate between the name and the coded number.
	replyModifier = {
		shift: 0x01,	// shift
		ctrl: 0x02,		// ctrl or CMD
		alt: 0x04,		// ALT
		windows: 0x10,	// windows key on windows
		keypad: 0x20,	// keypad or arrows
		group: 0x40,	// group switch X11 only
	};

	replyFields = ['time', 'snr', 'delta_time', 'delta_frequency', 'mode',
					'message', 'low_confidence', 'modifiers'];		
	replyParser = new binaryParser()
		.uint32('time')
		.nest('datetime_decode', {
			type: nullParser,
			// v => syntax does not give the right this object.
			formatter: function (s) { return toISODateString(this.time) }
		})
		.int32('snr')
		.doublebe('delta_time')
		.uint32('delta_frequency')
		.nest('mode', { type: stringParser, formatter: stringFormatter })
		.nest('message', { type: stringParser, formatter: stringFormatter })
		.uint8('low_confidence')
		.uint8('modifiers', { formatter: val => keyForValue(this.replyModifier, val) })
		;

	replyEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('time')
		.int32('snr')
		.doublebe('delta_time')
		.uint32('delta_frequency')
		.uint32('mode_length', { encoder: (val, obj) => obj['mode'].length })
		.string('mode', { length: 'mode_length' })
		.uint32('message_length', { encoder: (val, obj) => obj['message'].length })
		.string('message', { length: 'message_length' })
		.uint8('low_confidence')
		.uint8('modifiers')
		;

	// Out since v2.0
	qsoLoggedFields = [];
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
		;

	qsoLoggedEncoder = new binaryEncoder()
		// TODO: v2.1 qsoLoggedEncoder
		;

	// Out since v2.0
	closeParser = new binaryParser()
		;

	// In since v2.0
	replayFields = [];
	replayParser = new binaryParser()
		;

	replayEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		;

	// In since v2.0
	haltTxFields = ['auto_tx_only'];
	haltTxParser = new binaryParser()
		.uint8('auto_tx_only', { formatter: boolFormatter })
		;

	haltTxEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint8('auto_tx_only', { encoder: boolEncoder })
		;

	// In since v2.0
	freeTextFields = ['text', 'send'];
	freeTextParser = new binaryParser()
		.nest('text', { type: stringParser, formatter: stringFormatter })
		.uint8('send', { formatter: boolFormatter })
		;

	freeTextEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('text_length', {	
			// handle special case where we can send a null string
			encoder: (val, obj) => (obj['text'] && obj['text'].length) ? obj['text'].length : 0
		})
		.string('text', { length: 'text_length', encoder: (val, obj) => val ? val : "" })
		.uint8('send')
		;

	// Out (untested) since v2.0
	wsprDecodeFields = [];
	wsprDecodeParser = new binaryParser()
		.uint8('new', { formatter: boolFormatter })
		.uint32('time')
		.nest('datetime_decode', {
			type: nullParser,
			// v => syntax does not give the right this object.
			formatter: function (s) { return toISODateString(this.time) }
		})
		.int32('snr')
		.doublebe('delta_time')
		.uint64('frequency')
		.uint32('drift')
		.nest('callsign', { type: stringParser, formatter: stringFormatter })
		.nest('grid', { type: stringParser, formatter: stringFormatter })
		.uint32('power')
		.uint8('off_air')
		;

	wsprDecodeEncoder = new binaryEncoder()
		// TODO: v2.1 wsprDecodeEncoder
		;

	// In since v2.0
	locationFields = ['location'];
	locationParser = new binaryParser()
		.nest('location', { type: stringParser, formatter: stringFormatter })
		;

	locationEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('location_length', { encoder: (str, obj) => obj['location'].length })
		.string('location', { length: 'location_length' })
		;

	// Out since v2.0
	loggedAdifFields = ['adif_text'];
	loggedAdifParser = new binaryParser()
		.nest('adif_text', { type: stringParser, formatter: stringFormatter })
		;

	loggedAdifEncoder = new binaryEncoder()
		.uint32('adif_text_length', { encoder: (str, obj) => obj['adif_text'].length })
		.string('adif_text', { length: 'adif_text_length' })
		;

	// color parser used in call sign operations (below)
	colorParser = new binaryParser()
		.uint8('colorspec')			//  RGB, HSV, CMYK or HSL, invalid
		.uint16('alpha')
		.uint16('red')
		.uint16('green')
		.uint16('blue')
		.uint16('pad')
		;

	// In since v2.0
	highlightCallsignFields = ['callsign', 'background', 'foreground', 'highlight_last'];
	highlightCallsignParser = new binaryParser()
		.nest('callsign', { type: stringParser, formatter: stringFormatter })
		.nest('background', { type: this.colorParser, formatter: formatColor })
		.nest('foreground', { type: this.colorParser, formatter: formatColor })
		.uint8('highlight_last', { formatter: boolFormatter })
		;

	colorEncoder = new binaryEncoder()
		.uint8('colorspec')	//  invalid = 0, RGB=1, HSV=2, CMYK=3 or HSL=4	
		.uint16('alpha')
		.uint16('red')
		.uint16('green')
		.uint16('blue')
		.uint16('pad')
		;

	highlightCallsignEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('callsign_length', { encoder: (str, obj) => obj['callsign'].length })
		.string('callsign', { length: 'callsign_length' })
		.nest('background', { type: this.colorEncoder, encoder: encodeColor })
		.nest('foreground', { type: this.colorEncoder, encoder: encodeColor })
		.uint8('highlight_last', { formatter: boolFormatter })
		;

	// Core WSJT-X decoder/parser, uses other sub-parsers depending on 'type'
	parser = new binaryParser()
		.nest(null, { type: this.baseParser })
		.choice(null, {
			tag: 'type',
			defaultChoice: nullParser,
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

	// Decode or parse a buffer from a WSJT-X UDP datagram into message (object)
	decode(buffer) {
		if (!buffer) {
			throw new Error('No buffer given to decode');
		}

		return this.parser.parse(buffer);
	}

	// Checks that msg has keys that match everything in field_list
	// returns the fields that are missing or an empty list
	// used prior to trying to encode a datagram to make sure all the
	// fields a present.
	checkFields(msg, field_list) {
		const missing_fields = [...this.baseFields, ...field_list];
		Object.keys(msg).forEach(key => {
			const idx = missing_fields.indexOf(key);
			if (idx > -1) {
				missing_fields.splice(idx, 1);
			}
		});

		return missing_fields;
	}

	// list of encoders we support. Can add new ones in newer versions
	// of the parser/encoder class.
	// each entry is: 'encoder-name': [encoder, required-fields]
	// encoder-name matches the message type to encode
	// encoder is the binary-parser-encoder to encode the data
	// required-fields are the fields that must be present to encode the datagram
	encoders = {
		'clear': [this.clearEncoder, this.clearFields],
		'heartbeat': [this.heartbeatEncoder, this.heartbeatFields],
		'reply': [this.replyEncoder, this.replyFields],
		'halt_tx': [this.haltTxEncoder, this.haltTxFields],
		'replay': [this.replayEncoder, this.replayFields],
		'free_text': [this.freeTextEncoder, this.freeTextFields],
		'location': [this.locationEncoder, this.locationFields],
		'logged_adif': [this.loggedAdifEncoder, this.loggedAdifFields],
		'highlight_callsign': [this.highlightCallsignEncoder, this.highlightCallsignFields],
	};

	// Encode message (object) to a buffer which can be sent as a WSJT-X UDP datagram
	encode(msg) {
		const encoder_key = msg.type.replace('-', '_');
		const type_code = valueForKey(this.messageType, encoder_key);
		if (type_code < 0) {
			throw new Error(`Invalid WSJT-X message type: ${msg.type}`);
		}

		if (!(encoder_key in this.encoders)) {
			throw new Error(`No WSJT-X encoder for message type: ${msg.type}`);
		}

		// make a copy with defaults so we don't modify the original
		const encode_msg = {
			...msg,
			'magic': WSJTX_MAGIC,
			'type': type_code
		};

		// add missing fields that can have defaults
		if (!encode_msg.hasOwnProperty('schema')) {
			encode_msg['schema'] = this.schema;
		}

		if (!encode_msg.hasOwnProperty('id')) {
			encode_msg['id'] = DEFAULT_ID;
		}

		// find the encoder and it's required fields in the encoders list
		// uses a lookup table so we can add encoders with newer versions
		// just by adding to the encoders table.
		const [encoder, fields] = this.encoders[encoder_key];
		const missing = this.checkFields(encode_msg, fields);
		if (missing.length > 0) {
			throw new Error(`Missing fields [${missing}] in message to be encoded`);
		}

		return encoder.encode(encode_msg);
	}
}

// For WSJT-X >= v2.0.0 
class WSJTXParser_v200 extends WSJTXParser {
	// Defined status operation modes
	// provides a method for us to translate between the name and the coded number.
	specialOperationMode = {
		none: 0,
		na_vhf: 1,
		eu_vhf: 2,
		field_day: 3,
		rtty_ru: 4,
		ww_digi: 5,
		fox: 6,
		hound: 7,
	};

	statusFields = [...this.statusFields, 'special_operation_mode'];
	statusParser = this.statusParser
		.uint8('special_operation_mode', { formatter: v => keyForValue(this.specialOperationMode, v) })
		;

	statusEncoder = this.statusEncoder
		// TODO: v2.1 statusEncoder (v200)
		;

	qsoLoggedFields = [...this.qsoLoggedFields, 'exchange_sent', 'exchange_received'];
	qsoLoggedParser = this.qsoLoggedParser
		.nest('exchange_sent', { type: stringParser, formatter: stringFormatter })
		.nest('exchange_received', { type: stringParser, formatter: stringFormatter })
		;

	qsoLoggedEncoder = this.qsoLoggedEncoder
		// TODO: v2.1 qsoLoggedEncoder (v200)
		;
}

// For WSJT-X >= v2.1.0
class WSJTXParser_v210 extends WSJTXParser_v200 {
	// In since v2.1
	closeFields = [];
	closeEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		;

	statusFields = [...this.statusFields, 'frequency_tolerance', 'tr_period', 'configuration_name'];
	statusParser = this.statusParser
		.uint32('frequency_tolerance', { formatter: maxUint32Formatter })
		.uint32('tr_period', { formatter: maxUint32Formatter })
		.nest('configuration_name', { type: stringParser, formatter: stringFormatter })
		;

	statusEncoder = this.statusEncoder
		// TODO: v2.1 qsoLoggedEncoder (v210)
		;

	// In (untested) since v2.1
	switchConfigurationFields = ['configuration_name'];
	swicthConfigurationParser = new binaryParser()
		.nest('configuration_name', { type: stringParser, formatter: stringFormatter })
		;

	swicthConfigurationEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('configuration_length', { encoder: (val, obj) => obj['configuration_name'].length })
		.string('configuration_name', { length: 'configuration_length' })
		;

	// In (untested) since v2.1
	configureFields = ['mode', 'frequency_tolerance', 'sub_mode', 'fast_mode', 'tr_period',
						'rx_df', 'dx_call', 'dx_grid', 'generate_messages'];
	configureParser = new binaryParser()
		.nest('mode', { type: stringParser, formatter: stringFormatter })
		.uint32('frequency_tolerance', { formatter: maxUint32Formatter })
		.nest('sub_mode', { type: stringParser, formatter: stringFormatter })
		.uint8('fast_mode', { formatter: boolFormatter })
		.uint32('tr_period', { formatter: maxUint32Formatter })
		.uint32('rx_df')
		.nest('dx_call', { type: stringParser, formatter: stringFormatter })
		.nest('dx_grid', { type: stringParser, formatter: stringFormatter })
		.uint8('generate_messages', { formatter: boolFormatter })
		;

	configureEncoder = new binaryEncoder()
		.nest(null, { type: this.baseEncoder })
		.uint32('mode_length', {	
			// handle special case where we can send a null string
			encoder: (val, obj) => (obj['mode'] && obj['mode'].length) ? obj['mode'].length : 0
		})
		.string('mode', { length: 'mode_length', encoder: (val, obj) => val ? val : "" })
		.uint32('frequency_tolerance')
		.uint32('sub_mode_length', {
			// handle special case where we can send a null string
			encoder: (val, obj) => (obj['sub_mode'] && obj['sub_mode'].length) ? obj['sub_mode'].length : 0
		})
		.string('sub_mode', { length: 'sub_mode_length', encoder: (val, obj) => val ? val : "" })
		.uint8('fast_mode')
		.uint32('tr_period')
		.uint32('rx_df')
		.uint32('dx_call_length', {	
			// handle special case where we can send a null string
			encoder: (val, obj) => (obj['dx_call'] && obj['dx_call'].length) ? obj['dx_call'].length : 0
		})
		.string('dx_call', { length: 'dx_call_length', encoder: (val, obj) => val ? val : "" })
		.uint32('dx_grid_length', {
			// handle special case where we can send a null string
			encoder: (val, obj) => (obj['dx_grid'] && obj['dx_grid'].length) ? obj['dx_grid'].length : 0
		})
		.string('dx_grid', { length: 'dx_grid_length', encoder: (val, obj) => val ? val : "" })
		;

	// Defined message types that WSJT-X will send and that we understand.
	// provides a method for us to translate between the name and the coded number.
	messageType = {
		...this.messageType,
		switch_configuration: 14,
		configure: 15
	};

	// Core WSJT-X decoder/parser, uses other sub-parsers depending on 'type'
	parser = new binaryParser()
		.nest(null, { type: this.baseParser })
		.choice(null, {
			tag: 'type',
			defaultChoice: nullParser,
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

	encoders = {
		...this.encoders,
		'close': [this.closeEncoder, this.closeFields],
		'switch_configuration': [this.swicthConfigurationEncoder, this.switchConfigurationFields],
		'configure': [this.configureEncoder, this.configureFields],
	};
}

// For WSJT-X >= v2.3.0
class WSJTXParser_v230 extends WSJTXParser_v210 {
	statusParser = this.statusParser
		.nest('tx_message', { type: stringParser, formatter: stringFormatter })
		;

	// TODO: v2.1 statusEncoder (v230)

	qsoLoggedParser = this.qsoLoggedParser
		.nest('adif_propogation_mode', { type: stringParser, formatter: stringFormatter })
		;

	// TODO: v2.1 qsoLoggedEncoder (v230)
}

class WSJTXParser_v260 extends WSJTXParser_v230 {
	// Defined status operation modes
	// provides a method for us to translate between the name and the coded number.
	specialOperationMode = {
		...this.specialOperationMode,
		arrl_digi: 8
	};
}

// For JTDX (untested)
class JTDXParser extends WSJTXParser_v210 {
	statusParser = this.statusParser
		.uint8('tx_first', { formatter: boolFormatter })
		;

	// TODO: v2.1 statsEncoder (JTDX)
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

// Get the correct parser for a given WSJT-X version and schema
function getParser(version_string, schema) {
	if (typeof (version) != 'number') {
		version = parseFloat(version_string);
	}

	if (version >= 2.6) {
		return new WSJTXParser_v260(schema);
	}

	if (version >= 2.3) {
		return new WSJTXParser_v230(schema);
	}

	if (version >= 2.1) {
		return new WSJTXParser_v210(schema);
	}

	if (version >= 2.0) {
		return new WSJTXParser_v200(schema);
	}

	return new WSJTXParser(schema);
}

// Public: Decode a Buffer of data (from a UDP datagram) into an object
// with keys and values representing the parsed data.
function decode(buffer, version = DEFAULT_VERSION, schema = DEFAULT_SCHEMA) {
	// TOD: Graceful degredataion of decoding when version not specified.
	// If the parse fails with a high version number try a lower version.
	const parser = getParser(version, schema);	
	const decoded = parser.decode(buffer);
	decoded.type = keyForValue(parser.messageType, decoded.type);

	if (decoded.hasOwnProperty('message')) {
		const message_decode = decode_exchange(decoded.message);
		decoded.message_decode = message_decode;
	}

	return decoded;
}

// Public: Enocde object to a UDP-ready buffer
// Returns a Buffer on success or a string error message.
// Check the return type!
function encode(msg, version = DEFAULT_VERSION, schema = DEFAULT_SCHEMA) {
	const parser = getParser(version, schema);
	const encoded = parser.encode(msg);
	return encoded;
}

module.exports = {
	decode: decode,
	encode: encode
};