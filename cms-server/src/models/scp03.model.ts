'use strict';

import { Schema } from "redis-om";

const Scp03InitSchema = new Schema(
  "scp03init",
  {
    Key_MAC: { type: "string" },
    Key_ENC: { type: "string" },
    Key_DEK: { type: "string" },
    aid: { type: "string" },
    SCP03Success: { type: "boolean" },
    cardChallengeFlag: { type: "boolean" },
    cardCryptogramFlag: { type: "boolean" },

    //card
    card_keyDiversification: { type: "string" },
    card_keyInfomation: { type: "string" },
    card_cardChallenge: { type: "string" },
    card_cardCryptogram: { type: "string" },
    card_sequenceCounter: { type: "string" },
    card_aid: { type: "string" },

    //host
    host_hostChallenge: { type: "string" },
    host_cardChallenge: { type: "string" },
    host_cardCryptogram: { type: "string" },
    host_hostCryptogram: { type: "string" },
    host_MacChaining: { type: "string" },
    host_S_MAC: { type: "string" },
    host_S_ENC: { type: "string" },
    host_S_RMAC: { type: "string" },
    host_Key_MAC: { type: "string" },
    host_Key_ENC: { type: "string" },
    host_Key_DEK: { type: "string" },
    host_ICV: { type: "string" },
    host_EncryptCounter: { type: "number" },

    //diffie helman
    sharedSecret: { type: "string" },
  },
  {
    dataStructure: "HASH",
  }
);

export default Scp03InitSchema;
