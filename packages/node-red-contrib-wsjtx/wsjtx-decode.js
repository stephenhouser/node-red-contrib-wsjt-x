/* wsjtx-decode.js - NodeRed node for decoding WSJTX messages
 *
 * An out of date reference. 
 * https://github.com/roelandjansen/wsjt-x/blob/master/NetworkMessage.hpp
 * Consult the source for more accurate details:
 * https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html
 *
 * 2021/10/11 Stephen Houser, MIT License
 */
const wsjtx = require('./wsjtx-coder');

module.exports = function(RED) {
	'use strict';

	function WSJTXDecodeNode(config) {
		RED.nodes.createNode(this, config);

		const node = this;
		node.name = config.name;

		node.on('input', function(msg, send, done) {
			const decoded = wsjtx.decode(msg.payload);
			if (decoded && send) {
				const message = {
					topic: decoded.type,
					payload: decoded
				};

				send(message);
			}
			
			if (done) {
				done();
			}
		});
	}

	RED.nodes.registerType('wsjtx-decode', WSJTXDecodeNode);
};
