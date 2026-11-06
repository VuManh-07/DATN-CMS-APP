"use strict";

import dns from "dns";
import net from "net";

/**
 * Point Node's DNS resolver at explicit servers when the system config is
 * unusable.
 *
 * Node resolves SRV records with c-ares, using its own server list rather than
 * the OS resolver. On some Windows setups c-ares cannot read the adapter
 * configuration and silently falls back to 127.0.0.1; if nothing is listening
 * there, every SRV lookup fails with:
 *
 *   querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
 *
 * Plain hostname lookups keep working in that state, because those go through
 * dns.lookup()/getaddrinfo and therefore the OS resolver — which is why Redis
 * connects while `mongodb+srv://` does not. The symptom looks like an Atlas or
 * credentials problem but is neither.
 *
 * Set DNS_SERVERS (comma-separated) to override. Left unset, this only warns:
 * redirecting DNS traffic is the operator's decision, not a silent default.
 */

const isLoopback = (address: string) => {
  const host = address.replace(/^\[|\]$/g, "").split("%")[0];
  return (
    host === "::1" ||
    (net.isIPv4(host) && host.startsWith("127."))
  );
};

export const applyDnsServers = (): void => {
  const configured = (process.env.DNS_SERVERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured.length) {
    try {
      dns.setServers(configured);
      console.log(`[dns] resolver set to ${configured.join(", ")}`);
    } catch (err: any) {
      console.error(`[dns] invalid DNS_SERVERS (${err.message}); keeping system resolver`);
    }
    return;
  }

  const current = dns.getServers();
  if (current.length && current.every(isLoopback)) {
    console.warn(
      "[dns] Node's resolver list is loopback-only " +
        `(${current.join(", ")}). SRV lookups will fail, so a ` +
        "mongodb+srv:// URL cannot connect. Set DNS_SERVERS=8.8.8.8,1.1.1.1 " +
        "in .env, or use a non-SRV mongodb:// connection string."
    );
  }
};

export default applyDnsServers;
