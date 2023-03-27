
## Changes in v2.0

- A refactored parser to try and manage WSJT-X (and JTDX) version differences. Such a large
refactor is bound to introduce problems that were not there beofre or new ones that I don't see.

- The addition of encoding with the `wsjt-x-encode` node. While I have a goal of being able to
encode *all* the WSJT-X messages, the priority is to complete the ones that WSJT-X accepts as
input first. See the [WSJT-X Source Code](* https://github.com/roelandjansen/wsjt-x/blob/master/NetworkMessage.hpp)
for details. 

- Topics sent from the `decode` node are now prefixed with the WSJT-X instance id that sent them. 
For example, if WSJT-X is configured as `WSJT-X` (the default) the a `heartbeat` message will get 
a `msg.topic` of 'WSJT-X/heartbeat`. The prefix is id sent by WSJT-X and the suffix is the decoded
message type.

- The message sent into a decode/encode node is now *modified* by the decode/encode nodes to update
the `payload` and other `msg` properties. In earlier versions the message was copied to avoid updating
something that might be used elsewhere. The new version seems to fit better with the general
Node-RED paradigm.

- The `time` fields in several messages are passed through as decoded and a new `datetime_decode`
property is synthesized to reflect the actual date and time of a message. In previous versions
the `time` field was modified to include date information where it was not present. This new
version adheres to the don't modify original data idea.

## Untested

- I may have broken JTDX.
- Have not tested `reply` or `configure`, `wspr_decode`