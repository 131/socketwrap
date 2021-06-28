'use strict'

const proxyProtocol       = require('@balena/proxy-protocol-parser');
const proxyProtocolCommon = require('@balena/proxy-protocol-parser/lib/v2_common');


const v1Header = 'PROXY';
const v2Header = proxyProtocolCommon.sigBytes;

const proxyProtocolFields = [
  'remoteAddress',
  'remotePort',
  'clientAddress',
  'clientPort',
  'proxyAddress',
  'proxyPort',
];

const isHeaderCompleted = (buf) => {
  if (buf.slice(0, 5).equals(Buffer.from('PROXY'))) {
    const endOfBufferIndex = buf.indexOf('\r');
    if (endOfBufferIndex >= 0) {
      const proxyInfo = proxyProtocol.v1_decode(buf.slice(0, endOfBufferIndex));

      return [true, proxyInfo, buf.slice(endOfBufferIndex + 2)];
    }
    return [false, null, buf.slice(endOfBufferIndex + 2)];
  }
  if (buf.slice(0, v2Header.length).equals(v2Header)) {
    const addrLength = buf[15] + buf[14] * 256;
    const proxyInfo = proxyProtocol.v2_decode(buf.slice(0, 16 + addrLength));
    return [true, proxyInfo, buf.slice(16 + addrLength)]
  }
  return [false, null, buf]
}



function defineProperty(target, propertyName, getter) {
  Object.defineProperty(target, propertyName, {
    enumerable: false,
    configurable: true,
    get: getter,
  });
}


const override = function(socket, socketParams) {
  for (const [propertyName, propertyValue] of Object.entries(socketParams))
    defineProperty(socket, propertyName, () => propertyValue);
}

// unwraps current socket with PROXY protocol headers (http://haproxy.1wt.eu/download/1.5/doc/proxy-protocol.txt)

var socketwrap = function (socket) {

  let protocolError = false;
  let buf = Buffer.alloc(0);

  return new Promise((resolve, reject) => {

    socket.on('readable', onReadable);

    function destroy(error) {
      error = error || undefined;

      if (!(error instanceof Error)) {
        error = new Error(error);
      }
      // Set header on error
      error.header = buf.toString('ascii');
      protocolError = true;
      socket.destroy();
      reject(error);
    }


    function onReadable() {
      let chunk;
      chunk = socket.read();

      if (chunk === null && buf.length === 0)
        return;

      while (chunk !== null) {
        buf = Buffer.concat([buf, chunk]);
        // if the first 5 bytes aren't PROXY, something's not right.
        if (
          buf.length >= Math.max(v1Header.length, v2Header.length) &&
          (
            !buf.slice(0, v1Header.length).equals(Buffer.from(v1Header)) &&
            !buf.slice(0, v2Header.length).equals(Buffer.from(v2Header))
          )
        )
          return destroy('non-PROXY protocol connection');

        const [headerCompleted, proxyInfo, bufferRest] = isHeaderCompleted(buf);

        if (headerCompleted || protocolError) {

          socket.removeListener('readable', onReadable);

          if (!proxyInfo || isNaN(proxyInfo.remotePort))
            return destroy('PROXY protocol malformed header');

          socket.unshift(bufferRest);

          resolve(proxyInfo);

          if (socket.ondata) {
            const data = socket.read();

            if (data)
              socket.ondata(data, 0, data.length);
          }
          return;
        }

        if (buf.length > 107)
          return destroy('PROXY header too long');

        chunk = socket.read();
      }
    }
  });
};


module.exports = {socketwrap, override};