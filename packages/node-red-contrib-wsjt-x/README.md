# node-red-contrib-wsjt-x

A [NodeRed](https://nodered.org) node to handle the decoding and encoding of [WSJT-X](https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html) (and [JTDX](https://www.jtdx.tech/en/)) data. WSJT-X is an amatuer (ham) radio program that enables weak-signal radio communications using a variety of specially desinged protocols (FT8, FT4, WSPR, JT8, JT4, and more). This node allows the data sent by WSJT-X to be injected into NodeRed flows for further processing and use. It also allows messages from NodeRed flows to be encoded and sent to WSJT-X.

![Example NodeRed Flow](wsjt-x-decode.png)

To *best* utilize this node in your flow while still being able to use other
programs (like GridTracker or your logging software) you should configure WSJT-X's Reporting: UDP Server to send to a [multicast address](https://en.wikipedia.org/wiki/Multicast_address). IP addresses `224.0.0.0` to `224.0.0.255` are reserved for local network multicast, thus an IP in this range is a great choice. Then in all the places you want to receive that data, configure those a multicast as well. Within NodeRed's `udp in` node, choose `Listen for: multicast messages` 
and then configure the same multicast IP address and port that you configured
WSJT-X with.

To *send* commands to WSJT-X you will need to identify the IP address and port number that WSJT-X is using to send data out. This is not the same as the address WSJT-X sends to (above). The easist method is to use a `udp in` node setup to receive data (as above) and use the `msg.ip` and `msg.port` from incoming messages. The `wsjt-x-encode` node can be used to encode messages from your flow into `buffer` objects that a `udp out` node, properly configured, can then send to WSJT-X. You will also have to configure WSJT-X to accept incoming UDP commands, look in *Settings*.

## WSJT-X Encoding Work-in-progrss (v2.0)

Currently the encoder only implements a subseet of the commands that can be sent to WSJT-X. They are as follows:

- clear: `{"type":"clear","window":2}`
- heartbeat: `{"type":"heartbeat","max_schema_number":3,"version":"2.6.1","revision":""}`
- reply (untested):
- halt_tx: `{"type":"halt_tx","auto_tx_only":false}`
- close: `{"type":"close"}`

Future versions will have encoders for all the WSJT-X messages. Yes, this means you would be able to have a flow that looks like an instance of WSJT-X!