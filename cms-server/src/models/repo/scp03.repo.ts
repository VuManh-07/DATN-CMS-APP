"use strict";

import { Repository } from "redis-om";
import Scp03InitSchema from "../scp03.model";
import { getRedis } from "../../dbs/redis.init";
import config from "../../configs/config.env";

/**
 * Live SCP03 session state, kept in Redis.
 *
 * Sessions carry session keys, so they must not linger: every save refreshes a
 * TTL (SCP03_SESSION_TTL_SECONDS). If an operator abandons the wizard midway,
 * the session expires on its own instead of staying open indefinitely.
 */
const SESSION_TTL = config.scp03.sessionTtlSeconds;

/** Pull the redis-om entityId out of a saved entity. */
const entityIdOf = (entity: any): string => {
  const symbol = Object.getOwnPropertySymbols(entity).find(
    (s) => s.toString() === "Symbol(entityId)"
  );
  return entity[symbol as any];
};

const saveScp03Init = async (payload: any) => {
  const redisInstance = getRedis().instanceConnectRedis;

  const scp03Repository = new Repository(Scp03InitSchema, redisInstance);

  const saved = await scp03Repository.save({
    Key_MAC: payload.Key_MAC,
    Key_ENC: payload.Key_ENC,
    Key_DEK: payload.Key_DEK,
    aid: payload.aid,
    SCP03Success: payload.SCP03Success,
    cardChallengeFlag: payload.cardChallengeFlag,
    cardCryptogramFlag: payload.cardCryptogramFlag,

    //card
    card_keyDiversification: payload.CardSCP03.keyDiversification,
    card_keyInfomation: payload.CardSCP03.keyInfomation,
    card_cardChallenge: payload.CardSCP03.cardChallenge,
    card_cardCryptogram: payload.CardSCP03.cardCryptogram,
    card_sequenceCounter: payload.CardSCP03.sequenceCounter,
    card_aid: payload.CardSCP03.aid,

    //host
    host_hostChallenge: payload.HostSCP03.hostChallenge,
    host_cardChallenge: payload.HostSCP03.cardChallenge,
    host_cardCryptogram: payload.HostSCP03.cardCryptogram,
    host_hostCryptogram: payload.HostSCP03.hostCryptogram,
    host_MacChaining: payload.HostSCP03.MacChaining,
    host_S_MAC: payload.HostSCP03.S_MAC,
    host_S_ENC: payload.HostSCP03.S_ENC,
    host_S_RMAC: payload.HostSCP03.S_RMAC,
    host_Key_MAC: payload.HostSCP03.Key_MAC,
    host_Key_ENC: payload.HostSCP03.Key_ENC,
    host_Key_DEK: payload.HostSCP03.Key_DEK,
    host_ICV: payload.HostSCP03.ICV,
    host_EncryptCounter: payload.HostSCP03.EncryptCounter,

    //diffie helman
    sharedSecret: payload.sharedSecret,
  });

  await scp03Repository.expire(entityIdOf(saved), SESSION_TTL);
  return saved;
};

const getScp03Init = async (id: string) => {
  const redisInstance = getRedis().instanceConnectRedis;

  const scp03Repository = new Repository(Scp03InitSchema, redisInstance);

  const scp03init = await scp03Repository.fetch(id);

  return {
    Key_MAC: scp03init.Key_MAC,
    Key_ENC: scp03init.Key_ENC,
    Key_DEK: scp03init.Key_DEK,
    aid: scp03init.aid,
    SCP03Success: scp03init.SCP03Success,
    cardChallengeFlag: scp03init.cardChallengeFlag,
    cardCryptogramFlag: scp03init.cardCryptogramFlag,

    //card
    CardSCP03: {
      keyDiversification: scp03init.card_keyDiversification,
      keyInfomation: scp03init.card_keyInfomation,
      cardChallenge: scp03init.card_cardChallenge,
      cardCryptogram: scp03init.card_cardCryptogram,
      sequenceCounter: scp03init.card_sequenceCounter,
      aid: scp03init.card_aid,
    },

    //host
    HostSCP03: {
      hostChallenge: scp03init.host_hostChallenge,
      cardChallenge: scp03init.host_cardChallenge,
      cardCryptogram: scp03init.host_cardCryptogram,
      hostCryptogram: scp03init.host_hostCryptogram,
      MacChaining: scp03init.host_MacChaining,
      S_MAC: scp03init.host_S_MAC,
      S_ENC: scp03init.host_S_ENC,
      S_RMAC: scp03init.host_S_RMAC,
      Key_MAC: scp03init.host_Key_MAC,
      Key_ENC: scp03init.host_Key_ENC,
      Key_DEK: scp03init.host_Key_DEK,
      ICV: scp03init.host_ICV
        ? JSON.parse(scp03init.host_ICV as any)
        : undefined,
      EncryptCounter: scp03init.host_EncryptCounter,
    },

    //diffie helman
    sharedSecret: scp03init.sharedSecret,
  };
};

