import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal'
]);

export async function assertSafeHttpUrl(value, options = {}) {
  const {
    allowPrivateHosts = false,
    lookup = dns.lookup
  } = options;
  const url = parseHttpUrl(value);
  const hostname = url.hostname.toLowerCase();

  if (!allowPrivateHosts && isBlockedHostname(hostname)) {
    throw httpError('Recipe URL host is not allowed.', 400);
  }

  if (allowPrivateHosts) return url;

  const ips = await resolveHostIps(hostname, lookup);
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw httpError('Recipe URL resolves to a private or internal network.', 400);
    }
  }

  return url;
}

export function parseHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw httpError('Enter a valid recipe URL.', 400);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw httpError('Recipe URL must start with http:// or https://.', 400);
  }

  if (!url.hostname) {
    throw httpError('Recipe URL must include a host.', 400);
  }

  return url;
}

export function isBlockedHostname(hostname) {
  return BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost');
}

export function isBlockedIp(ip) {
  const mappedIpv4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);

  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);

  return true;
}

async function resolveHostIps(hostname, lookup) {
  if (net.isIP(hostname)) return [hostname];

  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((result) => result.address).filter(Boolean);
  } catch {
    throw httpError('Could not resolve recipe URL host.', 400);
  }
}

function isBlockedIpv4(ip) {
  const value = ipv4ToNumber(ip);
  return inCidr(value, '0.0.0.0', 8)
    || inCidr(value, '10.0.0.0', 8)
    || inCidr(value, '100.64.0.0', 10)
    || inCidr(value, '127.0.0.0', 8)
    || inCidr(value, '169.254.0.0', 16)
    || inCidr(value, '172.16.0.0', 12)
    || inCidr(value, '192.0.0.0', 24)
    || inCidr(value, '192.0.2.0', 24)
    || inCidr(value, '192.168.0.0', 16)
    || inCidr(value, '198.18.0.0', 15)
    || inCidr(value, '198.51.100.0', 24)
    || inCidr(value, '203.0.113.0', 24)
    || inCidr(value, '224.0.0.0', 4)
    || inCidr(value, '240.0.0.0', 4);
}

function isBlockedIpv6(ip) {
  const normalized = ip.toLowerCase();
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
}

function inCidr(value, baseIp, bits) {
  const base = ipv4ToNumber(baseIp);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

function ipv4ToNumber(ip) {
  return ip.split('.')
    .map((part) => Number(part))
    .reduce((value, part) => ((value << 8) + part) >>> 0, 0);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
