// UDP Client that will send faux FlexRadio data to listeners
const pcap = require('pcap');
const wsjtx = require('../wsjt-x-parser-v2');

let packet_n = 0;

// const ignore_types = [];
const ignore_types = ['status', 'decode', 'heartbeat'];


function buffer2hex(buffer) {
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join(' ');
}

async function test_packet(datagram, packet) {
	const decoded = wsjtx.decode(datagram.data);
	if (ignore_types.includes(decoded.type)) {
		return;
	}

	console.log(`\n\nPacket #${packet_n}: ${packet.payload.payload}`);
	console.log(buffer2hex(datagram.data));
	console.log(decoded);
}	

function get_udp_packet(packet) {
	if (packet &&
		//packet.payload.constructor.name == 'EthernetPacket' &&
		packet.payload.payload &&
		packet.payload.payload.constructor.name == 'IPv4' &&
		packet.payload.payload.payload &&
		packet.payload.payload.payload.constructor.name == 'UDP') {
		const data = {
				timestamp_s: packet.pcap_header.tv_sec,
				timestamp_us: packet.pcap_header.tv_usec,
				data: Buffer.from(packet.payload.payload.payload.data),
				sport: packet.payload.payload.payload.sport,
				dport: packet.payload.payload.payload.dport,
				length: packet.payload.payload.payload.length,
				checksum: packet.payload.payload.payload.checksum
			};
		
		return data;
	}

	return null;
}

async function get_packets(capture_file, callback) {
	return new Promise((resolve, reject) => {
		const packets = [];
		const pcap_session = pcap.createOfflineSession(capture_file);

		pcap_session.on('packet', (raw_packet) => {
			const packet = pcap.decode.packet(raw_packet);
			packet_n += 1;
			if (packet) {
				try {
					const datagram = get_udp_packet(packet);
					if (datagram && callback) {
						callback(datagram, packet);
					}
				} catch (error) {
					console.error(error);
				}
			}
		});		

		pcap_session.on("complete", () => {
			resolve(packets);
		});
	})
}

get_packets(process.argv[2], test_packet);