const updateScp03Init = async (id: string, updatedData: any) => {
  try {
    const redisInstance = getRedis().instanceConnectRedis;

    const scp03Repository = new Repository(Scp03InitSchema, redisInstance);

    const scp03 = await scp03Repository.fetch(id);
    Object.assign(scp03, {
      Key_MAC: updatedData.Key_MAC,
      Key_ENC: updatedData.Key_ENC,
      Key_DEK: updatedData.Key_DEK,
      aid: updatedData.aid,
      SCP03Success: updatedData.SCP03Success,
      cardChallengeFlag: updatedData.cardChallengeFlag,
      cardCryptogramFlag: updatedData.cardCryptogramFlag,

      //card
      card_keyDiversification: updatedData.CardSCP03.keyDiversification,
      card_keyInfomation: updatedData.CardSCP03.keyInfomation,
      card_cardChallenge: updatedData.CardSCP03.cardChallenge,
      card_cardCryptogram: updatedData.CardSCP03.cardCryptogram,
      card_sequenceCounter: updatedData.CardSCP03.sequenceCounter,
      card_aid: updatedData.CardSCP03.aid,

      //host
      host_hostChallenge: updatedData.HostSCP03.hostChallenge,
      host_cardChallenge: updatedData.HostSCP03.cardChallenge,
      host_cardCryptogram: updatedData.HostSCP03.cardCryptogram,
      host_hostCryptogram: updatedData.HostSCP03.hostCryptogram,
      host_MacChaining: updatedData.HostSCP03.MacChaining,
      host_S_MAC: updatedData.HostSCP03.S_MAC,
      host_S_ENC: updatedData.HostSCP03.S_ENC,
      host_S_RMAC: updatedData.HostSCP03.S_RMAC,
      host_Key_MAC: updatedData.HostSCP03.Key_MAC,
      host_Key_ENC: updatedData.HostSCP03.Key_ENC,
      host_Key_DEK: updatedData.HostSCP03.Key_DEK,
      host_ICV: JSON.stringify(updatedData.HostSCP03.ICV),
      host_EncryptCounter: updatedData.HostSCP03.EncryptCounter,

      //diffie helman
      // NOTE: the original demo wrote `updatedData.SharedSecret` (capital S)
      // here, which is undefined on the Scp03 class and therefore erased the
      // shared secret on the first update after hostChallenge.
      sharedSecret: updatedData.sharedSecret,
    });
    const saved = await scp03Repository.save(scp03);
    // Refresh the TTL on every step so an in-progress session stays alive.
    await scp03Repository.expire(id, SESSION_TTL);
    return saved;
  } catch (error) {
    console.log(error, "error");
    throw error;
  }
};

const deleteScp03Init = async (id: string) => {
  const redisInstance = getRedis().instanceConnectRedis;

  const scp03Repository = new Repository(Scp03InitSchema, redisInstance);

  return await scp03Repository.remove(id);
};

export {
  saveScp03Init,
  getScp03Init,
  updateScp03Init,
  deleteScp03Init,
  entityIdOf,
};
