/* wsjt-x-decode.js - NodeRed node for decoding WSJT-X messages
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
//const binaryParser = require('binary-parser').Parser;
const binaryParser = require('binary-parser-encoder').Parser

const nullParser = new binaryParser();

const stringParser = new binaryParser()
	.uint32('length', {
		formatter: function(l) {
			return l === 0xffffffff ? 0 : l;
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

function timeFormatter(t) {
	var d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d = new Date(d.valueOf() + t);
	return d.valueOf();
}

function specialOperationModeFormatter(mode) {
	const special_operation_mode = [
		'',
		'NA VHF',
		'EU VHF',
		'field day',
		'RTTY RU',
		'fox',
		'hound'
	];

	return mode < special_operation_mode.length ? special_operation_mode[mode] : 'unknown';
}

function boolFormatter(b) {
	return b === 1;
}

function numberFormatter(n) {
	const intermediate = stringFormatter(n);
	return isNaN(intermediate) ? intermediate : Number(intermediate);
}

function maxUnit32Formatter(v) {
	return v === 0xffffffff ? null : v;
}

// (untested)
const colorParser = new binaryParser()
	.uint8('colorspec')
	.uint16('alpha')
	.uint16('red')
	.uint16('green')
	.uint16('blue')
	.uint16('pad')

// *** Parsers for WSJT-X Datagrams ***

// Out/In
const heartbeatParser = new binaryParser()
	.endianess('big')
	.uint32('max_schema_number')
	.nest('version', { type: stringParser, formatter: stringFormatter })
	.nest('revision', { type: stringParser, formatter: stringFormatter });

// Out
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
	.uint8('special_operation_mode', { formatter: specialOperationModeFormatter })
	.uint32('frequency_tolerance', { formatter: maxUnit32Formatter })
	.uint32('tr_period', { formatter: maxUnit32Formatter })
	.nest('configuration_name', { type: stringParser, formatter: stringFormatter })
	.nest('tx_message', { type: stringParser, formatter: stringFormatter });

// Out
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

// Out/In
const clearParser = new binaryParser()
	.endianess('big')
	.uint8('window');

function clearEncoder(message) {

}

// In  (untested)
const replyParser = new binaryParser()
	.endianess('big')
	.uint32('time', { formatter: timeFormatter })
	.int32('snr')
	.doublebe('delta_time')
	.uint32('delta_frequency')
	.nest('mode', { type: stringParser, formatter: stringFormatter })
	.nest('message', { type: stringParser, formatter: stringFormatter })
	.uint8('low_confidence')
	.uint8('modifiers');

function replyEncoder(message) {

}

// Out
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
	.nest('adif_propogation_mode', { type: stringParser, formatter: stringFormatter });

// Out (untested)
const closeParser = new binaryParser();

// In (untested)
const replayParser = new binaryParser();

// In (untested)
const haltTxParser = new binaryParser()
	.endianess('big')
	.uint8('auto_tx_only', { formatter: boolFormatter });

// In (untested)
const freeTextParser = new binaryParser()
	.endianess('big')
	.nest('text', { type: stringParser, formatter: stringFormatter })
	.uint8('send', { formatter: boolFormatter });

// Out (untested)
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

// In (untested)
const locationParser = new binaryParser()
	.endianess('big')
	.nest('location', { type: stringParser, formatter: stringFormatter });

// Out
const loggedAdifParser = new binaryParser()
	.endianess('big')
	.nest('adif_text', { type: stringParser, formatter: stringFormatter });


// In (untested)
const highlightCallsignParser = new binaryParser()
	.endianess('big')
	.nest('background_color', {type: colorParser })
	.nest('foreground_color', {type: colorParser })
	.uint8('highlight_last', {formatter: boolFormatter});

// In (untested)
const swicthConfigurationParser = new binaryParser()
	.endianess('big')
	.nest('configuration_name', { type: stringParser, formatter: stringFormatter });

// In (untested)
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

// The root parser
const wsjtxParser = new binaryParser()
	.endianess('big')
	.uint32('magic')
	.uint32('version')
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

const message_type = [
	'heartbeat',
	'status',
	'decode',
	'clear',
	'reply',
	'qso-logged',
	'close',
	'replay',
	'halt-tx',
	'free-text',
	'wspr-decode',
	'location',
	'logged-adif',
	'highlight-callsign',
	'switch-configuration',
	'configure',
];

function decode_message_type(type) {
	if (type < message_type.length) {
		return message_type[type];
	}

	return 'unknown';
}

function decode_message(message) {
	const [to, from, msg] = message.split(' ');
	if (to === 'CQ') {
		return { type: 'cq', de_call: from, de_grid: msg };
	}

	if (!msg) {
		return { type: 'tx?', dx_call: to, de_call: from };
	}

	if (msg === '73') {
		return { type: 'tx5', dx_call: to, de_call: from, message: msg };
	}

	if (msg === 'RR73' || msg === 'RRR') {
		return { type: 'tx4', dx: to, de: from, message: msg };
	}

	if (msg.startsWith('+') || msg.startsWith('-')) {
		return { type: 'tx2', dx_call: to, de_call: from, snr: parseInt(msg) };
	}

	if (msg.startsWith('R')) {
		return { type: 'tx3', dx_call: to, de_call: from, snr: parseInt(msg.slice(1)) };
	}

	return { type: 'tx1', dx_call: to, de_call: from, de_grid: msg };
}

function decode(buffer) {
	try {
		const decoded = wsjtxParser.parse(buffer);
		decoded.type = decode_message_type(decoded.type);

		if (decoded.hasOwnProperty('message')) {
			const message_decode = decode_message(decoded.message);
			decoded.message_decode = message_decode;
		}

		return decoded;

	} catch (error) {
		console.error(error);
		return null;
	}
}

function encode(obj) {
	const type_code = message_type.indexOf(obj.type);
	if (type_code < 0) {
		return null;
	}

	try {
		// TODO: encode...
		console.error('wsjt-x.encode() not implemented.');
		return null;

	} catch (error) {
		console.error(error);
		return null;
	}
}

module.exports = {
	decode: decode,
	encode: encode,
	message_type: message_type
};