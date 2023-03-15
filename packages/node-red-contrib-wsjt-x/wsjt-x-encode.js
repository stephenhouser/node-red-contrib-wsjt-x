/* wsjt-x-encode.js - NodeRed node for encoding WSJT-X messages
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

	function WSJTXEncodeNode(config) {
		RED.nodes.createNode(this, config);

		const node = this;
		node.name = config.name;

		node.wsjtx_id = config.wsjtx_id;
		node.wsjtx_version = parseFloat(config.version);
        node.wsjtx_schema = parseInt(config.schema);

		node.on('input', function(msg, send, done) {
			// we can only encode objects, not strings or numbers, or buffers...
			if (typeof(msg.payload) != 'object') {
				throw new Error(`Can only encode objects, ${typeof(msg.payload)} was given.`);
			}

			// the type of message can be either in the payload or in the topic
			// prefer msg.payload.type to msg.topic
			if ('type' in msg.payload) {
				msg.topic = msg.payload['type'];
			} else if (msg.topic) {
				msg.payload['type'] = msg.topic;
			} else {
				throw new Error(`No message type was given (msg.topic or msg.payload.type) cannot encode.`);
			}

			// Add WSJT-X Id from node configuration if there is not one given in the payload
			if (!('id' in encode_msg.payload)) {
				encode_msg.payload['id'] = node.wsjtx_id;
			}

			msg.input = msg.payload;
			msg.payload = wsjtx.encode(msg, node.wsjtx_version, node.wsjtx_schema);

			// Send off the result without modifying the original message.
			if (msg.payload && send) {
				send(msg);
			}

			if (done) {
				done();
			}
		});
	}

	RED.nodes.registerType('wsjt-x-encode', WSJTXEncodeNode);
};
