# Socketwrap

Add [PROXY protocol](http://haproxy.1wt.eu/download/1.5/doc/proxy-protocol.txt). v1 or v2 support to nodejs sockets. IPv4 and IPv6 protocols supported

## History

This module is a fork of original [proxywrap](https://github.com/cusspvz/proxywrap) by [Josh Dague](https://github.com/daguej), [José Moreira
](https://github.com/cusspvz) and [Short-io/proxywrap](https://github.com/Short-io/proxywrap). Those projects all relies on hooking/rewriting nodejs servers. This module implement a simplier async "socket validation" callback policy.

This module validate a newly opened nodejs socket, automatically parses the PROXY headers and resets `socket.remoteAddress` and `socket.remotePort` so that they have the correct values. Then trigger a simple callback

This module wraps node's various `Server` interfaces so that they are compatible with the 

This module is especially useful if you need to get the client IP address when you're behind an AWS ELB in TCP mode.

## Installing

```bash
npm install --save socketwrap
```

## Usage

```js
const net = require('net')
var {socketwrap, override}  = require('socketwrap');

var srv = new net.Server( async (socket) {

  let {remoteAddress, remotePort} = await socketwrap(socket);
  override(socket, {remoteAddress, remotePort}); //you might want to deal with that in another way

  socket.pipe(somedest);
  console.log("IP = %s:%d", socket.remoteAddress, socket.remotePort);
});

srv.listen( 80 )

```
This also adds to all your sockets the properties:
* `socket.clientAddress` - The IP Address that connected to your PROXY.
* `socket.clientPort` - The Port used by who connected to your PROXY.
* `socket.proxyAddress` - The IP Address exposed on Client <-> Proxy side.
* `socket.proxyPort` - The Port exposed on Client <-> Proxy side. Usefull for detecting SSL on AWS ELB.
* `socket.remoteAddress` [optional] - Same as `socket.clientAddress`, used for compability proposes.
* `socket.remotePort` [optional] - Same as `socket.clientPort`, used for compability proposes.

**Warning:** By default, *all* traffic to your proxied server MUST use the PROXY protocol.  If the first five bytes received aren't `PROXY`, the connection will be dropped.  Obviously, the node server accepting PROXY connections should not be exposed directly to the internet; only the proxy (whether ELB, HAProxy, or something else) should be able to connect to node.

## API


### `<proxyInfo> async socketwrap(socket)`

Parse a socket header for PROXY protocol support.



## Contribute

Do you have any idea to improve this module?
Feel free to open an [Issue](https://github.com/131/socketwrap/issues/new) or a [Pull Request](https://github.com/131/socketwrap/pulls).


## Credits
* [131](https://github.com/131)
* [Josh Dague](https://github.com/daguej) for creating original [proxywrap](https://github.com/daguej/node-proxywrap).


