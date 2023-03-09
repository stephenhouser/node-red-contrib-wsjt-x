
function buffer2hex(buffer) {
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join(' ');
}
const wsjtx = require('../wsjt-x-parser');
const clearMsg = {
    type: 'clear',
};

buf = wsjtx.encode(clearMsg);
console.log(buffer2hex(buf));	  


const heartbeatMsg = {
    type: 'heartbeat',
    max_schema_number: 3,
    version: '2.6.1',
    revision: ''
  }

buf = wsjtx.encode(heartbeatMsg);
if (typeof(buf) == 'string') {
    console.log(`ERROR: ${buf}`);
} else {
    console.log(buffer2hex(buf));
    msg = wsjtx.decode(buf);
    console.log(`Decode: ${JSON.stringify(msg)}`);
}
