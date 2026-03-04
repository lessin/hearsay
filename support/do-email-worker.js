// Digital Ocean Email Worker for hearsay.email
// Parses incoming email and POSTs to app /update endpoint
// Bundled with PostalMime (MIME/email parser). Deploy as a DO Worker.

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var textEncoder = new TextEncoder();
var base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var base64Lookup = new Uint8Array(256);
for (var i = 0; i < base64Chars.length; i++) {
  base64Lookup[base64Chars.charCodeAt(i)] = i;
}
function decodeBase64(base64) {
  let bufferLength = Math.ceil(base64.length / 4) * 3;
  const len = base64.length;
  let p = 0;
  if (base64.length % 4 === 3) {
    bufferLength--;
  } else if (base64.length % 4 === 2) {
    bufferLength -= 2;
  } else if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=") {
      bufferLength--;
    }
  }
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arrayBuffer);
  for (let i2 = 0; i2 < len; i2 += 4) {
    let encoded1 = base64Lookup[base64.charCodeAt(i2)];
    let encoded2 = base64Lookup[base64.charCodeAt(i2 + 1)];
    let encoded3 = base64Lookup[base64.charCodeAt(i2 + 2)];
    let encoded4 = base64Lookup[base64.charCodeAt(i2 + 3)];
    bytes[p++] = encoded1 << 2 | encoded2 >> 4;
    bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
    bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
  }
  return arrayBuffer;
}
__name(decodeBase64, "decodeBase64");
__name2(decodeBase64, "decodeBase64");
function getDecoder(charset) {
  charset = charset || "utf8";
  return new TextDecoder(charset);
}
__name(getDecoder, "getDecoder");
__name2(getDecoder, "getDecoder");
async function blobToArrayBuffer(blob) {
  if ("arrayBuffer" in blob) {
    return await blob.arrayBuffer();
  }
  const fr = new FileReader();
  return new Promise((resolve, reject) => {
    fr.onload = function(e) {
      resolve(e.target.result);
    };
    fr.onerror = function(e) {
      reject(fr.error);
    };
    fr.readAsArrayBuffer(blob);
  });
}
__name(blobToArrayBuffer, "blobToArrayBuffer");
__name2(blobToArrayBuffer, "blobToArrayBuffer");
function getHex(c) {
  if (c >= 48 && c <= 57 || c >= 97 && c <= 102 || c >= 65 && c <= 70) {
    return String.fromCharCode(c);
  }
  return false;
}
__name(getHex, "getHex");
__name2(getHex, "getHex");
function decodeWord(charset, encoding, str) {
  let splitPos = charset.indexOf("*");
  if (splitPos >= 0) {
    charset = charset.substr(0, splitPos);
  }
  encoding = encoding.toUpperCase();
  let byteStr;
  if (encoding === "Q") {
    str = str.replace(/=\s+([0-9a-fA-F])/g, "=$1").replace(/[_\s]/g, " ");
    let buf = textEncoder.encode(str);
    let encodedBytes = [];
    for (let i2 = 0, len = buf.length; i2 < len; i2++) {
      let c = buf[i2];
      if (i2 <= len - 2 && c === 61) {
        let c1 = getHex(buf[i2 + 1]);
        let c2 = getHex(buf[i2 + 2]);
        if (c1 && c2) {
          let c3 = parseInt(c1 + c2, 16);
          encodedBytes.push(c3);
          i2 += 2;
          continue;
        }
      }
      encodedBytes.push(c);
    }
    byteStr = new ArrayBuffer(encodedBytes.length);
    let dataView = new DataView(byteStr);
    for (let i2 = 0, len = encodedBytes.length; i2 < len; i2++) {
      dataView.setUint8(i2, encodedBytes[i2]);
    }
  } else if (encoding === "B") {
    byteStr = decodeBase64(str.replace(/[^a-zA-Z0-9\+\/=]+/g, ""));
  } else {
    byteStr = textEncoder.encode(str);
  }
  return getDecoder(charset).decode(byteStr);
}
__name(decodeWord, "decodeWord");
__name2(decodeWord, "decodeWord");
function decodeWords(str) {
  let joinString = true;
  let done = false;
  while (!done) {
    let result = (str || "").toString().replace(/(=\?([^?]+)\?[Bb]\?([^?]*)\?=)\s*(?==\?([^?]+)\?[Bb]\?[^?]*\?=)/g, (match, left, chLeft, encodedLeftStr, chRight) => {
      if (!joinString) {
        return match;
      }
      if (chLeft === chRight && encodedLeftStr.length % 4 === 0 && !/=$/.test(encodedLeftStr)) {
        return left + "__\0JOIN\0__";
      }
      return match;
    }).replace(/(=\?([^?]+)\?[Qq]\?[^?]*\?=)\s*(?==\?([^?]+)\?[Qq]\?[^?]*\?=)/g, (match, left, chLeft, chRight) => {
      if (!joinString) {
        return match;
      }
      if (chLeft === chRight) {
        return left + "__\0JOIN\0__";
      }
      return match;
    }).replace(/(\?=)?__\x00JOIN\x00__(=\?([^?]+)\?[QqBb]\?)?/g, "").replace(/(=\?[^?]+\?[QqBb]\?[^?]*\?=)\s+(?==\?[^?]+\?[QqBb]\?[^?]*\?=)/g, "$1").replace(/=\?([\w_\-*]+)\?([QqBb])\?([^?]*)\?=/g, (m, charset, encoding, text) => decodeWord(charset, encoding, text));
    if (joinString && result.indexOf("\uFFFD") >= 0) {
      joinString = false;
    } else {
      return result;
    }
  }
}
__name(decodeWords, "decodeWords");
__name2(decodeWords, "decodeWords");
function decodeURIComponentWithCharset(encodedStr, charset) {
  charset = charset || "utf-8";
  let encodedBytes = [];
  for (let i2 = 0; i2 < encodedStr.length; i2++) {
    let c = encodedStr.charAt(i2);
    if (c === "%" && /^[a-f0-9]{2}/i.test(encodedStr.substr(i2 + 1, 2))) {
      let byte = encodedStr.substr(i2 + 1, 2);
      i2 += 2;
      encodedBytes.push(parseInt(byte, 16));
    } else if (c.charCodeAt(0) > 126) {
      c = textEncoder.encode(c);
      for (let j = 0; j < c.length; j++) {
        encodedBytes.push(c[j]);
      }
    } else {
      encodedBytes.push(c.charCodeAt(0));
    }
  }
  const byteStr = new ArrayBuffer(encodedBytes.length);
  const dataView = new DataView(byteStr);
  for (let i2 = 0, len = encodedBytes.length; i2 < len; i2++) {
    dataView.setUint8(i2, encodedBytes[i2]);
  }
  return getDecoder(charset).decode(byteStr);
}
__name(decodeURIComponentWithCharset, "decodeURIComponentWithCharset");
__name2(decodeURIComponentWithCharset, "decodeURIComponentWithCharset");
function decodeParameterValueContinuations(header) {
  let paramKeys = /* @__PURE__ */ new Map();
  Object.keys(header.params).forEach((key) => {
    let match = key.match(/\*((\d+)\*?)?$/);
    if (!match) {
      return;
    }
    let actualKey = key.substr(0, match.index).toLowerCase();
    let nr = Number(match[2]) || 0;
    let paramVal;
    if (!paramKeys.has(actualKey)) {
      paramVal = { charset: false, values: [] };
      paramKeys.set(actualKey, paramVal);
    } else {
      paramVal = paramKeys.get(actualKey);
    }
    let value = header.params[key];
    if (nr === 0 && match[0].charAt(match[0].length - 1) === "*" && (match = value.match(/^([^']*)'[^']*'(.*)$/))) {
      paramVal.charset = match[1] || "utf-8";
      value = match[2];
    }
    paramVal.values.push({ nr, value });
    delete header.params[key];
  });
  paramKeys.forEach((paramVal, key) => {
    header.params[key] = decodeURIComponentWithCharset(
      paramVal.values.sort((a, b) => a.nr - b.nr).map((a) => a.value).join(""),
      paramVal.charset
    );
  });
}
__name(decodeParameterValueContinuations, "decodeParameterValueContinuations");
__name2(decodeParameterValueContinuations, "decodeParameterValueContinuations");
var PassThroughDecoder = class {
  static { __name(this, "PassThroughDecoder"); }
  static { __name2(this, "PassThroughDecoder"); }
  constructor() {
    this.chunks = [];
  }
  update(line) {
    this.chunks.push(line);
    this.chunks.push("\n");
  }
  finalize() {
    return blobToArrayBuffer(new Blob(this.chunks, { type: "application/octet-stream" }));
  }
};
var Base64Decoder = class {
  static { __name(this, "Base64Decoder"); }
  static { __name2(this, "Base64Decoder"); }
  constructor(opts) {
    opts = opts || {};
    this.decoder = opts.decoder || new TextDecoder();
    this.maxChunkSize = 100 * 1024;
    this.chunks = [];
    this.remainder = "";
  }
  update(buffer) {
    let str = this.decoder.decode(buffer);
    if (/[^a-zA-Z0-9+\/]/.test(str)) {
      str = str.replace(/[^a-zA-Z0-9+\/]+/g, "");
    }
    this.remainder += str;
    if (this.remainder.length >= this.maxChunkSize) {
      let allowedBytes = Math.floor(this.remainder.length / 4) * 4;
      let base64Str;
      if (allowedBytes === this.remainder.length) {
        base64Str = this.remainder;
        this.remainder = "";
      } else {
        base64Str = this.remainder.substr(0, allowedBytes);
        this.remainder = this.remainder.substr(allowedBytes);
      }
      if (base64Str.length) {
        this.chunks.push(decodeBase64(base64Str));
      }
    }
  }
  finalize() {
    if (this.remainder && !/^=+$/.test(this.remainder)) {
      this.chunks.push(decodeBase64(this.remainder));
    }
    return blobToArrayBuffer(new Blob(this.chunks, { type: "application/octet-stream" }));
  }
};
var QPDecoder = class {
  static { __name(this, "QPDecoder"); }
  static { __name2(this, "QPDecoder"); }
  constructor(opts) {
    opts = opts || {};
    this.decoder = opts.decoder || new TextDecoder();
    this.maxChunkSize = 100 * 1024;
    this.remainder = "";
    this.chunks = [];
  }
  decodeQPBytes(encodedBytes) {
    let buf = new ArrayBuffer(encodedBytes.length);
    let dataView = new DataView(buf);
    for (let i2 = 0, len = encodedBytes.length; i2 < len; i2++) {
      dataView.setUint8(i2, parseInt(encodedBytes[i2], 16));
    }
    return buf;
  }
  decodeChunks(str) {
    str = str.replace(/=\r?\n/g, "");
    let list = str.split(/(?==)/);
    let encodedBytes = [];
    for (let part of list) {
      if (part.charAt(0) !== "=") {
        if (encodedBytes.length) {
          this.chunks.push(this.decodeQPBytes(encodedBytes));
          encodedBytes = [];
        }
        this.chunks.push(part);
        continue;
      }
      if (part.length === 3) {
        encodedBytes.push(part.substr(1));
        continue;
      }
      if (part.length > 3) {
        encodedBytes.push(part.substr(1, 2));
        this.chunks.push(this.decodeQPBytes(encodedBytes));
        encodedBytes = [];
        part = part.substr(3);
        this.chunks.push(part);
      }
    }
    if (encodedBytes.length) {
      this.chunks.push(this.decodeQPBytes(encodedBytes));
    }
  }
  update(buffer) {
    let str = this.decoder.decode(buffer) + "\n";
    str = this.remainder + str;
    if (str.length < this.maxChunkSize) {
      this.remainder = str;
      return;
    }
    this.remainder = "";
    let partialEnding = str.match(/=[a-fA-F0-9]?$/);
    if (partialEnding) {
      if (partialEnding.index === 0) {
        this.remainder = str;
        return;
      }
      this.remainder = str.substr(partialEnding.index);
      str = str.substr(0, partialEnding.index);
    }
    this.decodeChunks(str);
  }
  finalize() {
    if (this.remainder.length) {
      this.decodeChunks(this.remainder);
      this.remainder = "";
    }
    return blobToArrayBuffer(new Blob(this.chunks, { type: "application/octet-stream" }));
  }
};
var MimeNode = class {
  static { __name(this, "MimeNode"); }
  static { __name2(this, "MimeNode"); }
  constructor(opts) {
    opts = opts || {};
    this.postalMime = opts.postalMime;
    this.root = !!opts.parentNode;
    this.childNodes = [];
    if (opts.parentNode) opts.parentNode.childNodes.push(this);
    this.state = "header";
    this.headerLines = [];
    this.contentType = { value: "text/plain", default: true };
    this.contentTransferEncoding = { value: "8bit" };
    this.contentDisposition = { value: "" };
    this.headers = [];
    this.contentDecoder = false;
  }
  setupContentDecoder(transferEncoding) {
    if (/base64/i.test(transferEncoding)) this.contentDecoder = new Base64Decoder();
    else if (/quoted-printable/i.test(transferEncoding)) this.contentDecoder = new QPDecoder({ decoder: getDecoder(this.contentType.parsed.params.charset) });
    else this.contentDecoder = new PassThroughDecoder();
  }
  async finalize() {
    if (this.state === "finished") return;
    if (this.state === "header") this.processHeaders();
    let boundaries = this.postalMime.boundaries;
    for (let i2 = boundaries.length - 1; i2 >= 0; i2--) {
      if (boundaries[i2].node === this) { boundaries.splice(i2, 1); break; }
    }
    await this.finalizeChildNodes();
    this.content = this.contentDecoder ? await this.contentDecoder.finalize() : null;
    this.state = "finished";
  }
  async finalizeChildNodes() {
    for (let childNode of this.childNodes) await childNode.finalize();
  }
  parseStructuredHeader(str) {
    let response = { value: false, params: {} };
    let key = false, value = "", stage = "value", quote = false, escaped = false, chr;
    for (let i2 = 0, len = str.length; i2 < len; i2++) {
      chr = str.charAt(i2);
      switch (stage) {
        case "key":
          if (chr === "=") { key = value.trim().toLowerCase(); stage = "value"; value = ""; break; }
          value += chr;
          break;
        case "value":
          if (escaped) value += chr;
          else if (chr === "\\") { escaped = true; continue; }
          else if (quote && chr === quote) quote = false;
          else if (!quote && chr === '"') quote = chr;
          else if (!quote && chr === ";") {
            if (key === false) response.value = value.trim();
            else response.params[key] = value.trim();
            stage = "key"; value = "";
          } else value += chr;
          escaped = false;
          break;
      }
    }
    value = value.trim();
    if (stage === "value") { if (key === false) response.value = value; else response.params[key] = value; }
    else if (value) response.params[value.toLowerCase()] = "";
    if (response.value) response.value = response.value.toLowerCase();
    decodeParameterValueContinuations(response);
    return response;
  }
  decodeFlowedText(str, delSp) {
    return str.split(/\r?\n/).reduce((prev, cur) => {
      if (/ $/.test(prev) && !/(^|\n)-- $/.test(prev)) return delSp ? prev.slice(0, -1) + cur : prev + cur;
      return prev + "\n" + cur;
    }).replace(/^ /gm, "");
  }
  getTextContent() {
    if (!this.content) return "";
    let str = getDecoder(this.contentType.parsed.params.charset).decode(this.content);
    if (/^flowed$/i.test(this.contentType.parsed.params.format)) str = this.decodeFlowedText(str, /^yes$/i.test(this.contentType.parsed.params.delsp));
    return str;
  }
  processHeaders() {
    for (let i2 = this.headerLines.length - 1; i2 >= 0; i2--) {
      let line = this.headerLines[i2];
      if (i2 && /^\s/.test(line)) {
        this.headerLines[i2 - 1] += "\n" + line;
        this.headerLines.splice(i2, 1);
      } else {
        line = line.replace(/\s+/g, " ");
        let sep = line.indexOf(":");
        let key = sep < 0 ? line.trim() : line.substr(0, sep).trim();
        let value = sep < 0 ? "" : line.substr(sep + 1).trim();
        this.headers.push({ key: key.toLowerCase(), originalKey: key, value });
        switch (key.toLowerCase()) {
          case "content-type": if (this.contentType.default) this.contentType = { value, parsed: {} }; break;
          case "content-transfer-encoding": this.contentTransferEncoding = { value, parsed: {} }; break;
          case "content-disposition": this.contentDisposition = { value, parsed: {} }; break;
          case "content-id": this.contentId = value; break;
          case "content-description": this.contentDescription = value; break;
        }
      }
    }
    this.contentType.parsed = this.parseStructuredHeader(this.contentType.value);
    this.contentType.multipart = /^multipart\//i.test(this.contentType.parsed.value) ? this.contentType.parsed.value.substr(this.contentType.parsed.value.indexOf("/") + 1) : false;
    if (this.contentType.multipart && this.contentType.parsed.params.boundary) {
      this.postalMime.boundaries.push({ value: textEncoder.encode(this.contentType.parsed.params.boundary), node: this });
    }
    this.contentDisposition.parsed = this.parseStructuredHeader(this.contentDisposition.value);
    this.contentTransferEncoding.encoding = this.contentTransferEncoding.value.toLowerCase().split(/[^\w-]/).shift();
    this.setupContentDecoder(this.contentTransferEncoding.encoding);
  }
  feed(line) {
    if (this.state === "header") {
      if (!line.length) { this.state = "body"; return this.processHeaders(); }
      this.headerLines.push(getDecoder().decode(line));
    } else if (this.state === "body") this.contentDecoder.update(line);
  }
};
var htmlEntities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": "\xA0" };
function decodeHTMLEntities(str) {
  return str.replace(/&(#\d+|#x[a-f0-9]+|[a-z]+\d*);?/gi, (match, entity) => {
    if (typeof htmlEntities[match] === "string") return htmlEntities[match];
    if (entity.charAt(0) !== "#" || match.charAt(match.length - 1) !== ";") return match;
    let codePoint = entity.charAt(1) === "x" ? parseInt(entity.substr(2), 16) : parseInt(entity.substr(1), 10);
    if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) return "\uFFFD";
    if (codePoint > 65535) {
      codePoint -= 65536;
      return String.fromCharCode((codePoint >>> 10) + 55296) + String.fromCharCode((codePoint & 1023) + 56320);
    }
    return String.fromCharCode(codePoint);
  });
}
__name(decodeHTMLEntities, "decodeHTMLEntities");
__name2(decodeHTMLEntities, "decodeHTMLEntities");
function escapeHtml(str) {
  return str.trim().replace(/[<>\"'?&]/g, (c) => "&#x" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0") + ";");
}
__name(escapeHtml, "escapeHtml");
__name2(escapeHtml, "escapeHtml");
function htmlToText(str) {
  str = str.replace(/\r?\n/g, "\u0001").replace(/<\!\-\-.*?\-\->/gi, " ").replace(/<br\b[^>]*>/gi, "\n").replace(/<\/?(p|div|table|tr|td|th)\b[^>]*>/gi, "\n\n").replace(/<script\b[^>]*>.*?<\/script\b[^>]*>/gi, " ").replace(/^.*<body\b[^>]*>/i, "").replace(/^.*<\/head\b[^>]*>/i, "").replace(/^.*<\!doctype\b[^>]*>/i, "").replace(/<\/body\b[^>]*>.*$/i, "").replace(/<\/html\b[^>]*>.*$/i, "").replace(/<a\b[^>]*href\s*=\s*["']?([^\s"']+)[^>]*>/gi, " ($1) ").replace(/<\/?(span|em|i|strong|b|u|a)\b[^>]*>/gi, "").replace(/<li\b[^>]*>[\n\u0001\s]*/gi, "* ").replace(/<hr\b[^>]*>/g, "\n-------------\n").replace(/<[^>]*>/g, " ").replace(/\u0001/g, "\n").replace(/[ \t]+/g, " ").replace(/^\s+$/gm, "").replace(/\n\n+/g, "\n\n").replace(/^\n+/, "\n").replace(/\n+$/, "\n");
  return decodeHTMLEntities(str);
}
__name(htmlToText, "htmlToText");
__name2(htmlToText, "htmlToText");
var PostalMime = class {
  static { __name(this, "PostalMime"); }
  static { __name2(this, "PostalMime"); }
  static parse(buf, options) {
    return new PostalMime(options).parse(buf);
  }
  constructor(options) {
    this.options = options || {};
    this.root = this.currentNode = new MimeNode({ postalMime: this });
    this.boundaries = [];
    this.textContent = {};
    this.attachments = [];
    this.attachmentEncoding = (this.options.attachmentEncoding || "arraybuffer").toString().replace(/[-_\s]/g, "").trim().toLowerCase() || "arraybuffer";
    this.started = false;
  }
  async finalize() {
    await this.root.finalize();
  }
  async processLine(line, isFinal) {
    let boundaries = this.boundaries;
    if (boundaries.length && line.length > 2 && line[0] === 45 && line[1] === 45) {
      for (let i2 = boundaries.length - 1; i2 >= 0; i2--) {
        let boundary = boundaries[i2];
        if (line.length !== boundary.value.length + 2 && line.length !== boundary.value.length + 4) continue;
        let isTerminator = line.length === boundary.value.length + 4;
        if (isTerminator && (line[line.length - 2] !== 45 || line[line.length - 1] !== 45)) continue;
        let match = true;
        for (let j = 0; j < boundary.value.length; j++) {
          if (line[j + 2] !== boundary.value[j]) { match = false; break; }
        }
        if (!match) continue;
        if (isTerminator) {
          await boundary.node.finalize();
          this.currentNode = boundary.node.parentNode || this.root;
        } else {
          await boundary.node.finalizeChildNodes();
          this.currentNode = new MimeNode({ postalMime: this, parentNode: boundary.node });
        }
        if (isFinal) return this.finalize();
        return;
      }
    }
    this.currentNode.feed(line);
    if (isFinal) return this.finalize();
  }
  readLine() {
    let startPos = this.readPos, endPos = this.readPos;
    const res = () => ({ bytes: new Uint8Array(this.buf, startPos, endPos - startPos), done: this.readPos >= this.av.length });
    while (this.readPos < this.av.length) {
      const c = this.av[this.readPos++];
      if (c !== 13 && c !== 10) endPos = this.readPos;
      if (c === 10) return res();
    }
    return res();
  }
  async processNodeTree() {
    let textContent = {};
    let textTypes = new Set();
    let textMap = this.textMap = new Map();
    let walk = async (node, alternative, related) => {
      alternative = alternative || false;
      related = related || false;
      if (!node.contentType.multipart) {
        if ((node.contentType.parsed.value === "text/html" || node.contentType.parsed.value === "text/plain") && node.contentDisposition.parsed.value !== "attachment") {
          let textType = node.contentType.parsed.value.split("/")[1];
          let selectorNode = alternative || node;
          if (!textMap.has(selectorNode)) textMap.set(selectorNode, {});
          let textEntry = textMap.get(selectorNode);
          textEntry[textType] = textEntry[textType] || [];
          textEntry[textType].push({ type: "text", value: node.getTextContent() });
          textTypes.add(textType);
        }
      } else if (node.contentType.multipart === "alternative") alternative = node;
      else if (node.contentType.multipart === "related") related = node;
      for (let childNode of node.childNodes) await walk(childNode, alternative, related);
    };
    await walk(this.root, false, false);
    textMap.forEach((mapEntry) => {
      textTypes.forEach((textType) => {
        if (!textContent[textType]) textContent[textType] = [];
        if (mapEntry[textType]) {
          mapEntry[textType].forEach((e) => {
            if (e.type === "text") textContent[textType].push(e.value);
          });
        } else {
          let alt = textType === "html" ? "plain" : "html";
          (mapEntry[alt] || []).forEach((e) => {
            if (e.type === "text") textContent[textType].push(textType === "html" ? e.value : htmlToText(e.value));
          });
        }
      });
    });
    Object.keys(textContent).forEach((k) => { textContent[k] = textContent[k].join("\n"); });
    this.textContent = textContent;
  }
  async parse(buf) {
    if (this.started) throw new Error("Can not reuse parser");
    this.started = true;
    if (buf && typeof buf.getReader === "function") {
      let chunks = [], chunkLen = 0;
      const reader = buf.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); chunkLen += value.length;
      }
      buf = new Uint8Array(chunkLen);
      let p = 0;
      for (let c of chunks) { buf.set(c, p); p += c.length; }
    }
    buf = buf || new ArrayBuffer(0);
    if (typeof buf === "string") buf = textEncoder.encode(buf);
    if (buf instanceof Blob || Object.prototype.toString.call(buf) === "[object Blob]") buf = await blobToArrayBuffer(buf);
    if (buf.buffer instanceof ArrayBuffer) buf = new Uint8Array(buf).buffer;
    this.buf = buf;
    this.av = new Uint8Array(buf);
    this.readPos = 0;
    while (this.readPos < this.av.length) {
      const line = this.readLine();
      await this.processLine(line.bytes, line.done);
    }
    await this.processNodeTree();
    const message = { headers: this.root.headers.map((e) => ({ key: e.key, value: e.value })).reverse() };
    for (const key of ["from", "sender"]) {
      const h = this.root.headers.find((l) => l.key === key);
      if (h && h.value) message[key] = h.value;
    }
    for (const key of ["to", "cc", "bcc"]) {
      const h = this.root.headers.find((l) => l.key === key);
      if (h && h.value) message[key] = h.value;
    }
    const subjectHeader = this.root.headers.find((l) => l.key === "subject");
    if (subjectHeader && subjectHeader.value) message.subject = decodeWords(subjectHeader.value);
    if (this.textContent && this.textContent.plain) message.text = this.textContent.plain;
    if (this.textContent && this.textContent.html) message.html = this.textContent.html;
    return message;
  }
};
export default {
  async email(message, env, ctx) {
    try {
      const parser = new PostalMime();
      const email = await parser.parse(message.raw);
      const fromHeader = message.headers.get("From");
      const fromEmailMatch = fromHeader && fromHeader.match(/<([^>]+)>/);
      const originalSender = fromEmailMatch ? fromEmailMatch[1] : fromHeader;
      const payload = {
        from: message.from,
        to: message.to,
        subject: email.subject || "",
        body: email.text || (email.html ? htmlToText(email.html) : "[EMPTY BODY]"),
        original_sender: originalSender || "[UNKNOWN]",
        input_type: "email"
      };
      console.log("Parsed original_sender:", originalSender);
      console.log("Payload to send:", JSON.stringify(payload));
      const res = await fetch("https://hearsay.email/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const responseText = await res.text();
      console.log("Sent to backend:", responseText);
      return new Response("Email processed successfully");
    } catch (err) {
      console.error("Error parsing email:", err);
      return new Response("Worker error: " + err.message, { status: 500 });
    }
  }
};
