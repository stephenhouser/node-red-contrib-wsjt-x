/* wsjt-x-encode.js - Node-RED node for encoding WSJT-X messages
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

			// Use WSJT-X Id from node configuration if there is not an explicit one in the payload
			if (!('id' in msg.payload)) {
				msg.payload['id'] = node.wsjtx_id;
			}

			msg.input = msg.payload;
			msg.payload = wsjtx.encode(msg.payload, node.wsjtx_version, node.wsjtx_schema);
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
