/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const sha256 = require("crypto-js/sha256");
const CryptoJS = require("crypto-js");
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

function VerifyECDSA(data, publickey, signature){
    const key = ec.keyFromPublic(publickey, "hex")
    const hash = sha256(CryptoJS.enc.Hex.parse(data)).toString()
    return key.verify(hash, signature)
}

function SignECDSA(input ,privatekey){
    const key = ec.keyFromPrivate(privatekey, "hex")
    const hash = sha256(CryptoJS.enc.Hex.parse(input)).toString()
    return key.sign(hash).toDER("hex")
}


/**
 *
 * @param {Int} input
 * @returns
 */
function Int_To_HexString(input){
    return (input.toString(16)).padStart(2, "0")
}

function Uint64_To_HexString(input){
    return (input.toString(16)).padStart(16, "0")
}

function Uint32_To_HexString(input){
    return (input.toString(16)).padStart(8, "0")
}


function Uint16_To_HexString(input){
    return (input.toString(16)).padStart(4, "0")
}

function HexString_To_String(input){
    return Buffer.from(input, "hex").toString()
}

function HexString_To_Int(input){
    return parseInt(input, 16)
}

/**
 *
 * @param {String} input
 * @returns
 */
function String_To_HexString(input){
    let _hexString= "";
    for(let i=0; i < input.length; i++){
        _hexString += (input.charCodeAt(i).toString(16)).padStart(2, "0")
    }
    return _hexString
}

function Hex_To_Binary(hex: string) {
    let binary = "";
    for (let i = 0; i < hex.length; i++) {
      const decimal = parseInt(hex[i], 16);
      const binaryChunk = decimal.toString(2).padStart(4, "0");
      binary += binaryChunk;
    }
    return binary;
}

export default  {
    SignECDSA,
    VerifyECDSA,
    Int_To_HexString,
    String_To_HexString,
    HexString_To_String,
    Uint64_To_HexString,
    Uint32_To_HexString,
    Uint16_To_HexString,
    HexString_To_Int,
    Hex_To_Binary
}