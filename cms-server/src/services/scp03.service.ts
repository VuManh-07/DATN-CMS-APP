"use strict";

import { AesCmac } from "aes-cmac";
import CryptoJS from "crypto-js";

const macKey = new Uint8Array(16);

export class Scp03Init {
  [x: string]: any;
  constructor({ Key_MAC, Key_ENC, Key_DEK, aid, sharedSecret }) {
    this.Key_MAC = Key_MAC;
    this.Key_ENC = Key_ENC;
    this.Key_DEK = Key_DEK;
    this.aid = aid;
    this.SCP03Success = false;
    this.cardChallengeFlag = false;
    this.cardCryptogramFlag = false;
    this.CardSCP03 = {
      keyDiversification: null,
      keyInfomation: null,
      cardChallenge: "",
      cardCryptogram: "",
      sequenceCounter: null,
      aid: this.aid,
    };
    this.HostSCP03 = {
      hostChallenge: "",
      cardChallenge: "",
      cardCryptogram: "",
      hostCryptogram: "",
      MacChaining: "00000000000000000000000000000000",
      S_MAC: "",
      S_ENC: "",
      S_RMAC: "",
      Key_MAC: this.Key_MAC,
      Key_ENC: this.Key_ENC,
      Key_DEK: this.Key_DEK,
      // FUNC_SMAC: new AesCmac(macKey),
      // FUNC_SENC: null,
      // FUNC_RMAC: new AesCmac(macKey),
      ICV: null,
      EncryptCounter: 0,
    };
    this.sharedSecret = sharedSecret;
  }
}

