const bippath = require('bip32-path');

const COTI_SCRAMBLE_KEY = 'COTI';

export const BIP32_PATH = "44'/6779'/0'/0";

export default class HWSDK {
  constructor(transport) {
    this.transport = transport;

    transport.decorateAppAPIMethods(this, ['getAddress', 'signMessage'], COTI_SCRAMBLE_KEY);
  }

  // Get COTI address for a given BIP32 path.
  async getAddress(path) {
    const paths = bippath.fromString(path).toPathArray();
    const buffer = Buffer.alloc(1 + paths.length * 4);
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });

    const response = await this.transport.send(0xe0, 0x02, 0x00, 0x00, buffer);
    const result = {};
    const publicKeyLength = response[0];
    const addressLength = response[1 + publicKeyLength];
    result.publicKey = response.slice(1, 1 + publicKeyLength).toString('hex');
    result.address =
      '0x' + response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString('ascii');
    return result;
  }

  // Signs a message and retrieves v, r, s given the raw transaction and the BIP32 path.
  async signMessage(path, messageHex) {
    const paths = bippath.fromString(path).toPathArray();
    let offset = 0;
    const message = Buffer.from(messageHex, 'hex');
    const data = [];

    while (offset !== message.length) {
      const maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 - 4 : 150;
      const chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
      const buffer = Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + 4 + chunkSize : chunkSize);
      if (offset === 0) {
        buffer[0] = paths.length;
        paths.forEach((element, index) => {
          buffer.writeUInt32BE(element, 1 + 4 * index);
        });
        buffer.writeUInt32BE(message.length, 1 + 4 * paths.length);
        message.copy(buffer, 1 + 4 * paths.length + 4, offset, offset + chunkSize);
      } else {
        message.copy(buffer, 0, offset, offset + chunkSize);
      }
      data.push(buffer);
      offset += chunkSize;
    }
    let response;
    for (let i = 0; i < data.length; ++i) {
      response = await this.transport.send(0xe0, 0x04, i === 0 ? 0x00 : 0x80, 0x00, data[i]);
    }

    const v = response[0];
    const r = response.slice(1, 1 + 32).toString('hex');
    const s = response.slice(1 + 32, 1 + 32 + 32).toString('hex');

    return { v, r, s };
  }
}
