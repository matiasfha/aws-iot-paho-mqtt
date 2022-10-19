export type CryptoString = string | CryptoJS.lib.WordArray;

export type BaseArgs = {
  region: string;
  mqttId: string;
  identityPoolId: string;
};
export type ClientArgs = Pick<
  AWS.Credentials,
  "accessKeyId" | "secretAccessKey" | "sessionToken"
> &
  Omit<BaseArgs, "identityPoolId"> & { clientId: string };
