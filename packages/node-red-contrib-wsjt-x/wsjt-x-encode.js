/* wsjt-x-encode.js - NodeRed node for encoding WSJT-X messages
 *
 * An out of date reference. 
 * https://github.com/roelandjansen/wsjt-x/blob/master/NetworkMessage.hpp
 * Consult the source for more accurate details:
 * https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html
 *
 * 2021/10/11 Stephen Houser, MIT License
 */
const wsjtx = require('./wsjt-x-parser-v2');

module.exports = function(RED) {
	'use strict';

	function WSJTXEncodeNode(config) {
		RED.nodes.createNode(this, config);

		const node = this;
		node.name = config.name;

		node.wsjtx_version = parseFloat(config.version);
        node.wsjtx_schema = parseInt(config.schema);

		node.on('input', function(msg, send, done) {
			const decoded = wsjtx.encode(msg.payload, node.wsjtx_version, node.wsjtx_schema);
			if (decoded && send) {
				const message = {
					...msg,
					topic: decoded.type,
					payload: decoded,
					input: msg.payload
				};

				send(message);
			}

			if (done) {
				done();
			}
		});
	}

	RED.nodes.registerType('wsjt-x-encode', WSJTXEncodeNode);
};
