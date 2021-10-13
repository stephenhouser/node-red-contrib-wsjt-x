# node-red-contrib-wsjtx

A simple node to handle the decoding of WSJTX data in NodeRed.

![Example NodeRed Flow](wsjtx-decode.png)

To best utilize this node in your flow while still being able to use other
programs (like GridTracker) you should configure WSJTX's Reporting, UDP Server
to send to a *multicast* address (example 224.0.0.1). Then in all the places 
you want to receive that data, configure those a multicast as well. Within 
NodeRed's `udp in` node, choose `Listen for: multicast messages` and then
configure the same multicast `group` (IP address) and port that you configured
WSJTX with.

