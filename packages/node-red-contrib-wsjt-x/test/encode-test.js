
function buffer2hex(buffer) {
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join(' ');
}
const wsjtx = require('../wsjt-x-parser-v2');
const clearMsg = {
    id: 'NODEJS',
    type: 'clear',
    window: 1
};

console.log(`Encode: ${JSON.stringify(clearMsg)}`);
buf = wsjtx.encode(clearMsg);
console.log(`\t${buffer2hex(buf)}`);	  
console.log(`\t${JSON.stringify(wsjtx.decode(buf))}`);
console.log('---');

const heartbeatMsg = {
    type: 'heartbeat',
    max_schema_number: 3,
    version: '2.6.1',
    revision: ''
  }

console.log(`Encode: ${JSON.stringify(heartbeatMsg)}`);
buf = wsjtx.encode(heartbeatMsg);
console.log(`\t${buffer2hex(buf)}`);	  
console.log(`\t${JSON.stringify(wsjtx.decode(buf))}`);
console.log('---');
  