import AWS from "aws-sdk";
import HmacSHA256 from "crypto-js/hmac-sha256";
import SHA256 from "crypto-js/sha256";
import encHex from "crypto-js/enc-hex";
import { ClientArgs } from "./types";

export async function getAWSCredentials({
  region,
  identityPoolId,
}: {
  region: string;
  identityPoolId: string;
}): Promise<AWS.Credentials> {
  AWS.config.region = region;
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: identityPoolId,
  });
  return new Promise((resolve, reject) => {
    AWS.config.getCredentials((err) => {
      if (err) {
        return reject(err);
      }
      return resolve(AWS.config.credentials as AWS.Credentials);
    });
  });
}

const Crypto = {
  sign: function (
    key: string | CryptoJS.lib.WordArray,
    msg: string | CryptoJS.lib.WordArray
  ) {
    const hash = HmacSHA256(msg, key);
    return hash.toString(encHex);
  },
  sha256: function (msg: string | CryptoJS.lib.WordArray) {
    const hash = SHA256(msg);
    return hash.toString(encHex);
  },
  getSignatureKey: function (
    key: string | CryptoJS.lib.WordArray,
    dateStamp: string | CryptoJS.lib.WordArray,
    regionName: string,
    serviceName: string
  ) {
    const kDate = HmacSHA256(dateStamp, "AWS4" + key);
    const kRegion = HmacSHA256(regionName, kDate);
    const kService = HmacSHA256(serviceName, kRegion);
    const kSigning = HmacSHA256("aws4_request", kService);
    return kSigning;
  },
};

export function getAWSIotEndpoint({
  accessKeyId,
  secretAccessKey,
  sessionToken,
  region,
  mqttId,
}: ClientArgs) {
  // example: blahblahblah-ats.iot.your-region.amazonaws.com
  const IOT_ENDPOINT = `${mqttId}.iot.${region}.amazonaws.com`;

  // your AWS access key ID
  const KEY_ID = accessKeyId;

  // your AWS secret access key
  const SECRET_KEY = secretAccessKey;

  // date & time
  const dt = new Date().toISOString().replace(/[^0-9]/g, "");
  const ymd = dt.slice(0, 8);
  const fdt = `${ymd}T${dt.slice(8, 14)}Z`;

  const scope = `${ymd}/${region}/iotdevicegateway/aws4_request`;

  const ks = encodeURIComponent(`${KEY_ID}/${scope}`);

  const algorithm = "X-Amz-Algorithm=AWS4-HMAC-SHA256";
  const credentials = `X-Amz-Credential=${ks}`;
  const date = `X-Amz-Date=${fdt}`;
  const baseQueryString = `${algorithm}&${credentials}&${date}&X-Amz-SignedHeaders=host`;

  const request = `GET\n/mqtt\n${baseQueryString}\nhost:${IOT_ENDPOINT}\n\nhost\n${Crypto.sha256(
    ""
  )}`;

  const signature = Crypto.sign(
    Crypto.getSignatureKey(SECRET_KEY, ymd, region, "iotdevicegateway"),
    `AWS4-HMAC-SHA256\n${fdt}\n${scope}\n${Crypto.sha256(request)}`
  );
  const securityToken = encodeURIComponent(sessionToken);
  const signatureQueryString = `&X-Amz-Signature=${signature}`;
  const securityQueryString = `&X-Amz-Security-Token=${securityToken}`;

  return `wss://${IOT_ENDPOINT}/mqtt?${baseQueryString}${signatureQueryString}${securityQueryString}`;
}
