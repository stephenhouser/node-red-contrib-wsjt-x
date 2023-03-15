
function buffer2hex(buffer) {
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join(' ');
}
const wsjtx = require('../wsjt-x-parser');


function test_message(msg) {
  console.log('');
  console.log(`Encode: ${JSON.stringify(msg)}`);
  buf = wsjtx.encode(msg);
  console.log(`\t${buffer2hex(buf)}`);
  dmsg = wsjtx.decode(buf)
  console.log(`Decode: ${JSON.stringify(dmsg)}`);
  console.log('');
  
}

test_message({type:"close"});


test_message({type:"halt_tx",auto_tx_only:false,id:"NODE-1"});

test_message({
    id: 'NODEJS',
    type: 'clear',
    window: 1
});

test_message({
    type: 'heartbeat',
    max_schema_number: 3,
    version: '2.6.1',
    revision: ''
});

test_message({
  type: 'reply',
  time: 67500000,
  snr: 0,
  delta_time: 0.20000000298023224,
  delta_frequency: 1612,
  mode: '~',
  message: 'CQ N1SH FN43',
  low_confidence: 0,
  modifiers: '',
});

test_message({
  type: 'halt_tx',
  auto_tx_only: false
});



test_message({
  type: 'highlight_callsign',
  callsign: 'N1SH',
	foreground_color: 'FFFFFF',
	background_color: '#FF0000',
  highlight_last: true

});

