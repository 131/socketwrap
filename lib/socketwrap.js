'use strict'

const proxyProtocol = require('@balena/proxy-protocol-parser');
const proxyProtocolCommon = require('@balena/proxy-protocol-parser/lib/v2_common');

exports.defaults = {
  strict: true,
  ignoreStrictExceptions: false,
  overrideRemote: true,
};

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

function defineSocketProperties(socket, proxyInfo, overrideRemote) {
  const socketParams = {
    clientAddress: proxyInfo.remoteAddress,
    proxyAddress: proxyInfo.localAddress,
    clientPort: proxyInfo.remotePort,
    proxyPort: proxyInfo.localPort,
  };
  for (const [propertyName, propertyValue] of Object.entries(socketParams)) {
    defineProperty(socket, propertyName, () => propertyValue);
  }
  if (overrideRemote) {
    defineProperty(socket, 'remoteAddress', () => socketParams.clientAddress);
    defineProperty(socket, 'remotePort', () => socketParams.clientPort);
  }
}

// Wraps current socket so that
// `socket.remoteAddress` and `remotePort` work correctly when used with the
// PROXY protocol (http://haproxy.1wt.eu/download/1.5/doc/proxy-protocol.txt)
// strict option drops requests without proxy headers, enabled by default to match previous behavior, disable to allow both proxied and non-proxied requests

exports.proxy = function (socket, options, cb) {
  const exports = {};
  options = {
    ...module.exports.defaults,
    ...options
  };

  exports.options = options;

  const realEmit = socket.emit;

  let protocolError = false;
  if (this.timeout && socket.timeout === undefined) {
    socket.setTimeout(this.timeout, socket.end);
  }




  socket.on('readable', onReadable);
  let buf = Buffer.alloc(0);

  function destroy(error, wasStrict) {
    error = error || undefined;

    if (!(error instanceof Error)) {
      error = new Error(error);
    }

    // Set header on error
    error.header = buf.toString('ascii');

    protocolError = true;

    socket.destroy(
      wasStrict
        ? (!options.ignoreStrictExceptions && error) || undefined
        : error,
    );
  }


  function onReadable() {
    let chunk;
    chunk = socket.read();

    if (chunk === null && buf.length === 0) {
      cb(null, socket); //not so sure
      return;
    }

    while (chunk !== null) {
      buf = Buffer.concat([buf, chunk]);
      // if the first 5 bytes aren't PROXY, something's not right.
      if (
        buf.length >= Math.max(v1Header.length, v2Header.length) &&
        (
          !buf.slice(0, v1Header.length).equals(Buffer.from(v1Header)) &&
          !buf.slice(0, v2Header.length).equals(Buffer.from(v2Header))
        )
      ) {
        protocolError = true;
        if (options.strict) {
          return destroy('non-PROXY protocol connection', true);
        }
      }
      const [headerCompleted, proxyInfo, bufferRest] = isHeaderCompleted(buf);
      if (headerCompleted || protocolError) {
        socket.removeListener('readable', onReadable);

        if (options.strict) {
          if (!proxyInfo || isNaN(proxyInfo.remotePort)) {
            return destroy('PROXY protocol malformed header', true);
          }
        }

        if (!protocolError) {
          defineSocketProperties(socket, proxyInfo, options.overrideRemote);
        }

        socket.unshift(bufferRest);
        cb(null, socket);

        if (socket.ondata) {
          const data = socket.read();

          if (data) {
            socket.ondata(data, 0, data.length);
          }
        }
        return;
      } if (buf.length > 107) {
        return destroy('PROXY header too long', false);
      }

      chunk = socket.read();
    }
  }


  return exports;
};
