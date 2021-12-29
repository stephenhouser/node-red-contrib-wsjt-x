# node-red-contrib-wsjt-x

A [NodeRed](https://nodered.org) node to handle the decoding of [WSJT-X](https://www.physics.princeton.edu/pulsar/k1jt/wsjtx.html) (and [JTDX](https://www.jtdx.tech/en/)) data. WSJT-X is an amatuer (ham) radio program that enables weak-signal radio communications using a variety of specially desinged protocols (FT8, FT4, WSPR, JT8, JT4, and more). This node allows the data decoded by WSJT-X to be injected into NodeRed flows for further processing and use.

![Example NodeRed Flow](wsjt-x-decode.png)

To *best* utilize this node in your flow while still being able to use other
programs (like GridTracker or your logging software) you should configure WSJT-X's Reporting: UDP Server to send to a [multicast address](https://en.wikipedia.org/wiki/Multicast_address). IP addresses `224.0.0.0` to `224.0.0.255` are reserved for local network multicast, thus an IP in this range is a great choice. Then in all the places you want to receive that data, configure those a multicast as well. Within NodeRed's `udp in` node, choose `Listen for: multicast messages` and then configure the same multicast IP address and port that you configured
WSJT-X with.
