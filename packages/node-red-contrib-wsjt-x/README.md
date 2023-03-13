# node-red-contrib-wsjt-x

A [NodeRed](https://nodered.org) node to handle the decoding of [WSJT-X](https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html) (and [JTDX](https://www.jtdx.tech/en/)) data. WSJT-X is an amatuer (ham) radio program that enables weak-signal radio communications using a variety of specially desinged protocols (FT8, FT4, WSPR, JT8, JT4, and more). This node allows the data decoded by WSJT-X to be injected into NodeRed flows for further processing and use.

![Example NodeRed Flow](wsjt-x-decode.png)

To *best* utilize this node in your flow while still being able to use other
programs (like GridTracker or your logging software) you should configure WSJT-X's Reporting: UDP Server to send to a [multicast address](https://en.wikipedia.org/wiki/Multicast_address). IP addresses `224.0.0.0` to `224.0.0.255` are reserved for local network multicast, thus an IP in this range is a great choice. Then in all the places you want to receive that data, configure those a multicast as well. Within NodeRed's `udp in` node, choose `Listen for: multicast messages` and then configure the same multicast IP address and port that you configured
WSJT-X with.

## WSJT-X Encoding

WSJT-X also allows commands to be sent via it's UDP port (when enabled)! The `wsjt-x-decode` node can take a message object and encode a proper buffer for sending out with a UDP node.

Currently implemented encoders for:

- clear: `{"type":"clear","window":2}`
- heartbeat: `{"type":"heartbeat","max_schema_number":3,"version":"2.6.1","revision":""}`
- reply (untested):
- halt_tx: `{"type":"halt_tx","auto_tx_only":false}`

The UDP out node needs to have the destination IP and port set to the IP and port of where WSJT-X sends from. This may be different than what you see in the Settings. You can easily discover these as they are available on any incoming UDP datagram from WSJT-X. An example flow is included that saves these in flow variables from incoming datagrams, and sets them just before the encoded message goes to the UDP out node.