export class Scp03 {
  [x: string]: any;
  constructor(scp03init: Scp03Init) {
    this.Key_MAC = scp03init.Key_MAC;
    this.Key_ENC = scp03init.Key_ENC;
    this.Key_DEK = scp03init.Key_DEK;
    this.aid = scp03init.aid;
    this.SCP03Success = scp03init.SCP03Success;
    this.cardChallengeFlag = scp03init.cardChallengeFlag;
    this.cardCryptogramFlag = scp03init.cardCryptogramFlag;
    this.CardSCP03 = scp03init.CardSCP03;
    this.HostSCP03 = scp03init.HostSCP03;
    this.sharedSecret = scp03init.sharedSecret;
  }
  Reset() {
    this.SCP03Success = false;
    this.cardChallengeFlag = false;
    this.cardCryptogramFlag = false;
    this.CardSCP03.keyDiversification = null;
    this.CardSCP03.keyInfomation = null;
    this.CardSCP03.cardChallenge = "";
    this.CardSCP03.cardCryptogram = "";
    this.CardSCP03.sequenceCounter = null;

    this.HostSCP03.MacChaining = "00000000000000000000000000000000";
    this.HostSCP03.hostChallenge = "";
    this.HostSCP03.cardChallenge = "";
    this.HostSCP03.cardCryptogram = "";
    this.HostSCP03.hostCryptogram = "";
    this.HostSCP03.S_ENC = "";
    this.HostSCP03.S_ENC = "";
    this.HostSCP03.S_RMAC = "";
    this.HostSCP03.ICV = null;
    this.HostSCP03.EncryptCounter = 0;
  }
  DataDerivationScheme(
    derivationConstant: string,
    L: string,
    context_1: string,
    context_2: string
  ) {
    const label = "0000000000000000000000" + derivationConstant;
    const separationIndicator = "00";
    const i = "01";
    const context = context_1 + context_2;
    return label + separationIndicator + L + i + context;
  }
  async SessionKey() {
    /**
     * Calculator Session Key
     */
    const aesCmac_enc = new AesCmac(Buffer.from(this.HostSCP03.Key_ENC, "hex"));
    this.HostSCP03.S_ENC = await aesCmac_enc.calculate(
      Buffer.from(
        this.DataDerivationScheme(
          "04",
          "0080",
          this.HostSCP03.hostChallenge,
          this.CardSCP03.cardChallenge
        ),
        "hex"
      )
    );

    const aesCmac_mac = new AesCmac(Buffer.from(this.HostSCP03.Key_MAC, "hex"));
    this.HostSCP03.S_MAC = await aesCmac_mac.calculate(
      Buffer.from(
        this.DataDerivationScheme(
          "06",
          "0080",
          this.HostSCP03.hostChallenge,
          this.CardSCP03.cardChallenge
        ),
        "hex"
      )
    );
    this.HostSCP03.S_RMAC = await aesCmac_mac.calculate(
      Buffer.from(
        this.DataDerivationScheme(
          "07",
          "0080",
          this.HostSCP03.hostChallenge,
          this.CardSCP03.cardChallenge
        ),
        "hex"
      )
    );

    this.HostSCP03.S_ENC = Buffer.from(this.HostSCP03.S_ENC).toString("hex");
    this.HostSCP03.S_MAC = Buffer.from(this.HostSCP03.S_MAC).toString("hex");
    this.HostSCP03.S_RMAC = Buffer.from(this.HostSCP03.S_RMAC).toString("hex");

    return;
  }
  async CompareCardChallenge() {
    /**
     * Calculator Card Challenge from Host
     */
    const aesCmac_enc = new AesCmac(Buffer.from(this.HostSCP03.Key_ENC, "hex"));
    this.HostSCP03.cardChallenge = await aesCmac_enc.calculate(
      Buffer.from(
        this.DataDerivationScheme(
          "02",
          "0040",
          this.CardSCP03.sequenceCounter,
          this.CardSCP03.aid
        ),
        "hex"
      )
    );
    this.HostSCP03.cardChallenge = Buffer.from(
      this.HostSCP03.cardChallenge
    ).toString("hex");

    /**
     * Compare Card Challenge
     */
    if (
      this.HostSCP03.cardChallenge.slice(0, 16) == this.CardSCP03.cardChallenge
    ) {
      this.cardChallengeFlag = true;
      console.log("Card Challenge Valid");
    } else {
      this.cardChallengeFlag = false;
      console.log("Card Challenge Invalid");
    }
    return;
  }
  async CompareCardCryptogram() {
    /**
     * Calculator Card Cryptogram from Host
     */
    const aesCmac_smac = new AesCmac(Buffer.from(this.HostSCP03.S_MAC, "hex"));
    this.HostSCP03.cardCryptogram = await aesCmac_smac.calculate(
      Buffer.from(
        this.DataDerivationScheme(
          "00",
          "0040",
          this.HostSCP03.hostChallenge,
          this.CardSCP03.cardChallenge
        ),
        "hex"
      )
    );
    this.HostSCP03.cardCryptogram = Buffer.from(
      this.HostSCP03.cardCryptogram
    ).toString("hex");

    /**
     * Compare Card Cryptogram
     */
    if (
      this.HostSCP03.cardCryptogram.slice(0, 16) ==
      this.CardSCP03.cardCryptogram
    ) {
      this.cardCryptogramFlag = true;
      console.log("Card Cryptogram Valid");
    } else {
      this.cardCryptogramFlag = false;
      console.log("Card Cryptogram Invalid");
    }

    return;
  }
  async InitHostSCP03(cardParam: string) {
    try {
      this.CardSCP03.keyDiversification = cardParam.slice(0, 20);
      this.CardSCP03.keyInfomation = cardParam.slice(20, 26);
      this.CardSCP03.cardChallenge = cardParam.slice(26, 42);
      this.CardSCP03.cardCryptogram = cardParam.slice(42, 58);
      this.CardSCP03.sequenceCounter = cardParam.slice(58, 64);

      await this.SessionKey();
      await this.CompareCardChallenge();
      await this.CompareCardCryptogram();

      return {
        cardChallengeFlag: this.cardChallengeFlag,
        cardCryptogramFlag: this.cardCryptogramFlag,
      };
    } catch (error) {
      throw error;
    }
  }
  async HostCryptogram() {
    /**
     * Calculator Host Cryptogram
     */
    const aesCmac_smac = new AesCmac(Buffer.from(this.HostSCP03.S_MAC, "hex"));
    this.HostSCP03.hostCryptogram = await aesCmac_smac.calculate(
      Buffer.from(
        this.DataDerivationScheme(
          "01",
          "0040",
          this.HostSCP03.hostChallenge,
          this.CardSCP03.cardChallenge
        ),
        "hex"
      )
    );
    this.HostSCP03.hostCryptogram = Buffer.from(
      this.HostSCP03.hostCryptogram
    ).toString("hex");
    console.log("Host Cryptogram:", this.HostSCP03.hostCryptogram);
    return {
      hostCryptogram: this.HostSCP03.hostCryptogram,
    };
  }
  async HostChallenge() {
    const dataInt = Math.floor(Math.random() * 1000000000000000);
    let dataHex = dataInt.toString(16);
    dataHex = dataHex.padStart(16, "0");
    this.HostSCP03.hostChallenge = dataHex;
    return { hostChallenge: dataHex };
  }
  Encrypt(_data: string) {
    if (this.SCP03Success == false) return false;
    const key = CryptoJS.enc.Hex.parse(this.HostSCP03.S_ENC);
    let _EnCounter: any = this.HostSCP03.EncryptCounter.toString(16);
    _EnCounter = _EnCounter.padStart(32, "0");
    _EnCounter = CryptoJS.enc.Hex.parse(_EnCounter.padStart(32, "0"));
    this.HostSCP03.ICV = CryptoJS.AES.encrypt(_EnCounter, key, {
      iv: CryptoJS.enc.Hex.parse("00000000000000000000000000000000"),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding,
    }).ciphertext.toString();

    /**
     * Calculator Encrypt Data
     */
    this.HostSCP03.ICV = CryptoJS.enc.Hex.parse(this.HostSCP03.ICV);
    const data = CryptoJS.enc.Hex.parse(_data);
    var encrypted = CryptoJS.AES.encrypt(data, key, {
      iv: this.HostSCP03.ICV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Iso97971,
    }).ciphertext.toString();
    return encrypted;
  }
  Decrypt(data: string) {
    if (this.SCP03Success == false) return false;

    const key = CryptoJS.enc.Hex.parse(this.HostSCP03.S_ENC);
    /**
     * Calculator Vector V
     */
    let _EnCounter: any = this.HostSCP03.EncryptCounter.toString(16);
    _EnCounter = _EnCounter.padStart(30, "0");
    _EnCounter = _EnCounter.padStart(32, "80");

    _EnCounter = CryptoJS.enc.Hex.parse(_EnCounter);
    this.HostSCP03.ICV = CryptoJS.AES.encrypt(_EnCounter, key, {
      iv: CryptoJS.enc.Hex.parse("00000000000000000000000000000000"),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding,
    }).ciphertext.toString();
    this.HostSCP03.ICV = CryptoJS.enc.Hex.parse(this.HostSCP03.ICV);

    var decrypted = CryptoJS.AES.decrypt(data, key, {
      iv: this.HostSCP03.ICV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Iso97971,
      format: CryptoJS.format.Hex,
    }).toString();

    return decrypted;
  }
  async GenerateCMAC(command: string, data: string) {
    let CLA = command.slice(0, 2);
    let P = command.slice(2, 8);
    let Lc: any = data.length / 2;

    CLA = (parseInt(CLA, 16) + 4).toString(16);
    Lc = (Lc + 8).toString(16);

    CLA = CLA.padStart(2, "0");
    Lc = Lc.padStart(2, "0");
    const _cmd = CLA + P + Lc + data;
    const FUNC_SMAC = new AesCmac(Buffer.from(this.HostSCP03.S_MAC, "hex"));
    const _HostSCP03MacChaining = await FUNC_SMAC.calculate(
      Buffer.from(this.HostSCP03.MacChaining + _cmd, "hex")
    );
    this.HostSCP03.MacChaining = Buffer.from(_HostSCP03MacChaining).toString(
      "hex"
    );

    return {
      generateCMAC: _cmd + this.HostSCP03.MacChaining.slice(0, 16),
    };
  }
  async Wrap(command: string, data?: string | null) {
    try {
      this.HostSCP03.EncryptCounter += 1;
      // Encrypt() returns false when the channel is not established.
      const _data: any = data ? this.Encrypt(data) : "";
      const { generateCMAC } = await this.GenerateCMAC(command, _data);
      return generateCMAC;
    } catch (error) {
      console.log(error, "error");
      throw error;
    }
  }
  async Unwrap(response: string) {
    const dataSplit: any = this.SplitResponse(response);
    if (
      (await this.VerifyRMAC(dataSplit.data, dataSplit.rmac, dataSplit.sw)) ==
      false
    ) {
      return dataSplit;
    }
    if (dataSplit.data != "") dataSplit.data = this.Decrypt(dataSplit.data);

    return dataSplit;
  }
  SplitResponse(response: string) {
    let len: number;
    let data: string;
    if (response.length == 20) len = 0;
    else if (response.length > 20) len = response.length - 4 - 16;
    else return false;
    if (len == 0) data = "";
    else data = response.slice(0, len);
    const rmac = response.slice(len, len + 16);
    const sw = response.slice(len + 16, len + 20);
    return { data: data, rmac: rmac, sw: sw };
  }
  async VerifyRMAC(data: string, rmac: string, sw: string) {
    if (this.SCP03Success == false) return false;
    const FUNC_RMAC = new AesCmac(Buffer.from(this.HostSCP03.S_RMAC, "hex"));
    const _rmac1 = await FUNC_RMAC.calculate(
      Buffer.from(this.HostSCP03.MacChaining + data + sw, "hex")
    );
    const _rmac = Buffer.from(_rmac1).toString("hex").slice(0, 16);
    if (_rmac == rmac) {
      return true;
    } else {
      this.Reset();
      return false;
    }
  }
  ChannelFinish(authResponse: string) {
    if (
      authResponse === "9000" &&
      this.cardChallengeFlag == true &&
      this.cardCryptogramFlag == true
    ) {
      this.SCP03Success = true;
      console.log("Init Secure Channel Success");
      return true;
    } else {
      this.SCP03Success = false;
      console.log("Init Secure Channel Failure");
      return false;
    }
  }
  isEnableSecureChannel() {
    return this.SCP03Success;
  }
}
