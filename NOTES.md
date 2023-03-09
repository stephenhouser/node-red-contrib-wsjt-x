## Make, publish, etc..

1. Make your changes, etc, etc..
2. Commit changes. Optional push (lerna will push and tag version)
3. `lerna publish from-git`


### Prerelase

`lerna publish --dist-tag prerelease`


2021/12/19

JTDX Network protocol -- is it compatible?

https://github.com/jtdx-project/jtdx/blob/rc152/NetworkMessage.hpp

https://github.com/roelandjansen/wsjt-x/blob/master/NetworkMessage.hpp
# Development Notes

## 2023-03-06

Need to update to latest `binary-parser` is at v2.2.1 (09/20/2022).

`binary-parser-encoder` is [abandoned (7/26/2022)](https://github.com/keichi/binary-parser/pull/73).

Is there any reason to be using this in the current version for *parsing/decoding* anyhow? It looks like I left off with only *parsing* and just a start at *encoding*. Perhaps it can use the abandoned encoder only and use the current parser (`binary-parser`) it was based on.