/* wsjt-x-decode.js - Node-RED node for decoding WSJT-X messages
 *
 * An out of date reference. 
 * https://github.com/roelandjansen/wsjt-x/blob/master/NetworkMessage.hpp
 * Consult the source for more accurate details:
 * https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html
 *
 * 2021/10/11 Stephen Houser, MIT License
 */
const wsjtx = require('./wsjt-x-parser');

module.exports = function(RED) {
	'use strict';

	function WSJTXDecodeNode(config) {
		RED.nodes.createNode(this, config);

		const node = this;
		node.name = config.name;

		node.on('input', function(msg, send, done) {
			msg.input = msg.payload;
			const decoded = wsjtx.decode(msg.payload);
			if (decoded && send) {
				msg.payload = decoded;
				msg.topic = `${decoded.id}/${decoded.type}`;
				send(msg);
			}

			if (done) {
				done();
			}
		});
	}

	RED.nodes.registerType('wsjt-x-decode', WSJTXDecodeNode);
};
